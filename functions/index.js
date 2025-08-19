const functions = require("firebase-functions");
const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { onSchedule } = require("firebase-functions/v2/scheduler");
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const cors = require('cors');

// --- Konfiguracja ---
const app = express();

// Użyj Firebase Secrets (bezpieczne)
const JWT_SECRET = process.env.JWT_SECRET;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MIGRATION_SECRET_KEY = process.env.MIGRATION_SECRET_KEY;


// --- Inicjalizacja Firebase ---
// Inicjalizacja w środowisku Firebase Functions jest automatyczna
// pod warunkiem, że aplikacja jest poprawnie skonfigurowana.
// Nie ma potrzeby ręcznego ładowania credentials.
if (getApps().length === 0) {
    initializeApp();
}
const db = getFirestore();
const usersCollection = db.collection('users');
const purchasesCollection = db.collection('expenses');
const recurringExpensesCollection = db.collection('recurringExpenses');

// --- Inicjalizacja Gemini AI ---
const gemini = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = gemini.getGenerativeModel({ model: "gemini-1.5-flash" });

// --- Middleware ---
// Użyj cors z opcjami, aby zezwolić na żądania z Twojej domeny Firebase
app.use(cors({ origin: true }));
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// --- Funkcje pomocnicze ---
const DEFAULT_CATEGORIES = ['spożywcze', 'chemia', 'transport', 'rozrywka', 'zdrowie', 'ubrania', 'dom', 'rachunki', 'inne'];

// Funkcja do pobierania kursu waluty
async function getExchangeRate(fromCurrency, toCurrency = 'PLN') {
    if (fromCurrency === toCurrency) return { rate: 1, success: true };
    
    try {
        // Używamy darmowego API exchangerate-api.com
        const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${fromCurrency}`);
        const data = await response.json();
        
        if (data.rates && data.rates[toCurrency]) {
            return { rate: data.rates[toCurrency], success: true };
        }
        
        console.warn(`Nie znaleziono kursu ${fromCurrency} -> ${toCurrency}, używam 1:1`);
        return { rate: 1, success: false };
    } catch (error) {
        console.error('Błąd pobierania kursu waluty:', error);
        return { rate: 1, success: false }; // Fallback - nie przeliczaj
    }
}

// Funkcja do konwersji cen na PLN
async function convertCurrencyToPLN(items, currency) {
    if (currency === 'PLN') {
        return { items, exchangeRate: 1, originalCurrency: 'PLN', rateSuccess: true };
    }
    
    const { rate: exchangeRate, success: rateSuccess } = await getExchangeRate(currency, 'PLN');
    const convertedItems = items.map(item => ({
        ...item,
        price: Math.round(item.price * exchangeRate * 100) / 100 // Zaokrąglij do 2 miejsc
    }));
    
    return { 
        items: convertedItems, 
        exchangeRate, 
        originalCurrency: currency,
        rateSuccess
    };
}

async function getUserCategories(userId) {
    const userDoc = await usersCollection.doc(userId).get();
    const customCategories = userDoc.exists && userDoc.data().customCategories ? userDoc.data().customCategories : [];

    const snapshot = await purchasesCollection.where('userId', '==', userId).get();
    const allItems = snapshot.docs.flatMap(doc => doc.data().items || []);
    const userCategories = allItems.map(item => item.category).filter(Boolean);
    return [...new Set([...DEFAULT_CATEGORIES, ...customCategories, ...userCategories])].sort();
}

function validateDate(dateStr) {
    if (!dateStr) return null;
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return null;
        return date.toISOString().split('T')[0];
    } catch (e) {
        return null;
    }
}

// Funkcja pomocnicza do ponawiania prób z exponential backoff
async function retryWithBackoff(fn, retries = 2, delay = 1000) {
    try {
        return await fn();
    } catch (error) {
        // Ponawiaj tylko przy błędach 503 (przeciążenie usługi)
        if (retries > 0 && error.message && (error.message.includes('503') || error.message.includes('overloaded'))) {
            console.log(`Błąd usługi AI (503). Ponawiam próbę za ${delay / 1000}s... (${retries} prób pozostało)`);
            await new Promise(res => setTimeout(res, delay));
            return retryWithBackoff(fn, retries - 1, delay * 2);
        }
        // Dla innych błędów lub po wyczerpaniu prób, rzuć błąd dalej
        throw error;
    }
}

async function extractAndCategorizePurchase(file, categories) {
    const imagePart = { inlineData: { data: file.buffer.toString("base64"), mimeType: file.mimetype } };
    const prompt = `
        Twoim zadaniem jest BARDZO DOKŁADNA analiza paragonu lub faktury i zwrócenie danych WYŁĄCZNIE w formacie JSON.

        Struktura JSON, której masz użyć:
        {
          "shop": "string",
          "date": "string (format YYYY-MM-DD)",
          "currency": "string (kod waluty: PLN, EUR, USD, GBP, etc.)",
          "items": [
            { "name": "string", "price": number (cena PO RABACIE), "category": "string" }
          ]
        }

        Postępuj DOKŁADNIE według tych kroków:
        1.  **Dane Główne**: Wyodrębnij nazwę sklepu ('shop'), datę transakcji ('date') w formacie YYYY-MM-DD i walutę ('currency') - użyj kodu waluty (PLN, EUR, USD, GBP, etc.).
        2.  **Analiza Rabatów (NAJWAŻNIEJSZE)**: Znajdź wszystkie rabaty na paragonie i dopasuj je do odpowiednich produktów:
            -   Rabaty bezpośrednio przy produkcie (pod, obok, w tej samej linii)
            -   Rabaty na dole paragonu z nazwą produktu (np. "Rabat Mleko"), 
            -   Rabaty ogólne - rozdziel proporcjonalnie między produkty
        3.  **Kategoryzacja**: Dla każdego produktu przypisz kategorię ('category') z tej listy: ${JSON.stringify(categories)}. Jeśli żadna nie pasuje, użyj "inne".
        4.  **Format Wyjściowy**: Zwróć ostateczną listę produktów w formacie JSON. Nie dodawaj żadnych wyjaśnień ani tekstu przed lub po bloku JSON. Twoja odpowiedź musi być czystym JSON-em.

        **PRZYKŁADY RABATÓW:**
        - Produkt z rabatem bezpośrednio przy nim = odejmij rabat od ceny produktu
        - Rabat z nazwą produktu gdziekolwiek na paragonie = przypisz do tego produktu
        - Rabat ogólny bez nazwy produktu = rozdziel między wszystkie produkty

        **Obsługa Błędów**: Jeśli plik jest nieczytelny lub nie jest paragonem/fakturą, zwróć DOKŁADNIE ten JSON:
        { "error": "Nie udało się odczytać danych z dokumentu. Obraz może być nieczytelny lub nie jest paragonem." }
        
        **Przykłady idealnych odpowiedzi**:
        
        Polski paragon:
        {
          "shop": "Biedronka",
          "date": "2025-07-25",
          "currency": "PLN",
          "items": [
            {"name": "Sok pomarańczowy", "price": 4.50, "category": "spożywcze"},
            {"name": "Mleko 2%", "price": 2.00, "category": "spożywcze"}
          ]
        }
        
        Zagraniczny paragon:
        {
          "shop": "Carrefour",
          "date": "2025-07-25", 
          "currency": "EUR",
          "items": [
            {"name": "Orange Juice", "price": 2.50, "category": "spożywcze"},
            {"name": "Milk", "price": 1.20, "category": "spożywcze"}
          ]
        }
    `;

    try {
        const generationFn = () => model.generateContent([prompt, imagePart]);
        const result = await retryWithBackoff(generationFn);

        const rawText = result.response.text();
        console.log("Surowa odpowiedź od AI:", rawText);

        let jsonString = rawText;
        const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
            jsonString = jsonMatch[1];
        }

        let data;
        try {
            data = JSON.parse(jsonString);
        } catch (parseError) {
            console.error("Błąd parsowania JSON z odpowiedzi AI:", parseError);
            console.error("Tekst, który zawiódł:", jsonString);
            throw new Error('AI zwróciło odpowiedź w nieprawidłowym formacie JSON.');
        }

        // Jeśli AI zwróciło zdefiniowany błąd, rzuć go dalej, aby endpoint go obsłużył.
        if (data.error) {
            throw new Error(data.error);
        }

        return data; // Zwróć surowe dane, walidacja nastąpi w endpoincie. 

    } catch (error) {
        // Przekaż błąd (z AI, z parsowania, lub z sieci) do głównego handlera endpointu.
        throw error;
    }
}

async function updateCategoryInPurchases(userId, oldName, newName, deleteMode = false) {
    const snapshot = await purchasesCollection.where('userId', '==', userId).get();
    const batch = db.batch();

    snapshot.docs.forEach(doc => {
        const purchase = doc.data();
        let needsUpdate = false;
        const updatedItems = purchase.items.map(item => {
            if (item.category === oldName) {
                needsUpdate = true;
                return { ...item, category: deleteMode ? 'inne' : newName };
            }
            return item;
        });

        if (needsUpdate) {
            batch.update(doc.ref, { items: updatedItems });
        }
    });

    await batch.commit();
}

// --- Endpoint Migracyjny (jednorazowe użycie) ---
app.post('/admin/migrate-users', async (req, res) => {
    const providedKey = req.headers['x-migration-key'];
    if (providedKey !== MIGRATION_SECRET_KEY) {
        return res.status(403).json({ success: false, error: 'Brak uprawnień.' });
    }

    console.log('Rozpoczynam migrację użytkowników...');

    try {
        const usersSnapshot = await usersCollection.get();
        if (usersSnapshot.empty) {
            return res.status(200).json({ success: true, message: 'Brak użytkowników do migracji.' });
        }

        const usersToImport = usersSnapshot.docs.map(doc => {
            const userData = doc.data();
            return {
                uid: doc.id,
                email: userData.email,
                passwordHash: Buffer.from(userData.password, 'utf8'),
            };
        });

        console.log(`Przygotowano ${usersToImport.length} użytkowników do importu.`);

        const result = await getAuth().importUsers(usersToImport, {
            hash: {
                algorithm: 'BCRYPT'
            }
        });

        console.log(`Pomyślnie zaimportowano ${result.successCount} użytkowników.`);
        if (result.failureCount > 0) {
            console.error('Błędy importu:', result.errors);
        }

        console.log('Rozpoczynam usuwanie haseł z Firestore...');
        const batch = db.batch();
        usersSnapshot.docs.forEach(doc => {
            batch.update(doc.ref, {
                uid: doc.id,
                password: FieldValue.delete()
            });
        });
        await batch.commit();
        console.log('✅ Hasła zostały usunięte z Firestore.');

        res.status(200).json({
            success: true,
            message: 'Migracja zakończona pomyślnie!',
            imported: result.successCount,
            failed: result.failureCount
        });

    } catch (error) {
        console.error("Błąd krytyczny podczas migracji:", error);
        res.status(500).json({ success: false, error: 'Błąd serwera podczas migracji.', details: error.message });
    }
});


// --- API Uwierzytelniania ---
// ZASTĄPIONY ENDPOINT /auth/register
app.post('/auth/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email i hasło są wymagane.' });
        }

        // 1. Utwórz użytkownika w Firebase Authentication
        const userRecord = await getAuth().createUser({
            email,
            password,
        });

        // 2. Utwórz dokument profilu w Firestore, używając UID z Authentication
        await usersCollection.doc(userRecord.uid).set({
            email: userRecord.email,
            uid: userRecord.uid,
            createdAt: new Date()
            // Nie przechowujemy już hasła!
        });

        res.status(201).json({ success: true, userId: userRecord.uid });

    } catch (error) {
        console.error("Błąd podczas rejestracji:", error);
        if (error.code === 'auth/email-already-exists') {
            return res.status(400).json({ success: false, error: 'Użytkownik o tym emailu już istnieje.' });
        }
        res.status(500).json({ success: false, error: 'Błąd serwera podczas rejestracji.' });
    }
});

// Endpoint /auth/login został usunięty. Logowanie odbywa się po stronie klienta.

// ZASTĄPIONY authMiddleware
const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization || req.headers['x-firebase-token']; // Sprawdź oba nagłówki

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Brak tokena lub nieprawidłowy format.' });
    }

    const idToken = authHeader.split('Bearer ')[1];

    try {
        const decodedToken = await getAuth().verifyIdToken(idToken);
        req.userId = decodedToken.uid; // Przypisujemy UID z tokena
        next();
    } catch (error) {
        console.error("Błąd weryfikacji tokena:", error);
        return res.status(401).json({ success: false, error: 'Nieprawidłowy lub nieważny token.' });
    }
};

// NOWY ENDPOINT do pobierania danych zalogowanego użytkownika
app.get('/api/user/me', authMiddleware, async (req, res) => {
    try {
        const userDoc = await usersCollection.doc(req.userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'Nie znaleziono użytkownika' });
        }
        res.json({ success: true, user: userDoc.data() });
    } catch (error) {
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

// --- API do zarządzania WYDATKAMI CYKLICZNYMI ---

// GET: Pobierz wszystkie definicje wydatków cyklicznych
app.get('/api/recurring-expenses', authMiddleware, async (req, res) => {
    try {
        const snapshot = await recurringExpensesCollection.where('userId', '==', req.userId).get();
        const expenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(expenses);
    } catch (error) {
        console.error("Błąd pobierania wydatków cyklicznych:", error);
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

// POST: Dodaj nową definicję wydatku cyklicznego
app.post('/api/recurring-expenses', authMiddleware, async (req, res) => {
    try {
        const { name, amount, category, dayOfMonth } = req.body;
        if (!name || !amount || !category || !dayOfMonth) {
            return res.status(400).json({ error: 'Wszystkie pola są wymagane.' });
        }

        const createdAt = new Date();
        // Ustaw `lastAdded` na miesiąc PRZED utworzeniem, aby zagwarantować, że logika uzupełniania historii zadziała.
        const lastAddedDate = new Date(createdAt);
        lastAddedDate.setUTCMonth(lastAddedDate.getUTCMonth() - 1);
        const lastAdded = `${lastAddedDate.getUTCFullYear()}-${String(lastAddedDate.getUTCMonth() + 1).padStart(2, '0')}`;

        const newExpense = {
            userId: req.userId,
            name,
            amount: parseFloat(amount),
            category,
            dayOfMonth: parseInt(dayOfMonth),
            createdAt: createdAt,
            lastAdded: lastAdded
        };

        const docRef = await recurringExpensesCollection.add(newExpense);
        res.status(201).json({ id: docRef.id, ...newExpense });
    } catch (error) {
        console.error("Błąd dodawania wydatku cyklicznego:", error);
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

// DELETE: Usuń definicję wydatku cyklicznego
app.delete('/api/recurring-expenses/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const expenseRef = recurringExpensesCollection.doc(id);
        const doc = await expenseRef.get();

        if (!doc.exists || doc.data().userId !== req.userId) {
            return res.status(403).json({ error: 'Brak uprawnień lub wydatek nie istnieje.' });
        }

        await expenseRef.delete();
        res.status(204).send();
    } catch (error) {
        console.error("Błąd usuwania wydatku cyklicznego:", error);
        res.status(500).json({ error: 'Błąd serwera' });
    }
});


// --- API do zarządzania ZAKUPAMI ---

// GET: Pobierz wszystkie zakupy dla zalogowanego użytkownika (z automatycznym dodawaniem wydatków cyklicznych)
app.get('/api/purchases', authMiddleware, async (req, res) => {
    try {
        const { lastVisible, keyword, category, shop, budget, minAmount, maxAmount, startDate, endDate } = req.query;
        const limit = 30; // Liczba zakupów na stronę dla paginacji

        const isAnyFilterActive = keyword || category || shop || budget || minAmount || maxAmount || startDate || endDate;

        let query = purchasesCollection.where('userId', '==', req.userId);

        // Jeśli filtry są aktywne, pobieramy wszystkie pasujące dane bez paginacji.
        // Jeśli nie, stosujemy paginację.
        if (isAnyFilterActive) {
            // Kolejność nie ma znaczenia, bo filtrujemy w kodzie po pobraniu wszystkich dokumentów
            const snapshot = await query.orderBy('date', 'desc').get();
            let purchases = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Filtrowanie w kodzie - mniej wydajne, ale konieczne dla złożonych zapytań
            if (startDate && endDate) {
                const start = new Date(startDate);
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                purchases = purchases.filter(p => {
                    const pDate = new Date(p.date);
                    return pDate >= start && pDate <= end;
                });
            }
            if (shop) purchases = purchases.filter(p => p.shop === shop);
            if (budget) {
                if (budget === 'monthly') {
                    purchases = purchases.filter(p => !p.specialBudgetId);
                } else {
                    purchases = purchases.filter(p => p.specialBudgetId === budget);
                }
            }
            if (minAmount) purchases = purchases.filter(p => p.totalAmount >= parseFloat(minAmount));
            if (maxAmount) purchases = purchases.filter(p => p.totalAmount <= parseFloat(maxAmount));
            if (keyword) {
                const lowerKeyword = keyword.toLowerCase();
                purchases = purchases.filter(p => 
                    p.items.some(item => item.name.toLowerCase().includes(lowerKeyword))
                );
            }
            if (category) {
                purchases = purchases.filter(p => 
                    p.items.some(item => item.category === category)
                );
            }

            res.json({ purchases, nextCursor: null }); // Brak kursora, bo to wszystkie wyniki

        } else {
            // Logika paginacji, gdy nie ma filtrów
            let paginatedQuery = query.orderBy('date', 'desc').limit(limit);

            if (lastVisible) {
                const lastDocSnapshot = await purchasesCollection.doc(lastVisible).get();
                if (lastDocSnapshot.exists) {
                    paginatedQuery = paginatedQuery.startAfter(lastDocSnapshot);
                }
            }

            const snapshot = await paginatedQuery.get();
            const purchases = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const nextCursor = snapshot.docs.length === limit ? snapshot.docs[snapshot.docs.length - 1].id : null;

            res.json({ purchases, nextCursor });
        }
    } catch (error) {
        console.error("Błąd pobierania zakupów:", error);
        res.status(500).json({ error: 'Błąd serwera podczas pobierania zakupów' });
    }
});

// GET: Pobierz wszystkie unikalne nazwy sklepów
app.get('/api/shops', authMiddleware, async (req, res) => {
    try {
        const snapshot = await purchasesCollection.where('userId', '==', req.userId).get();
        if (snapshot.empty) {
            return res.json([]);
        }
        const shops = snapshot.docs.map(doc => doc.data().shop);
        const uniqueShops = [...new Set(shops)].filter(Boolean).sort(); // Usuwa puste wpisy i sortuje
        res.json(uniqueShops);
    } catch (error) {
        console.error("Błąd pobierania sklepów:", error);
        res.status(500).json({ error: 'Błąd serwera podczas pobierania sklepów' });
    }
});

// POST: Dodaj nowy zakup
app.post('/api/purchases', authMiddleware, async (req, res) => {
    try {
        const { shop, date, items, specialBudgetId } = req.body;
        if (!shop || !date || !items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Nieprawidłowe dane zakupu.' });
        }
        const totalAmount = items.reduce((sum, item) => sum + (item.price || 0), 0);
        const newPurchase = {
            userId: req.userId,
            shop,
            date,
            items,
            totalAmount,
            createdAt: new Date()
        };

        if (specialBudgetId) {
            newPurchase.specialBudgetId = specialBudgetId;
        }
        const docRef = await purchasesCollection.add(newPurchase);
        res.status(201).json({ id: docRef.id, ...newPurchase });
    } catch (error) {
        console.error("Błąd dodawania zakupu:", error);
        res.status(500).json({ error: 'Błąd serwera podczas dodawania zakupu' });
    }
});

// PUT: Aktualizuj istniejący zakup
app.put('/api/purchases/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { shop, date, items, specialBudgetId } = req.body;

        if (!shop || !date || !items || !Array.isArray(items)) {
            return res.status(400).json({ error: 'Nieprawidłowe dane do aktualizacji.' });
        }

        const purchaseRef = purchasesCollection.doc(id);
        const doc = await purchaseRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'Zakup nie znaleziony' });
        }
        if (doc.data().userId !== req.userId) {
            return res.status(403).json({ error: 'Brak uprawnień do edycji tego zakupu' });
        }

        const totalAmount = items.reduce((sum, item) => sum + (item.price || 0), 0);
        const updatedPurchase = {
            shop,
            date,
            items,
            totalAmount,
            userId: doc.data().userId,
            createdAt: doc.data().createdAt,
            updatedAt: new Date()
        };

        if (specialBudgetId) {
            updatedPurchase.specialBudgetId = specialBudgetId;
        } else {
            // Ensure the field is removed if it's not provided
            updatedPurchase.specialBudgetId = FieldValue.delete();
        }

        await purchaseRef.set(updatedPurchase);

        res.json({ id: doc.id, ...updatedPurchase });

    } catch (error) {
        console.error("Błąd aktualizacji zakupu:", error);
        res.status(500).json({ error: 'Błąd serwera podczas aktualizacji zakupu' });
    }
});

// DELETE: Usuń zakup
app.delete('/api/purchases/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const purchaseRef = purchasesCollection.doc(id);
        const doc = await purchaseRef.get();

        if (!doc.exists) return res.status(404).json({ error: 'Zakup nie znaleziony' });
        if (doc.data().userId !== req.userId) return res.status(403).json({ error: 'Brak uprawnień' });

        await purchaseRef.delete();
        res.status(204).send();
    } catch (error) {
        console.error("Błąd usuwania zakupu:", error);
        res.status(500).json({ error: 'Błąd serwera podczas usuwania zakupu' });
    }
});

// --- API do zarządzania KATEGORIAMI ---

// GET: Pobierz wszystkie unikalne kategorie dla użytkownika
app.get('/api/categories', authMiddleware, async (req, res) => {
    try {
        const categories = await getUserCategories(req.userId);
        res.json(categories);
    } catch (error) {
        console.error("Błąd pobierania kategorii:", error);
        res.status(500).json({ error: 'Błąd serwera podczas pobierania kategorii' });
    }
});

// POST: Dodaj nową kategorię do listy niestandardowej użytkownika
app.post('/api/categories', authMiddleware, async (req, res) => {
    const { name } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'Nazwa kategorii jest wymagana.' });
    }

    try {
        const userRef = usersCollection.doc(req.userId);
        await userRef.update({
            customCategories: FieldValue.arrayUnion(name.trim().toLowerCase())
        });
        res.status(201).json({ success: true, message: `Kategoria '${name}' została dodana.` });
    } catch (error) {
        console.error("Błąd dodawania nowej kategorii:", error);
        res.status(500).json({ error: 'Błąd serwera podczas dodawania kategorii.' });
    }
});

// PUT: Zmień nazwę kategorii (aktualizuje profil, zakupy i wszystkie budżety)
app.put('/api/categories/:name', authMiddleware, async (req, res) => {
    const { name: oldName } = req.params;
    const { newName } = req.body;
    const newNameLower = newName.trim().toLowerCase();

    if (!newNameLower) {
        return res.status(400).json({ error: 'Nowa nazwa kategorii jest wymagana.' });
    }

    try {
        // Krok 1: Zaktualizuj nazwę w liście niestandardowej użytkownika
        const userRef = usersCollection.doc(req.userId);
        await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                throw new Error("User not found");
            }
            const customCategories = userDoc.data().customCategories || [];
            const oldNameIndex = customCategories.indexOf(oldName);

            if (oldNameIndex > -1) {
                customCategories.splice(oldNameIndex, 1);
            }
            if (!customCategories.includes(newNameLower)) {
                customCategories.push(newNameLower);
            }

            transaction.update(userRef, { customCategories });
        });

        // Krok 2: Zaktualizuj nazwę w istniejących zakupach
        await updateCategoryInPurchases(req.userId, oldName, newNameLower);

        // Krok 3: Zaktualizuj nazwę w istniejących budżetach
        const budgetsSnapshot = await db.collection('budgets').where('userId', '==', req.userId).get();
        if (!budgetsSnapshot.empty) {
            const batch = db.batch();
            budgetsSnapshot.docs.forEach(doc => {
                const budgetData = doc.data();
                if (budgetData.budgets && budgetData.budgets[oldName]) {
                    const newBudgets = { ...budgetData.budgets };
                    newBudgets[newNameLower] = newBudgets[oldName];
                    delete newBudgets[oldName];
                    batch.update(doc.ref, { budgets: newBudgets });
                }
            });
            await batch.commit();
        }

        res.json({ success: true, message: `Kategoria '${oldName}' została zmieniona na '${newNameLower}'.` });

    } catch (error) {
        console.error("Błąd zmiany nazwy kategorii:", error);
        res.status(500).json({ error: 'Błąd serwera podczas zmiany nazwy kategorii.' });
    }
});

// DELETE: Usuń kategorię (aktualizuje zakupy, profil użytkownika i wszystkie budżety)
app.delete('/api/categories/:name', authMiddleware, async (req, res) => {
    const { name } = req.params;

    try {
        // Krok 1: Zaktualizuj kategorię w istniejących zakupach na "inne"
        await updateCategoryInPurchases(req.userId, name, null, true);

        // Krok 2: Usuń kategorię z listy niestandardowej w profilu użytkownika
        const userRef = usersCollection.doc(req.userId);
        await userRef.update({
            customCategories: FieldValue.arrayRemove(name)
        });

        // Krok 3: Usuń kategorię ze wszystkich zdefiniowanych budżetów tego użytkownika
        const budgetsSnapshot = await db.collection('budgets').where('userId', '==', req.userId).get();
        if (!budgetsSnapshot.empty) {
            const batch = db.batch();
            budgetsSnapshot.docs.forEach(doc => {
                const budgetData = doc.data();
                // Sprawdź, czy usuwana kategoria istnieje w tym budżecie
                if (budgetData.budgets && budgetData.budgets[name]) {
                    const newBudgets = { ...budgetData.budgets };
                    delete newBudgets[name];
                    batch.update(doc.ref, { budgets: newBudgets });
                }
            });
            await batch.commit();
        }

        res.json({ success: true, message: `Kategoria '${name}' została usunięta, a powiązane budżety zaktualizowane.` });

    } catch (error) {
        console.error("Błąd usuwania kategorii:", error);
        res.status(500).json({ error: 'Błąd serwera podczas usuwania kategorii.' });
    }
});

// --- API do zarządzania BUDŻETAMI ---

// GET: Pobierz budżet na dany miesiąc
app.get('/api/budgets/:year/:month', authMiddleware, async (req, res) => {
    try {
        const { year, month } = req.params;
        const budgetId = `${req.userId}_${year}-${month}`;

        const budgetRef = db.collection('budgets').doc(budgetId);
        const doc = await budgetRef.get();

        if (!doc.exists) {
            return res.json({ budgets: {} }); // Zwróć pusty obiekt, jeśli budżet nie jest ustawiony
        }
        res.json(doc.data());
    } catch (error) {
        console.error("Błąd pobierania budżetu:", error);
        res.status(500).json({ error: 'Błąd serwera podczas pobierania budżetu' });
    }
});

// POST: Ustaw lub zaktualizuj budżet na dany miesiąc
app.post('/api/budgets/:year/:month', authMiddleware, async (req, res) => {
    try {
        const { year, month } = req.params;
        const { budgets } = req.body; // Oczekujemy obiektu np. { "spożywcze": 800, "rozrywka": 200 }

        if (!budgets || typeof budgets !== 'object') {
            return res.status(400).json({ error: 'Nieprawidłowy format danych budżetu.' });
        }

        const budgetId = `${req.userId}_${year}-${month}`;
        const budgetRef = db.collection('budgets').doc(budgetId);

        const budgetData = {
            userId: req.userId,
            month: `${year}-${month}`,
            budgets,
            updatedAt: new Date()
        };

        await budgetRef.set(budgetData, { merge: true }); // Użyj merge, aby nie nadpisywać całego dokumentu

        res.status(200).json(budgetData);
    } catch (error) {
        console.error("Błąd zapisywania budżetu:", error);
        res.status(500).json({ error: 'Błąd serwera podczas zapisywania budżetu' });
    }
});


// --- API do zarządzania BUDŻETAMI SPECJALNYMI ---
const specialBudgetsCollection = db.collection('specialBudgets');

// GET: Pobierz wszystkie budżety specjalne
app.get('/api/special-budgets', authMiddleware, async (req, res) => {
    try {
        // Usunięto .orderBy('createdAt', 'desc') aby uniknąć błędu wymaganego indeksu
        const snapshot = await specialBudgetsCollection.where('userId', '==', req.userId).get();
        let budgets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Sortowanie po stronie serwera w kodzie
        budgets.sort((a, b) => b.createdAt.toDate() - a.createdAt.toDate());

        res.json(budgets);
    } catch (error) {
        console.error("Błąd pobierania budżetów specjalnych:", error);
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

// POST: Dodaj nowy budżet specjalny
app.post('/api/special-budgets', authMiddleware, async (req, res) => {
    try {
        const { name, amount } = req.body;
        if (!name || !amount) {
            return res.status(400).json({ error: 'Nazwa i kwota są wymagane.' });
        }
        const newBudget = {
            userId: req.userId,
            name,
            amount: parseFloat(amount),
            createdAt: new Date()
        };
        const docRef = await specialBudgetsCollection.add(newBudget);
        res.status(201).json({ id: docRef.id, ...newBudget });
    } catch (error) {
        console.error("Błąd dodawania budżetu specjalnego:", error);
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

// PUT: Aktualizuj budżet specjalny
app.put('/api/special-budgets/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, amount } = req.body;
        if (!name || !amount) {
            return res.status(400).json({ error: 'Nazwa i kwota są wymagane.' });
        }

        const budgetRef = specialBudgetsCollection.doc(id);
        const doc = await budgetRef.get();

        if (!doc.exists || doc.data().userId !== req.userId) {
            return res.status(403).json({ error: 'Brak uprawnień lub budżet nie istnieje.' });
        }

        await budgetRef.update({ name, amount: parseFloat(amount), updatedAt: new Date() });
        res.json({ id, name, amount: parseFloat(amount) });
    } catch (error) {
        console.error("Błąd aktualizacji budżetu specjalnego:", error);
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

// DELETE: Usuń budżet specjalny
app.delete('/api/special-budgets/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const budgetRef = specialBudgetsCollection.doc(id);
        const doc = await budgetRef.get();

        if (!doc.exists || doc.data().userId !== req.userId) {
            return res.status(403).json({ error: 'Brak uprawnień lub budżet nie istnieje.' });
        }

        // Znajdź i odepnij wszystkie wydatki powiązane z tym budżetem
        const purchasesSnapshot = await purchasesCollection.where('specialBudgetId', '==', id).get();
        if (!purchasesSnapshot.empty) {
            const batch = db.batch();
            purchasesSnapshot.docs.forEach(doc => {
                batch.update(doc.ref, { specialBudgetId: FieldValue.delete() });
            });
            await batch.commit();
        }

        await budgetRef.delete();
        res.status(204).send();
    } catch (error) {
        console.error("Błąd usuwania budżetu specjalnego:", error);
        res.status(500).json({ error: 'Błąd serwera' });
    }
});


// --- API do Statystyk ---
app.get('/api/statistics', authMiddleware, async (req, res) => {
    try {
        const { year, month } = req.query;

        const snapshot = await purchasesCollection.where('userId', '==', req.userId).get();
        if (snapshot.empty) {
            return res.json({ monthlyTotal: 0, spendingByCategory: {}, availableMonths: [] });
        }

        const allPurchases = snapshot.docs.map(doc => doc.data());
        
        // Filtruj wydatki, aby wykluczyć te ze specjalnych budżetów
        const purchases = allPurchases.filter(p => !p.specialBudgetId);

        // Tworzenie listy dostępnych miesięcy (na podstawie wszystkich wydatków, żeby nie ukrywać miesięcy)
        const availableMonths = [...new Set(allPurchases.map(p => p.date.substring(0, 7)))].sort().reverse();

        // Ustalanie okresu do analizy
        const targetDate = (year && month) ? new Date(parseInt(year), parseInt(month) - 1, 15) : new Date();
        const firstDayOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1).toISOString().split('T')[0];
        const lastDayOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).toISOString().split('T')[0];

        const monthlyPurchases = purchases.filter(p => p.date >= firstDayOfMonth && p.date <= lastDayOfMonth);

        const monthlyTotal = monthlyPurchases.reduce((sum, p) => sum + (p.totalAmount || 0), 0);

        const spendingByCategory = monthlyPurchases
            .flatMap(p => p.items || [])
            .reduce((acc, item) => {
                const category = item.category || 'inne';
                const price = item.price || 0;
                acc[category] = (acc[category] || 0) + price;
                return acc;
            }, {});

        res.json({
            monthlyTotal,
            spendingByCategory,
            availableMonths
        });

    } catch (error) {
        console.error("Błąd pobierania statystyk:", error);
        res.status(500).json({ error: 'Błąd serwera podczas pobierania statystyk' });
    }
});

app.get('/api/statistics/comparison', authMiddleware, async (req, res) => {
    try {
        const snapshot = await purchasesCollection.where('userId', '==', req.userId).get();
        if (snapshot.empty) {
            return res.json({ monthlyTotals: [] });
        }
        
        // Wyklucz wydatki ze specjalnych budżetów
        const purchases = snapshot.docs.map(doc => doc.data()).filter(p => !p.specialBudgetId);

        // Agregacja wydatków po miesiącach
        const monthlyTotalsMap = purchases.reduce((acc, p) => {
            const month = p.date.substring(0, 7);
            const amount = p.totalAmount || 0;
            acc[month] = (acc[month] || 0) + amount;
            return acc;
        }, {});

        // Sortowanie i formatowanie danych
        const monthlyTotals = Object.entries(monthlyTotalsMap)
            .map(([month, total]) => ({ month, total }))
            .sort((a, b) => a.month.localeCompare(b.month));

        res.json({ monthlyTotals });

    } catch (error) {
        console.error("Błąd pobierania danych porównawczych:", error);
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

app.get('/api/statistics/by-shop', authMiddleware, async (req, res) => {
    try {
        const { year, month } = req.query;
        if (!year || !month) {
            return res.status(400).json({ error: 'Rok i miesiąc są wymagane.' });
        }

        const snapshot = await purchasesCollection.where('userId', '==', req.userId).get();
        if (snapshot.empty) {
            return res.json({ spendingByShop: {} });
        }

        // Wyklucz wydatki ze specjalnych budżetów
        const purchases = snapshot.docs.map(doc => doc.data()).filter(p => !p.specialBudgetId);

        const firstDayOfMonth = new Date(parseInt(year), parseInt(month) - 1, 1).toISOString().split('T')[0];
        const lastDayOfMonth = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];

        const monthlyPurchases = purchases.filter(p => p.date >= firstDayOfMonth && p.date <= lastDayOfMonth);

        const spendingByShop = monthlyPurchases.reduce((acc, p) => {
            const shop = p.shop || 'Nieznany sklep';
            const amount = p.totalAmount || 0;
            acc[shop] = (acc[shop] || 0) + amount;
            return acc;
        }, {});

        res.json({ spendingByShop });

    } catch (error) {
        console.error("Błąd pobierania statystyk wg sklepów:", error);
        res.status(500).json({ error: 'Błąd serwera' });
    }
});""

app.get('/api/statistics/category-details', authMiddleware, async (req, res) => {
    try {
        const { year, month, category } = req.query;
        if (!year || !month || !category) {
            return res.status(400).json({ error: 'Rok, miesiąc i kategoria są wymagane.' });
        }

        const snapshot = await purchasesCollection.where('userId', '==', req.userId).get();
        if (snapshot.empty) {
            return res.json({ items: [] });
        }

        const purchases = snapshot.docs.map(doc => doc.data());

        const firstDayOfMonth = new Date(parseInt(year), parseInt(month) - 1, 1).toISOString().split('T')[0];
        const lastDayOfMonth = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];

        const monthlyPurchases = purchases.filter(p => p.date >= firstDayOfMonth && p.date <= lastDayOfMonth);

        const categoryItems = monthlyPurchases
            .flatMap(p => (p.items || []).map(item => ({ ...item, purchaseDate: p.date, shop: p.shop })))
            .filter(item => (item.category || 'inne') === category);

        res.json({ items: categoryItems });

    } catch (error) {
        console.error("Błąd pobierania szczegółów kategorii:", error);
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

// --- API DO ANALIZY PARAGONÓW ---

// Endpoint do ręcznego przeliczenia kursu waluty
app.post('/api/convert-currency', authMiddleware, async (req, res) => {
    try {
        const { items, fromCurrency, toCurrency = 'PLN', exchangeRate } = req.body;
        
        if (!items || !Array.isArray(items) || !fromCurrency || !exchangeRate) {
            return res.status(400).json({ error: 'Brak wymaganych danych (items, fromCurrency, exchangeRate).' });
        }
        
        const rate = parseFloat(exchangeRate);
        if (isNaN(rate) || rate <= 0) {
            return res.status(400).json({ error: 'Kurs wymiany musi być liczbą większą od zera.' });
        }
        
        const convertedItems = items.map(item => ({
            ...item,
            price: Math.round(item.price * rate * 100) / 100 // Zaokrąglij do 2 miejsc
        }));
        
        res.json({
            success: true,
            items: convertedItems,
            exchangeRate: rate,
            originalCurrency: fromCurrency,
            currency: toCurrency
        });
        
    } catch (error) {
        console.error("Błąd ręcznego przeliczenia kursu:", error);
        res.status(500).json({ error: 'Błąd serwera podczas przeliczania kursu.' });
    }
});

app.post('/api/analyze-receipt', authMiddleware, async (req, res) => {
    console.log('Otrzymano żądanie analizy paragonu');
    console.log('Content-Type:', req.get('Content-Type'));

    try {
        const { image, mimetype, filename, size } = req.body;

        if (!image) {
            return res.status(400).json({ error: 'Nie przesłano danych obrazu.' });
        }

        console.log('Rozpoczynam analizę paragonu...');
        console.log('Rozmiar pliku:', size);
        console.log('Typ pliku:', mimetype);
        console.log('Nazwa pliku:', filename);

        // Stwórz obiekt podobny do req.file z multer
        const fileObject = {
            buffer: Buffer.from(image, 'base64'),
            mimetype: mimetype,
            originalname: filename,
            size: size
        };

        const categories = await getUserCategories(req.userId);
        const analysisResult = await extractAndCategorizePurchase(fileObject, categories);

        // Konwertuj waluty na PLN jeśli potrzeba
        const currency = analysisResult.currency || 'PLN';
        const conversionResult = await convertCurrencyToPLN(analysisResult.items || [], currency);

        // Formatuj odpowiedź jak w wersji z Render.com
        const finalAnalysis = {
            shop: analysisResult.shop || 'Nieznany sklep',
            date: validateDate(analysisResult.date) || new Date().toISOString().split('T')[0],
            currency: 'PLN', // Zawsze PLN po konwersji
            originalCurrency: conversionResult.originalCurrency,
            exchangeRate: conversionResult.exchangeRate,
            rateSuccess: conversionResult.rateSuccess,
            items: conversionResult.items
        };

        console.log('Analiza paragonu zakończona pomyślnie');
        res.json({ success: true, analysis: finalAnalysis });

    } catch (error) {
        console.error("Błąd analizy paragonu:", error);

        // Błąd przeciążenia usługi AI
        if (error.message && (error.message.includes('503') || error.message.includes('overloaded'))) {
            return res.status(503).json({
                success: false,
                error: 'Usługa analizy AI jest chwilowo przeciążona. Spróbuj ponownie za kilka chwil.'
            });
        }

        res.status(400).json({
            success: false,
            error: error.message || 'Wystąpił nieznany błąd podczas analizy paragonu.'
        });
    }
});

// --- Funkcja Cykliczna (CRON) ---
exports.addRecurringExpensesScheduled = onSchedule('every 24 hours', async (event) => {
    console.log('Uruchomiono zaplanowane dodawanie wydatków cyklicznych.');
    const today = new Date();
    const recurringSnapshot = await recurringExpensesCollection.get();

    if (recurringSnapshot.empty) {
        console.log('Brak zdefiniowanych wydatków cyklicznych. Zakończono.');
        return null;
    }

    // Grupuj wydatki po userId, aby zminimalizować liczbę zapisów batch
    const expensesByUser = {};
    recurringSnapshot.forEach(doc => {
        const expense = doc.data();
        if (!expensesByUser[expense.userId]) {
            expensesByUser[expense.userId] = [];
        }
        expensesByUser[expense.userId].push({ id: doc.id, ...expense });
    });

    for (const userId in expensesByUser) {
        const userExpenses = expensesByUser[userId];
        const batch = db.batch();
        let anyNewPurchases = false;

        console.log(`Przetwarzanie wydatków dla użytkownika: ${userId}`);

        for (const expense of userExpenses) {
            let dateToCheck;
            if (expense.lastAdded) {
                dateToCheck = new Date(expense.lastAdded + '-01T12:00:00Z');
                dateToCheck.setUTCMonth(dateToCheck.getUTCMonth() + 1);
            } else {
                dateToCheck = new Date(expense.createdAt.toDate());
                dateToCheck.setUTCMonth(dateToCheck.getUTCMonth() - 1);
            }
            dateToCheck.setUTCDate(1);

            let latestProcessedMonth = expense.lastAdded;

            while (dateToCheck <= today) {
                const year = dateToCheck.getUTCFullYear();
                const month = dateToCheck.getUTCMonth();
                const currentMonthStr = `${year}-${String(month + 1).padStart(2, '0')}`;

                const isSameMonthAsToday = (today.getUTCFullYear() === year && today.getUTCMonth() === month);
                if (isSameMonthAsToday && today.getUTCDate() < expense.dayOfMonth) {
                    dateToCheck.setUTCMonth(dateToCheck.getUTCMonth() + 1);
                    continue;
                }

                const daysInMonth = new Date(year, month + 1, 0).getDate();
                const actualDay = Math.min(expense.dayOfMonth, daysInMonth);
                const newPurchaseDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(actualDay).padStart(2, '0')}`;

                const newPurchase = {
                    userId: userId,
                    shop: "Wydatek cykliczny",
                    date: newPurchaseDate,
                    items: [{ name: expense.name, price: expense.amount, category: expense.category }],
                    totalAmount: expense.amount,
                    createdAt: new Date(),
                    isRecurring: true
                };

                const newPurchaseRef = purchasesCollection.doc();
                batch.set(newPurchaseRef, newPurchase);
                anyNewPurchases = true;
                latestProcessedMonth = currentMonthStr;

                dateToCheck.setUTCMonth(dateToCheck.getUTCMonth() + 1);
            }

            if (latestProcessedMonth !== expense.lastAdded) {
                const expenseRef = recurringExpensesCollection.doc(expense.id);
                batch.update(expenseRef, { lastAdded: latestProcessedMonth });
            }
        }

        if (anyNewPurchases) {
            try {
                await batch.commit();
                console.log(`Pomyślnie dodano nowe wydatki cykliczne dla użytkownika: ${userId}`);
            } catch (error) {
                console.error(`Błąd podczas zapisu batch dla użytkownika ${userId}:`, error);
            }
        }
    }

    console.log('Zakończono zaplanowane dodawanie wydatków cyklicznych.');
    return null;
});

// --- Trasy Główne ---
// Te trasy nie są potrzebne w Cloud Function, ponieważ hosting zajmuje się serwowaniem plików.
// app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'tracker.html')));
// app.get('/favicon.ico', (req, res) => res.sendFile(path.join(__dirname, 'icon-new.svg')));


// Eksportuj aplikację Express jako funkcję chmurową o nazwie 'api' z sekretami
exports.api = functions.https.onRequest({
    secrets: ['JWT_SECRET', 'GEMINI_API_KEY', 'MIGRATION_SECRET_KEY']
}, app);