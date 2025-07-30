const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

// --- Konfiguracja ---
const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-it';

require('dotenv').config({ path: path.join(__dirname, '../.env') });

// --- Inicjalizacja Firebase ---
// Bezpieczna inicjalizacja dla środowiska produkcyjnego (np. Render)
let serviceAccount;
if (process.env.FIREBASE_CREDENTIALS_JSON) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS_JSON);
    } catch (e) {
        console.error('Błąd parsowania FIREBASE_CREDENTIALS_JSON:', e);
        process.exit(1);
    }
} else {
    // Inicjalizacja dla środowiska lokalnego z pliku
    const credentialsPath = path.resolve(__dirname, process.env.GOOGLE_APPLICATION_CREDENTIALS);
    try {
        serviceAccount = require(credentialsPath);
    } catch (e) {
        console.error(`Nie można załadować danych logowania z pliku: ${credentialsPath}. Upewnij się, że ścieżka w .env jest poprawna.`);
        process.exit(1);
    }
}

initializeApp({
  credential: cert(serviceAccount)
});
const db = getFirestore();
const usersCollection = db.collection('users');
const purchasesCollection = db.collection('expenses');

// --- Inicjalizacja Gemini AI ---
const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = gemini.getGenerativeModel({ model: "gemini-1.5-flash" , });

// --- Middleware ---
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const authMiddleware = (req, res, next) => {
    const token = req.headers['x-auth-token'];
    if (!token) return res.status(401).json({ success: false, error: 'Brak tokena.' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Nieprawidłowy token.' });
    }
};

// --- Funkcje pomocnicze ---
const DEFAULT_CATEGORIES = ['spożywcze', 'chemia', 'transport', 'rozrywka', 'zdrowie', 'ubrania', 'dom', 'rachunki', 'inne'];

async function getUserCategories(userId) {
    const snapshot = await purchasesCollection.where('userId', '==', userId).get();
    const allItems = snapshot.docs.flatMap(doc => doc.data().items || []);
    const userCategories = allItems.map(item => item.category).filter(Boolean);
    return [...new Set([...DEFAULT_CATEGORIES, ...userCategories])].sort();
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
          "items": [
            { "name": "string", "price": number (cena PO RABACIE), "category": "string" }
          ]
        }

        Postępuj DOKŁADNIE według tych kroków:
        1.  **Dane Główne**: Wyodrębnij nazwę sklepu ('shop') i datę transakcji ('date') w formacie YYYY-MM-DD.
        2.  **Analiza Rabatów (NAJWAŻNIEJSZE)**: Znajdź wszystkie rabaty na paragonie i dopasuj je do odpowiednich produktów:
            -   Rabaty bezpośrednio przy produkcie (pod, obok, w tej samej linii)
            -   Rabaty na dole paragonu z nazwą produktu (np. "Rabat Mleko", "Rab. Sok") 
            -   Rabaty ogólne - rozdziel proporcjonalnie między produkty
        3.  **Kategoryzacja**: Dla każdego produktu przypisz kategorię ('category') z tej listy: ${JSON.stringify(categories)}. Jeśli żadna nie pasuje, użyj "inne".
        4.  **Format Wyjściowy**: Zwróć ostateczną listę produktów w formacie JSON. Nie dodawaj żadnych wyjaśnień ani tekstu przed lub po bloku JSON. Twoja odpowiedź musi być czystym JSON-em.

        **PRZYKŁADY RABATÓW:**
        - Produkt z rabatem bezpośrednio przy nim = odejmij rabat od ceny produktu
        - Rabat z nazwą produktu gdziekolwiek na paragonie = przypisz do tego produktu
        - Rabat ogólny bez nazwy produktu = rozdziel między wszystkie produkty

        **Obsługa Błędów**: Jeśli plik jest nieczytelny lub nie jest paragonem/fakturą, zwróć DOKŁADNIE ten JSON:
        { "error": "Nie udało się odczytać danych z dokumentu. Obraz może być nieczytelny lub nie jest paragonem." }
        
        **Przykład idealnej odpowiedzi**:
        {
          "shop": "Biedronka",
          "date": "2025-07-25",
          "items": [
            {"name": "Sok pomarańczowy", "price": 4.50, "category": "spożywcze"},
            {"name": "Mleko 2%", "price": 2.00, "category": "spożywcze"}
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

// --- API Uwierzytelniania ---
app.post('/auth/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email i hasło są wymagane.' });
        }

        const userDoc = await usersCollection.where('email', '==', email).get();
        if (!userDoc.empty) {
            return res.status(400).json({ success: false, error: 'Użytkownik o tym emailu już istnieje.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUserRef = await usersCollection.add({
            email,
            password: hashedPassword,
            createdAt: new Date()
        });

        res.status(201).json({ success: true, userId: newUserRef.id });

    } catch (error) {
        console.error("Błąd podczas rejestracji:", error);
        res.status(500).json({ success: false, error: 'Błąd serwera podczas rejestracji.' });
    }
});

app.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email i hasło są wymagane.' });
        }

        const snapshot = await usersCollection.where('email', '==', email).limit(1).get();
        if (snapshot.empty) {
            return res.status(401).json({ success: false, error: 'Nieprawidłowy email lub hasło.' });
        }

        const userDoc = snapshot.docs[0];
        const user = userDoc.data();

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, error: 'Nieprawidłowy email lub hasło.' });
        }

        const token = jwt.sign({ userId: userDoc.id }, JWT_SECRET, { expiresIn: '1h' });

        res.json({ success: true, token });

    } catch (error) {
        console.error("Błąd podczas logowania:", error);
        res.status(500).json({ success: false, error: 'Błąd serwera podczas logowania.' });
    }
});

app.get('/auth/status', authMiddleware, (req, res) => {
    // If authMiddleware passes, the token is valid.
    res.json({ success: true, userId: req.userId });
});

// --- API do zarządzania ZAKUPAMI ---

// GET: Pobierz wszystkie zakupy dla zalogowanego użytkownika
app.get('/api/purchases', authMiddleware, async (req, res) => {
    try {
        const snapshot = await purchasesCollection.where('userId', '==', req.userId).orderBy('date', 'desc').get();
        const purchases = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(purchases);
    } catch (error) {
        console.error("Błąd pobierania zakupów:", error);
        res.status(500).json({ error: 'Błąd serwera podczas pobierania zakupów' });
    }
});

// POST: Dodaj nowy zakup
app.post('/api/purchases', authMiddleware, async (req, res) => {
    try {
        const { shop, date, items } = req.body;
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
        const { shop, date, items } = req.body;

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

// PUT: Zmień nazwę kategorii we wszystkich dokumentach
app.put('/api/categories/:name', authMiddleware, async (req, res) => {
    const { name: oldName } = req.params;
    const { newName } = req.body;

    if (!newName) {
        return res.status(400).json({ error: 'Nowa nazwa kategorii jest wymagana.' });
    }

    try {
        await updateCategoryInPurchases(req.userId, oldName, newName);
        res.json({ success: true, message: `Kategoria '${oldName}' została zmieniona na '${newName}'.` });

    } catch (error) {
        console.error("Błąd zmiany nazwy kategorii:", error);
        res.status(500).json({ error: 'Błąd serwera podczas zmiany nazwy kategorii.' });
    }
});

// DELETE: Usuń kategorię we wszystkich dokumentach (zastąp przez "inne")
app.delete('/api/categories/:name', authMiddleware, async (req, res) => {
    const { name } = req.params;

    try {
        await updateCategoryInPurchases(req.userId, name, null, true);
        res.json({ success: true, message: `Kategoria '${name}' została usunięta.` });

    } catch (error) {
        console.error("Błąd usuwania kategorii:", error);
        res.status(500).json({ error: 'Błąd serwera podczas usuwania kategorii.' });
    }
});

// --- API DO ANALIZY PARAGONÓW ---
app.post('/api/analyze-receipt', authMiddleware, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Brak pliku obrazu.' });
        }

        const allPossibleCategories = await getUserCategories(req.userId);
        const analysisResult = await extractAndCategorizePurchase(req.file, allPossibleCategories);

        // Jeśli wszystko jest w porządku, formatujemy i wysyłamy dane
        const finalAnalysis = {
            shop: analysisResult.shop || 'Nieznany sklep',
            date: validateDate(analysisResult.date) || new Date().toISOString().split('T')[0],
            items: analysisResult.items || []
        };

        res.json({ success: true, analysis: finalAnalysis });

    } catch (error) {
        console.error('Błąd w głównym procesie analizy:', error.message);

        // Błąd przeciążenia usługi AI
        if (error.message && (error.message.includes('503') || error.message.includes('overloaded'))) {
            return res.status(503).json({ 
                success: false, 
                error: 'Usługa analizy AI jest chwilowo przeciążona. Spróbuj ponownie za kilka chwil.' 
            });
        }

        // Inne błędy (w tym błąd odczytu z AI, błąd parsowania JSON itp.)
        // Domyślnie zwracamy status 400, który jest odpowiedni dla błędów klienta/danych
        res.status(400).json({ 
            success: false, 
            error: error.message || 'Wystąpił nieznany błąd podczas analizy paragonu.'
        });
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

        const purchases = snapshot.docs.map(doc => doc.data());

        // Tworzenie listy dostępnych miesięcy
        const availableMonths = [...new Set(purchases.map(p => p.date.substring(0, 7)))].sort().reverse();

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
        const purchases = snapshot.docs.map(doc => doc.data());

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

        const purchases = snapshot.docs.map(doc => doc.data());

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
});

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

// --- Trasy Główne ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'tracker.html')));
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(__dirname, 'icon.svg')));

// --- Start serwera ---
app.listen(PORT, () => {
    console.log(`🚀 Serwer uruchomiony na porcie ${PORT}`);
});
