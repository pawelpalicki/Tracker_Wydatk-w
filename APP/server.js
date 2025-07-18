// server.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const admin = require('firebase-admin');

// --- INICJALIZACJA FIREBASE ---
admin.initializeApp({
  credential: admin.credential.applicationDefault()
});
const db = admin.firestore();
const expensesCollection = db.collection('expenses');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serwowanie frontendu
app.use(express.static(__dirname));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'tracker.html'));
});

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// --- API DO ZARZĄDZANIA WYDATKAMI ---

app.get('/api/expenses', async (req, res) => {
    try {
        const snapshot = await expensesCollection.orderBy('date', 'desc').get();
        const expenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(expenses);
    } catch (error) {
        console.error("Błąd pobierania wydatków:", error);
        res.status(500).json({ error: "Nie udało się pobrać wydatków." });
    }
});

app.post('/api/expenses', async (req, res) => {
    try {
        const newExpense = req.body;
        if (!newExpense.description || newExpense.amount == null || !newExpense.category || !newExpense.date) {
            return res.status(400).json({ error: "Brak wszystkich wymaganych pól." });
        }
        const docRef = await expensesCollection.add(newExpense);
        res.status(201).json({ id: docRef.id, ...newExpense });
    } catch (error) {
        console.error("Błąd dodawania wydatku:", error);
        res.status(500).json({ error: "Nie udało się dodać wydatku." });
    }
});

app.put('/api/expenses/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updatedData = req.body;
        await expensesCollection.doc(id).update(updatedData);
        res.json({ id: id, ...updatedData });
    } catch (error) {
        console.error("Błąd aktualizacji wydatku:", error);
        res.status(500).json({ error: "Nie udało się zaktualizować wydatku." });
    }
});

app.delete('/api/expenses/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await expensesCollection.doc(id).delete();
        res.status(200).json({ message: "Wydatek usunięty pomyślnie." });
    } catch (error) {
        console.error("Błąd usuwania wydatku:", error);
        res.status(500).json({ error: "Nie udało się usunąć wydatku." });
    }
});

// --- API DO ANALIZY PARAGONÓW ---
app.post('/api/analyze-receipt', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Brak pliku obrazu' });
        }
        const existingCategories = req.body.categories ? JSON.parse(req.body.categories) : [];
        const receiptData = await extractItemsFromImage(req.file);
        if (!receiptData.items || receiptData.items.length === 0) {
            return res.status(400).json({ success: false, error: 'Nie znaleziono żadnych produktów na paragonie.' });
        }
        const categorizedItems = await Promise.all(
            receiptData.items.map(item => categorizeItem(item, existingCategories))
        );
        const finalAnalysis = { ...receiptData, items: categorizedItems };
        res.json({ success: true, analysis: finalAnalysis });
    } catch (error) {
        console.error('Błąd w głównym procesie analizy:', error);
        res.status(500).json({ success: false, error: 'Błąd serwera podczas analizy paragonu', details: error.message });
    }
});

// --- FUNKCJE POMOCNICZE (TERAZ PEŁNE) ---

async function generateContentWithRetry(prompt, imagePart = null, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const content = imagePart ? [prompt, imagePart] : [prompt];
            const result = await model.generateContent(content);
            return result;
        } catch (error) {
            if (error.message && error.message.includes('503')) {
                console.warn(`Próba ${i + 1} nie powiodła się (model przeciążony). Ponawiam za 2 sekundy...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
                throw error;
            }
        }
    }
    throw new Error('Model jest nadal przeciążony po kilku próbach.');
}

async function extractItemsFromImage(file) {
    const imagePart = { inlineData: { data: file.buffer.toString("base64"), mimeType: file.mimetype } };
    const prompt = `
Przeanalizuj obraz paragonu. Wyciągnij nazwę sklepu, datę zakupu oraz listę wszystkich produktów z ich cenami.
Odpowiedź zwróć WYŁĄCZNIE w formacie JSON.
Przykład:
{ "shop": "Biedronka", "date": "2025-07-18", "items": [ {"name": "MLEKO 2% KARTON", "price": 2.89}, {"name": "MASLO EXTRA", "price": 5.99} ] }`;
    
    const result = await generateContentWithRetry(prompt, imagePart);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Nie udało się wyciągnąć JSON z odpowiedzi AI (Etap 1)');
    
    const data = JSON.parse(jsonMatch[0]);
    return {
        shop: data.shop || 'Nieznany sklep',
        date: validateDate(data.date) || new Date().toISOString().split('T')[0],
        items: data.items || []
    };
}

async function categorizeItem(item, existingCategories) {
    const prompt = `
Jesteś asystentem do kategoryzacji wydatków. Do której z podanych kategorii najlepiej pasuje produkt: "${item.name}"?
Jeśli żadna kategoria nie pasuje, zaproponuj nową, krótką, jednowyrazową kategorię.
Odpowiedź zwróć WYŁĄCZNIE w formacie JSON, zawierający tylko jeden klucz: "category".
Istniejące kategorie: ${JSON.stringify(existingCategories)}
Przykład odpowiedzi: {"category": "jedzenie"}`;

    const result = await generateContentWithRetry(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { ...item, category: 'inne' };

    try {
        const data = JSON.parse(jsonMatch[0]);
        return { ...item, category: data.category ? String(data.category).toLowerCase() : 'inne' };
    } catch (e) {
        return { ...item, category: 'inne' };
    }
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

// Start serwera
app.listen(PORT, () => {
    console.log(`🚀 Serwer uruchomiony na porcie ${PORT}`);
});

module.exports = app;
