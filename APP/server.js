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
const model = gemini.getGenerativeModel({ model: "gemini-1.5-flash" });

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

async function extractAndCategorizePurchase(file, categories) {
    const imagePart = { inlineData: { data: file.buffer.toString("base64"), mimeType: file.mimetype } };
    const prompt = 
`Twoim zadaniem jest dokładna analiza paragonu i zwrócenie danych w formacie JSON. Zwróć szczególną uwagę na rabaty. Postępuj zgodnie z poniższymi krokami:

KROK 1: Ekstrakcja Danych Podstawowych
- Nazwa sklepu ("shop") - jeśli nie ma, ustaw "Nieznany sklep"
- Data transakcji ("date") w formacie YYYY-MM-DD
- Lista produktów ("items") z:
  * nazwą ("name")
  * ceną przed rabatem ("originalPrice")
  * uwzględnionym rabatem ("price")
  * kategorią ("category")

KROK 2: Szczegółowa Analiza Rabatów
- Szukaj wyraźnych oznaczeń rabatów: "Rabat", "Upust", "Promocja", "-X.XX", "*"
- Jeśli rabat jest w osobnej linijce pod produktem (np. "Rabat -1,01"), przypisz go do produktu powyżej
- Jeśli rabat jest w nazwie produktu (np. "Produkt XYZ -2,00 zł"), wyodrębnij kwotę
- Dla rabatów ogólnych rozłóż proporcjonalnie na wszystkie produkty
- Zawsze sprawdzaj czy cena po rabacie nie jest wyższa niż przed rabatem

KROK 3: Kategoryzacja
- Użyj podanych kategorii: ${JSON.stringify(categories)}
- Dla niepasujących produktów użyj "inne"

KROK 4: Format Wyniku
{
  "shop": "Nazwa sklepu",
  "date": "2023-01-01",
  "items": [
    {
      "name": "Produkt 1",
      "originalPrice": 10.00,
      "price": 9.00,
      "category": "kategoria1"
    }
  ]
}

Pamiętaj:
1. Rabaty pod produktem mają pierwszeństwo
2. Dokładnie sprawdzaj format kwot (kropki/przecinki)
3. Upewnij się, że cena po rabacie jest niższa niż przed rabatem`;

    try {
        const result = await model.generateContent([prompt, imagePart]);
        let rawText = result.response.text();
        console.log("Surowa odpowiedź od AI:", rawText);

        // Poprawianie formatu odpowiedzi
        rawText = rawText.replace(/```json|```/g, '').trim();
        
        // Naprawianie częstych problemów z formatowaniem
        rawText = rawText.replace(/'/g, '"') // zamiana apostrofów na cudzysłowy
                         .replace(/(\w)\s*:\s*([^"\s][^,}]*)/g, '$1:"$2"') // naprawianie niecytowanych wartości
                         .replace(/(\d),(\d)/g, '$1.$2'); // zamiana przecinków na kropki w liczbach

        const data = JSON.parse(rawText);

        // Zaawansowana walidacja i normalizacja
        if (!data.shop || typeof data.shop !== 'string') data.shop = 'Nieznany sklep';
        if (!validateDate(data.date)) data.date = new Date().toISOString().split('T')[0];
        
        data.items = (Array.isArray(data.items) ? data.items : []).map(item => {
            const originalPrice = parseFloat(item.originalPrice) || 0;
            let price = parseFloat(item.price) || originalPrice;
            
            // Zapewnienie, że cena po rabacie nie jest wyższa niż przed rabatem
            price = Math.min(price, originalPrice);
            price = Math.max(0, price); // Zapewnienie, że cena nie jest ujemna
            
            return {
                name: item.name?.trim() || 'Nieznany produkt',
                originalPrice: parseFloat(originalPrice.toFixed(2)),
                price: parseFloat(price.toFixed(2)),
                category: categories.includes(item.category) ? item.category : 'inne'
            };
        });

        return data;
    } catch (error) {
        console.error("Błąd podczas przetwarzania odpowiedzi AI:", error);
        throw new Error('Nie udało się przetworzyć odpowiedzi z AI. Sprawdź logi serwera.');
    }
}

function validateDate(dateString) {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateString)) return false;
    const date = new Date(dateString);
    return !isNaN(date.getTime());
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
        if (!req.file) return res.status(400).json({ success: false, error: 'Brak pliku obrazu.' });

        const allPossibleCategories = await getUserCategories(req.userId);
        const finalAnalysis = await extractAndCategorizePurchase(req.file, allPossibleCategories);

        res.json({ success: true, analysis: finalAnalysis });

    } catch (error) {
        console.error('Błąd w głównym procesie analizy:', error);
        res.status(500).json({ success: false, error: 'Błąd serwera podczas analizy paragonu', details: error.message });
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

// --- Trasy Główne ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'tracker.html')));
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(__dirname, 'icon.svg')));

// --- Start serwera ---
app.listen(PORT, () => {
    console.log(`🚀 Serwer uruchomiony na porcie ${PORT}`);
});