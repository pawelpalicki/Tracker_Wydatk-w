const functions = require("firebase-functions");
const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { onSchedule } = require("firebase-functions/v2/scheduler");
const path = require('path');
const cors = require('cors');
const { getPrompt } = require('./prompt.js');

// --- Konfiguracja ---
const app = express();

// Użyj Firebase Secrets
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;



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
const model = gemini.getGenerativeModel({ model: "gemini-2.5-flash" });

// --- Middleware ---
// Użyj cors z opcjami, aby zezwolić na żądania z Twojej domeny Firebase
app.use(cors({ origin: true }));
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// --- Funkcje pomocnicze ---
const DEFAULT_CATEGORIES = ['spożywcze', 'chemia', 'transport', 'rozrywka', 'zdrowie', 'ubrania', 'dom', 'rachunki', 'kaucje', 'inne'];
const DEFAULT_TAG_DEFINITIONS = {
    nature: [
        { value: 'zmienny', label: 'Zmienny', icon: '📊' },
        { value: 'stały', label: 'Stały', icon: '📌' },
        { value: 'jednorazowy', label: 'Jednorazowy', icon: '⚡' }
    ],
    purpose: [
        { value: 'konieczny', label: 'Konieczny', icon: '🏠' },
        { value: 'przyjemność', label: 'Przyjemność', icon: '🎉' },
        { value: 'inwestycja', label: 'Inwestycja', icon: '📈' }
    ]
};

// Ludzkie etykiety dla predefiniowanych grup
const DEFAULT_GROUP_LABELS = {
    nature: 'Natura',
    purpose: 'Celowość'
};

// Walidacja nazwy grupy tagów (tylko litery, cyfry, podkreślenie, myślnik)
function isValidGroupName(name) {
    return /^[a-z0-9_-]{1,32}$/.test(name);
}

function normalizeTagValue(value) {
    return (value || '').toString().trim().toLowerCase();
}

function normalizeTagGroup(input) {
    const arr = Array.isArray(input) ? input : [];
    const normalized = [];
    arr.forEach(item => {
        const value = normalizeTagValue(item && item.value);
        const label = (item && item.label ? item.label : value).toString().trim();
        if (!value) return;
        if (normalized.some(x => x.value === value)) return;
        normalized.push({
            value,
            label: label || value,
            icon: (item && item.icon ? item.icon : '').toString().trim()
        });
    });
    return normalized;
}

function normalizeTagDefinitions(input) {
    const src = input && typeof input === 'object' ? input : {};
    const out = {};

    // Wczytaj wszystkie istniejące grupy z danych (preservuj kolejność)
    Object.keys(src).forEach(group => {
        if (!group || typeof group !== 'string') return;
        const normalized = normalizeTagGroup(src[group]);
        if (normalized.length > 0) {
            out[group] = normalized;
            if (!out[group].label && src[group + '_label']) {
                out[group + '_label'] = src[group + '_label'];
            }
        }
    });

    // Zachowaj etykiety grup (meta-klucze _label)
    Object.keys(src).forEach(key => {
        if (key.endsWith('_label') && typeof src[key] === 'string') {
            out[key] = src[key];
        }
    });

    // Upewnij się, że nature i purpose mają wartości domyślne jeśli brak
    ['nature', 'purpose'].forEach(group => {
        if (!out[group] || out[group].length === 0) {
            out[group] = DEFAULT_TAG_DEFINITIONS[group].map(t => ({ ...t }));
        }
    });

    return out;
}

function getDefaultTagValue(tagDefinitions, group) {
    const arr = (tagDefinitions && tagDefinitions[group]) || [];
    if (arr.length > 0 && arr[0].value) return arr[0].value;
    return (DEFAULT_TAG_DEFINITIONS[group] && DEFAULT_TAG_DEFINITIONS[group][0] && DEFAULT_TAG_DEFINITIONS[group][0].value) || '';
}

function getTagGroupLabel(tagDefinitions, group) {
    const labelKey = group + '_label';
    if (tagDefinitions && tagDefinitions[labelKey]) return tagDefinitions[labelKey];
    if (DEFAULT_GROUP_LABELS[group]) return DEFAULT_GROUP_LABELS[group];
    // Capitalize first letter as fallback
    return group.charAt(0).toUpperCase() + group.slice(1);
}

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

async function getUserMetadata(userId) {
    const userRef = usersCollection.doc(userId);
    const userDoc = await userRef.get();
    const userData = userDoc.exists ? userDoc.data() : {};

    let structuredCategories = userData.structuredCategories || [];
    let customCategories = userData.customCategories || [];
    const tagDefinitions = normalizeTagDefinitions(userData.tagDefinitions);

    let needsProfileUpdate = false;

    // 1. Migracja płaskich kategorii do struktury V2 (dla starych kont)
    if (structuredCategories.length === 0 && customCategories.length > 0) {
        console.log(`[Sync] Pierwsza migracja kategorii dla ${userId}`);
        structuredCategories = customCategories.map((cat, index) => ({
            id: `migrated-${Date.now()}-${index}`,
            name: cat,
            parentId: null,
            icon: 'fa-tag',
            color: '#3b82f6'
        }));
        needsProfileUpdate = true;
    }

    // 2. Synchronizacja nowych kategorii płaskich do V2 (jeśli dodane starym kodem)
    const structuredNames = new Set(structuredCategories.map(c => c.name.toLowerCase()));
    customCategories.forEach(cat => {
        if (cat && !structuredNames.has(cat.toLowerCase())) {
            structuredCategories.push({
                id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                name: cat,
                parentId: null,
                icon: 'fa-tag',
                color: '#3b82f6'
            });
            needsProfileUpdate = true;
        }
    });

    // 3. Sprawdź miesiące i shopsStale
    const currentMonth = new Date().toISOString().substring(0, 7);
    const availableMonths = userData.availableMonths || [];
    if (!availableMonths.includes(currentMonth)) {
        availableMonths.push(currentMonth);
        availableMonths.sort().reverse();
        needsProfileUpdate = true;
    }

    if (needsProfileUpdate || !userData.metadataInitialized) {
        const updateData = {
            structuredCategories,
            customCategories: [...new Set(structuredCategories.filter(c => !c.parentId).map(c => c.name))].sort(),
            tagDefinitions,
            availableMonths,
            metadataInitialized: true
        };
        await userRef.set(updateData, { merge: true });
        return {
            categories: updateData.customCategories,
            structuredCategories,
            tagDefinitions,
            shops: userData.shops || [],
            availableMonths
        };
    }

    return {
        categories: customCategories,
        structuredCategories,
        tagDefinitions,
        shops: userData.shops || [],
        availableMonths
    };
}

async function getUserCategories(userId) {
    const metadata = await getUserMetadata(userId);
    return {
        flat: metadata.categories,
        structured: metadata.structuredCategories,
        tags: metadata.tagDefinitions
    };
}

async function updateTagInUserData(userId, group, oldValue, newValue, isDelete, fallbackValue) {
    const normalizedOld = normalizeTagValue(oldValue);
    const normalizedNew = normalizeTagValue(newValue);
    const normalizedFallback = normalizeTagValue(fallbackValue);
    const replacement = isDelete ? normalizedFallback : normalizedNew;
    if (!normalizedOld || !replacement) return;

    const purchasesSnapshot = await purchasesCollection.where('userId', '==', userId).get();
    let batch = db.batch();
    let count = 0;
    for (const doc of purchasesSnapshot.docs) {
        const purchase = doc.data();
        let changed = false;
        const updateData = {};

        if (purchase.tags && normalizeTagValue(purchase.tags[group]) === normalizedOld) {
            updateData.tags = { ...purchase.tags, [group]: replacement };
            changed = true;
        }

        if (Array.isArray(purchase.items)) {
            const newItems = purchase.items.map(item => {
                const current = normalizeTagValue(item.tags && item.tags[group]);
                if (current === normalizedOld) {
                    changed = true;
                    return {
                        ...item,
                        tags: {
                            ...(item.tags || {}),
                            [group]: replacement
                        }
                    };
                }
                return item;
            });
            if (changed) updateData.items = newItems;
        }

        if (changed) {
            batch.update(doc.ref, updateData);
            count++;
            if (count >= 400) {
                await batch.commit();
                batch = db.batch();
                count = 0;
            }
        }
    }
    if (count > 0) await batch.commit();

    const recurringSnapshot = await recurringExpensesCollection.where('userId', '==', userId).get();
    batch = db.batch();
    count = 0;
    for (const doc of recurringSnapshot.docs) {
        const expense = doc.data();
        const current = normalizeTagValue(expense.tags && expense.tags[group]);
        if (current === normalizedOld) {
            batch.update(doc.ref, {
                tags: {
                    ...(expense.tags || {}),
                    [group]: replacement
                }
            });
            count++;
            if (count >= 400) {
                await batch.commit();
                batch = db.batch();
                count = 0;
            }
        }
    }
    if (count > 0) await batch.commit();
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
    const prompt = getPrompt(categories, categories.tags || {});

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

function normalizeCategoryName(name) {
    return (name || '').toString().trim().toLowerCase();
}

function namesEqualCI(a, b) {
    return normalizeCategoryName(a) === normalizeCategoryName(b);
}

function mergeUniqueNamesCI(existing = [], namesToAdd = []) {
    const out = [...existing];
    namesToAdd.forEach((name) => {
        if (!name) return;
        const exists = out.some((n) => namesEqualCI(n, name));
        if (!exists) out.push(name);
    });
    return out;
}

function removeNameCI(existing = [], nameToRemove = '') {
    return existing.filter((n) => !namesEqualCI(n, nameToRemove));
}

function renameNameCI(existing = [], oldName = '', newName = '') {
    const withoutOld = removeNameCI(existing, oldName);
    return mergeUniqueNamesCI(withoutOld, [newName]);
}

function resolveOrphanFallback(structuredCategories = [], deletingParentId = null) {
    const remaining = (structuredCategories || []).filter(c => c.id !== deletingParentId && c.parentId !== deletingParentId);
    const parentInne = remaining.find(c => !c.parentId && namesEqualCI(c.name, 'inne'));
    if (!parentInne) {
        return { category: 'inne', subCategory: '' };
    }
    const subPozostale = remaining.find(c => c.parentId === parentInne.id && namesEqualCI(c.name, 'pozostałe'));
    return {
        category: parentInne.name || 'inne',
        subCategory: subPozostale ? (subPozostale.name || '') : ''
    };
}

/**
 * Uniwersalna masowa aktualizacja zakupów dla potrzeb zmiany nazwy lub usuwania kategorii.
 */
async function bulkUpdatePurchasesCategory(userId, oldName, newName, options = {}) {
    const { parentId = null, isDelete = false, fallback = null } = options;
    const fallbackCategory = fallback?.category || 'inne';
    const fallbackSubCategory = fallback?.subCategory || '';

    try {
        const snapshot = await purchasesCollection.where('userId', '==', userId).get();
        if (snapshot.empty) return;

        let parentName = null;
        if (parentId !== null) {
            const userDoc = await usersCollection.doc(userId).get();
            const userData = userDoc.data() || {};
            const parentCat = (userData.structuredCategories || []).find(c => c.id === parentId);
            parentName = parentCat ? parentCat.name : null;
        }

        let batch = db.batch();
        let count = 0;

        for (const doc of snapshot.docs) {
            const purchase = doc.data();
            let changed = false;
            const update = {};

            // 1. Kategoria główna
            if (parentId === null) {
                if (namesEqualCI(purchase.category, oldName)) {
                    update.category = isDelete ? fallbackCategory : newName;
                    changed = true;
                }
                if (Array.isArray(purchase.items)) {
                    const newItems = purchase.items.map(item => {
                        if (namesEqualCI(item.category, oldName)) {
                            changed = true;
                            return {
                                ...item,
                                category: isDelete ? fallbackCategory : newName,
                                subCategory: isDelete ? fallbackSubCategory : (item.subCategory || '')
                            };
                        }
                        return item;
                    });
                    if (changed) update.items = newItems;
                }
            }
            // 2. Podkategoria
            else {
                if (Array.isArray(purchase.items)) {
                    const newItems = purchase.items.map(item => {
                        if (namesEqualCI(item.subCategory, oldName) && namesEqualCI(item.category, parentName)) {
                            changed = true;
                            return { ...item, subCategory: isDelete ? '' : newName };
                        }
                        return item;
                    });
                    if (changed) update.items = newItems;
                }
            }

            if (changed) {
                batch.update(doc.ref, update);
                count++;
                if (count >= 400) {
                    await batch.commit();
                    batch = db.batch();
                    count = 0;
                }
            }
        }
        if (count > 0) await batch.commit();
    } catch (err) {
        console.error(`[BulkUpdate] Błąd dla ${userId}:`, err);
    }
}




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
        const { name, amount, category, subCategory, schedule, tags } = req.body;


        // Walidacja podstawowych pól
        if (!name || !amount || !category || !schedule) {
            return res.status(400).json({ error: 'Pola nazwa, kwota, kategoria i harmonogram są wymagane.' });
        }

        // Walidacja obiektu harmonogramu
        if (typeof schedule !== 'object') {
            return res.status(400).json({ error: 'Harmonogram musi być obiektem.' });
        }

        switch (schedule.type) {
            case 'monthly':
                if (!schedule.dayOfMonth || schedule.dayOfMonth < 1 || schedule.dayOfMonth > 31) {
                    return res.status(400).json({ error: 'Dla harmonogramu miesięcznego wymagany jest prawidłowy dzień miesiąca (1-31).' });
                }
                break;
            case 'weekly':
                if (schedule.dayOfWeek === undefined || schedule.dayOfWeek < 0 || schedule.dayOfWeek > 6) {
                    return res.status(400).json({ error: 'Dla harmonogramu tygodniowego wymagany jest prawidłowy dzień tygodnia (0-6, gdzie 0 to niedziela).' });
                }
                break;
            case 'daily_interval':
                if (!schedule.interval || schedule.interval < 1) {
                    return res.status(400).json({ error: 'Dla harmonogramu interwałowego wymagana jest dodatnia liczba dni.' });
                }
                if (!schedule.startDate) {
                    return res.status(400).json({ error: 'Dla harmonogramu interwałowego wymagana jest data początkowa.' });
                }
                break;
            default:
                return res.status(400).json({ error: `Nieznany typ harmonogramu: ${schedule.type}` });
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
            subCategory: subCategory || '',
            tags: tags || {},
            schedule, // Zapisujemy cały obiekt harmonogramu
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

// PUT: Aktualizuj definicję wydatku cyklicznego
app.put('/api/recurring-expenses/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, amount, category, subCategory, schedule, tags } = req.body;

        // Walidacja podstawowych pól
        if (!name || !amount || !category || !schedule) {
            return res.status(400).json({ error: 'Pola nazwa, kwota, kategoria i harmonogram są wymagane.' });
        }

        // Walidacja obiektu harmonogramu
        if (typeof schedule !== 'object') {
            return res.status(400).json({ error: 'Harmonogram musi być obiektem.' });
        }

        switch (schedule.type) {
            case 'monthly':
                if (!schedule.dayOfMonth || schedule.dayOfMonth < 1 || schedule.dayOfMonth > 31) {
                    return res.status(400).json({ error: 'Dla harmonogramu miesięcznego wymagany jest prawidłowy dzień miesiąca (1-31).' });
                }
                break;
            case 'weekly':
                if (schedule.dayOfWeek === undefined || schedule.dayOfWeek < 0 || schedule.dayOfWeek > 6) {
                    return res.status(400).json({ error: 'Dla harmonogramu tygodniowego wymagany jest prawidłowy dzień tygodnia (0-6, gdzie 0 to niedziela).' });
                }
                break;
            case 'daily_interval':
                if (!schedule.interval || schedule.interval < 1) {
                    return res.status(400).json({ error: 'Dla harmonogramu interwałowego wymagana jest dodatnia liczba dni.' });
                }
                if (!schedule.startDate) {
                    return res.status(400).json({ error: 'Dla harmonogramu interwałowego wymagana jest data początkowa.' });
                }
                break;
            default:
                return res.status(400).json({ error: `Nieznany typ harmonogramu: ${schedule.type}` });
        }

        const expenseRef = recurringExpensesCollection.doc(id);
        const doc = await expenseRef.get();

        if (!doc.exists || doc.data().userId !== req.userId) {
            return res.status(403).json({ error: 'Brak uprawnień lub wydatek nie istnieje.' });
        }

        const updatedExpense = {
            name,
            amount: parseFloat(amount),
            category,
            subCategory: subCategory || '',
            tags: tags || {},
            schedule, // Zapisujemy cały obiekt harmonogramu
            updatedAt: new Date()
        };

        await expenseRef.update(updatedExpense);
        res.json({ id, ...updatedExpense });
    } catch (error) {
        console.error("Błąd aktualizacji wydatku cyklicznego:", error);
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
        const { lastVisible, keyword, category, subCategory, shop, budget, minAmount, maxAmount, startDate, endDate } = req.query;
        const limit = 30; // Liczba zakupów na stronę dla paginacji

        const isAnyFilterActive = keyword || category || subCategory || shop || budget || minAmount || maxAmount || startDate || endDate;

        let query = purchasesCollection.where('userId', '==', req.userId);

        if (startDate) {
            query = query.where('date', '>=', startDate);
        }
        if (endDate) {
            query = query.where('date', '<=', endDate);
        }

        // Jeśli filtry są aktywne, pobieramy wszystkie pasujące dane bez paginacji.
        // Jeśli nie, stosujemy paginację.
        if (isAnyFilterActive) {
            // Firestore pobierze już znacznie mniejszą ilość danych ze względu na `where('date')`
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
            if (category || subCategory) {
                purchases = purchases.filter(p =>
                    p.items.some(item => {
                        const matchesCategory = !category || item.category === category;
                        const matchesSubCategory = !subCategory || (item.subCategory || '') === subCategory;
                        return matchesCategory && matchesSubCategory;
                    })
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
        const metadata = await getUserMetadata(req.userId);
        res.json(metadata.shops || []);
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

        // Zaktualizuj metadane użytkownika
        const dateMonth = date.substring(0, 7);
        const newCategories = items.map(item => item.category).filter(Boolean);
        const updateData = {
            shops: FieldValue.arrayUnion(shop),
            availableMonths: FieldValue.arrayUnion(dateMonth)
        };
        if (newCategories.length > 0) {
            updateData.customCategories = FieldValue.arrayUnion(...newCategories);
        }
        await usersCollection.doc(req.userId).set(updateData, { merge: true });

        res.status(201).json({ id: docRef.id, ...newPurchase });
    } catch (error) {
        console.error("Błąd dodawania zakupu:", error);
        res.status(500).json({ error: 'Błąd serwera podczas dodawania zakupu' });
    }
});

// PUT: Aktualizuj istniejący zakup
app.put('/api/purchases/:id', authMiddleware, async (req, res) => {
    console.log('Executing purchase update - v4'); // New version
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
        // We don't need to include fields that don't change, like createdAt
        const updatedPurchaseData = {
            shop,
            date,
            items,
            totalAmount,
            updatedAt: new Date()
        };

        if (specialBudgetId) {
            updatedPurchaseData.specialBudgetId = specialBudgetId;
        } else {
            updatedPurchaseData.specialBudgetId = FieldValue.delete();
        }

        // Use update() instead of set()
        await purchaseRef.update(updatedPurchaseData);

        // Zaktualizuj metadane użytkownika
        const dateMonth = date.substring(0, 7);
        const newCategories = items.map(item => item.category).filter(Boolean);
        const updateData = {
            shops: FieldValue.arrayUnion(shop),
            availableMonths: FieldValue.arrayUnion(dateMonth)
        };
        if (newCategories.length > 0) {
            updateData.customCategories = FieldValue.arrayUnion(...newCategories);
        }
        await usersCollection.doc(req.userId).set(updateData, { merge: true });

        // Create a clean object for the JSON response
        const responseData = {
            id: doc.id,
            shop,
            date,
            items,
            totalAmount,
            userId: doc.data().userId,
            createdAt: doc.data().createdAt.toDate().toISOString(),
            updatedAt: updatedPurchaseData.updatedAt
        };
        if (specialBudgetId) {
            responseData.specialBudgetId = specialBudgetId;
        }


        res.json(responseData);

    } catch (error) {
        console.error("Błąd aktualizacji zakupu (v4):", error); // Added version to error log
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
        // Oznacz listę sklepów jako nieaktualną, aby została odświeżona przy następnym pobieraniu metadanych
        await usersCollection.doc(req.userId).update({ shopsStale: true });
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
        res.json(categories.flat); // <-- zmiana
    } catch (error) {
        console.error("Błąd pobierania kategorii:", error);
        res.status(500).json({ error: 'Błąd serwera podczas pobierania kategorii' });
    }
});

// GET: Pobierz strukturę 2-poziomowych kategorii dla użytkownika (v2)
app.get('/api/categories/v2', authMiddleware, async (req, res) => {
    try {
        const userRef = usersCollection.doc(req.userId);
        const userDoc = await userRef.get();
        const userData = userDoc.exists ? userDoc.data() : {};

        // Domyślna struktura bazy:
        // structuredCategories: [
        //   { id: '1', name: 'Spożywcze', parentId: null, color: '#ff0000', icon: 'fa-apple-alt' },
        //   { id: '2', name: 'Jedzenie/Napoje', parentId: '1' }
        // ]
        const structuredCategories = userData.structuredCategories || [];
        res.json(structuredCategories);
    } catch (error) {
        console.error("Błąd pobierania kategorii hierarchicznych:", error);
        res.status(500).json({ error: 'Błąd serwera podczas pobierania kategorii w wersji 2' });
    }
});

app.get('/api/tags', authMiddleware, async (req, res) => {
    try {
        const metadata = await getUserMetadata(req.userId);
        res.json(metadata.tagDefinitions || normalizeTagDefinitions(null));
    } catch (error) {
        console.error("Błąd pobierania tagów:", error);
        res.status(500).json({ error: 'Błąd serwera podczas pobierania tagów.' });
    }
});

// POST: Dodaj nową grupę tagów
app.post('/api/tags/groups', authMiddleware, async (req, res) => {
    try {
        const { group, label, firstValue, firstLabel, firstIcon } = req.body;
        const groupKey = normalizeTagValue(group).replace(/\s+/g, '_');
        if (!groupKey || !isValidGroupName(groupKey)) {
            return res.status(400).json({ error: 'Nieprawidłowa nazwa grupy. Użyj tylko liter, cyfr, myślnika lub podkreślenia.' });
        }
        if (['nature', 'purpose'].includes(groupKey)) {
            return res.status(400).json({ error: 'Nie można tworzyć grupy o tej nazwie.' });
        }
        const userRef = usersCollection.doc(req.userId);
        const userDoc = await userRef.get();
        const userData = userDoc.exists ? userDoc.data() : {};
        const tagDefinitions = normalizeTagDefinitions(userData.tagDefinitions || {});
        if (tagDefinitions[groupKey]) {
            return res.status(400).json({ error: 'Grupa o tej nazwie już istnieje.' });
        }
        const fv = normalizeTagValue(firstValue || firstLabel || 'domyślny');
        const fl = (firstLabel || firstValue || 'Domyślny').toString().trim();
        tagDefinitions[groupKey] = [{ value: fv, label: fl, icon: (firstIcon || '').trim() }];
        tagDefinitions[groupKey + '_label'] = (label || groupKey).toString().trim();
        await userRef.set({ tagDefinitions }, { merge: true });
        res.status(201).json({ success: true, tagDefinitions });
    } catch (error) {
        console.error("Błąd tworzenia grupy tagów:", error);
        res.status(500).json({ error: 'Błąd serwera podczas tworzenia grupy tagów.' });
    }
});

// Trasa zapasowa (usunięto duplikat)

// PUT: Aktualizuj etykietę grupy tagów
app.put('/api/tags/groups/:group', authMiddleware, async (req, res) => {
    try {
        const group = normalizeTagValue(req.params.group);
        const { label } = req.body;
        if (!label) return res.status(400).json({ error: 'Etykieta jest wymagana.' });

        const userRef = usersCollection.doc(req.userId);
        const userDoc = await userRef.get();
        const userData = userDoc.exists ? userDoc.data() : {};
        const tagDefinitions = normalizeTagDefinitions(userData.tagDefinitions || {});

        if (!tagDefinitions[group]) {
            return res.status(404).json({ error: 'Grupa nie istnieje.' });
        }

        tagDefinitions[group + '_label'] = label;
        await userRef.set({ tagDefinitions }, { merge: true });
        res.json({ success: true, tagDefinitions });
    } catch (error) {
        console.error("Błąd aktualizacji etykiety grupy:", error);
        res.status(500).json({ error: 'Błąd serwera.' });
    }
});

// DELETE: Usuń całą grupę tagów (z czyszczeniem danych)
app.delete('/api/tags/groups/:group', authMiddleware, async (req, res) => {
    try {
        const group = normalizeTagValue(req.params.group);
        if (!group) return res.status(400).json({ error: 'Nazwa grupy jest wymagana.' });
        if (['nature', 'purpose'].includes(group)) {
            return res.status(400).json({ error: 'Nie można usunąć wbudowanych grup tagów.' });
        }

        const userRef = usersCollection.doc(req.userId);
        const userDoc = await userRef.get();
        const userData = userDoc.exists ? userDoc.data() : {};
        const tagDefinitions = normalizeTagDefinitions(userData.tagDefinitions || {});

        if (!tagDefinitions[group]) {
            return res.status(404).json({ error: 'Grupa nie istnieje.' });
        }

        // 1. Usuń definicję z metadanych
        delete tagDefinitions[group];
        delete tagDefinitions[group + '_label'];
        await userRef.update({ tagDefinitions });

        // 2. Kaskadowe czyszczenie w zakupach i wydatkach cyklicznych
        await deleteTagGroupFromUserData(req.userId, group);

        res.json({ success: true, tagDefinitions });
    } catch (error) {
        console.error("Błąd całkowitego usuwania grupy tagów:", error);
        res.status(500).json({ error: 'Błąd serwera podczas usuwania grupy tagów.' });
    }
});

async function deleteTagGroupFromUserData(userId, group) {
    console.log(`[Cleanup] Usuwanie grupy tagów '${group}' dla użytkownika ${userId}`);

    // A. Czyszczenie zakupów
    const purchasesSnapshot = await purchasesCollection.where('userId', '==', userId).get();
    let batch = db.batch();
    let count = 0;

    for (const doc of purchasesSnapshot.docs) {
        const purchase = doc.data();
        let changed = false;
        const updateData = {};

        // Usuń z poziomu zakupu (legacy)
        if (purchase.tags && purchase.tags[group] !== undefined) {
            const newTags = { ...purchase.tags };
            delete newTags[group];
            updateData.tags = newTags;
            changed = true;
        }

        // Usuń z poziomów przedmiotów
        if (Array.isArray(purchase.items)) {
            const newItems = purchase.items.map(item => {
                if (item.tags && item.tags[group] !== undefined) {
                    changed = true;
                    const itags = { ...item.tags };
                    delete itags[group];
                    return { ...item, tags: itags };
                }
                return item;
            });
            if (changed) updateData.items = newItems;
        }

        if (changed) {
            batch.update(doc.ref, updateData);
            count++;
            if (count >= 400) {
                await batch.commit();
                batch = db.batch();
                count = 0;
            }
        }
    }
    if (count > 0) await batch.commit();

    // B. Czyszczenie wydatków cyklicznych
    const recurringSnapshot = await recurringExpensesCollection.where('userId', '==', userId).get();
    batch = db.batch();
    count = 0;
    for (const doc of recurringSnapshot.docs) {
        const expense = doc.data();
        if (expense.tags && expense.tags[group] !== undefined) {
            const newTags = { ...expense.tags };
            delete newTags[group];
            batch.update(doc.ref, { tags: newTags });
            count++;
            if (count >= 400) {
                await batch.commit();
                batch = db.batch();
                count = 0;
            }
        }
    }
    if (count > 0) await batch.commit();
    console.log(`[Cleanup] Zakończono usuwanie grupy '${group}'.`);
}

app.post('/api/tags/:group', authMiddleware, async (req, res) => {
    try {
        const group = normalizeTagValue(req.params.group).replace(/\s+/g, '_');
        if (!group || !isValidGroupName(group)) {
            return res.status(400).json({ error: 'Nieprawidłowa nazwa grupy tagów.' });
        }
        const value = normalizeTagValue(req.body.value);
        const label = (req.body.label || value).toString().trim();
        const icon = (req.body.icon || '').toString().trim();
        if (!value) return res.status(400).json({ error: 'Wartość tagu jest wymagana.' });

        const userRef = usersCollection.doc(req.userId);
        const userDoc = await userRef.get();
        const userData = userDoc.exists ? userDoc.data() : {};
        const tagDefinitions = normalizeTagDefinitions(userData.tagDefinitions || {});
        if (!tagDefinitions[group]) tagDefinitions[group] = [];
        if (tagDefinitions[group].some(t => t.value === value)) {
            return res.status(400).json({ error: 'Tag o tej wartości już istnieje.' });
        }
        tagDefinitions[group].push({ value, label: label || value, icon });
        await userRef.update({ tagDefinitions });
        res.status(201).json({ success: true, tagDefinitions });
    } catch (error) {
        console.error("Błąd dodawania tagu:", error);
        res.status(500).json({ error: 'Błąd serwera podczas dodawania tagu.' });
    }
});

app.put('/api/tags/:group/:value', authMiddleware, async (req, res) => {
    try {
        const group = normalizeTagValue(req.params.group);
        const oldValue = normalizeTagValue(req.params.value);
        if (!group || !isValidGroupName(group)) {
            return res.status(400).json({ error: 'Nieprawidłowa nazwa grupy tagów.' });
        }
        const newValue = normalizeTagValue(req.body.value);
        const label = (req.body.label || newValue).toString().trim();
        const icon = (req.body.icon || '').toString().trim();
        if (!oldValue || !newValue) return res.status(400).json({ error: 'Wartość tagu jest wymagana.' });

        const userRef = usersCollection.doc(req.userId);
        const userDoc = await userRef.get();
        const userData = userDoc.exists ? userDoc.data() : {};
        const tagDefinitions = normalizeTagDefinitions(userData.tagDefinitions);
        const idx = tagDefinitions[group].findIndex(t => t.value === oldValue);
        if (idx === -1) return res.status(404).json({ error: 'Tag nie istnieje.' });
        if (oldValue !== newValue && tagDefinitions[group].some(t => t.value === newValue)) {
            return res.status(400).json({ error: 'Tag o tej wartości już istnieje.' });
        }
        tagDefinitions[group][idx] = { value: newValue, label: label || newValue, icon };
        await userRef.update({ tagDefinitions });

        if (oldValue !== newValue) {
            const fallback = getDefaultTagValue(tagDefinitions, group);
            await updateTagInUserData(req.userId, group, oldValue, newValue, false, fallback);
        }

        res.json({ success: true, tagDefinitions });
    } catch (error) {
        console.error("Błąd aktualizacji tagu:", error);
        res.status(500).json({ error: 'Błąd serwera podczas aktualizacji tagu.' });
    }
});

app.delete('/api/tags/:group/:value', authMiddleware, async (req, res) => {
    try {
        const group = normalizeTagValue(req.params.group);
        const targetValue = normalizeTagValue(req.params.value);
        if (!group || !isValidGroupName(group)) {
            return res.status(400).json({ error: 'Nieprawidłowa nazwa grupy tagów.' });
        }
        if (!targetValue) return res.status(400).json({ error: 'Wartość tagu jest wymagana.' });

        const userRef = usersCollection.doc(req.userId);
        const userDoc = await userRef.get();
        const userData = userDoc.exists ? userDoc.data() : {};
        const tagDefinitions = normalizeTagDefinitions(userData.tagDefinitions);
        const before = tagDefinitions[group].length;
        tagDefinitions[group] = tagDefinitions[group].filter(t => t.value !== targetValue);
        if (tagDefinitions[group].length === before) {
            return res.status(404).json({ error: 'Tag nie istnieje.' });
        }
        if (tagDefinitions[group].length === 0) {
            return res.status(400).json({ error: 'Nie można usunąć ostatniego tagu z grupy.' });
        }
        const fallback = getDefaultTagValue(tagDefinitions, group);
        await userRef.update({ tagDefinitions });
        await updateTagInUserData(req.userId, group, targetValue, '', true, fallback);
        res.json({ success: true, tagDefinitions });
    } catch (error) {
        console.error("Błąd usuwania tagu:", error);
        res.status(500).json({ error: 'Błąd serwera podczas usuwania tagu.' });
    }
});

// POST: Zapisz całą strukturę hierarchicznych kategorii na nowo (v2)
app.post('/api/categories/v2', authMiddleware, async (req, res) => {
    try {
        const { structuredCategories } = req.body;
        if (!Array.isArray(structuredCategories)) {
            return res.status(400).json({ error: 'Brak tablicy structuredCategories.' });
        }

        const userRef = usersCollection.doc(req.userId);
        const userDoc = await userRef.get();
        const userData = userDoc.exists ? userDoc.data() : {};
        const parentNames = structuredCategories.filter(c => !c.parentId).map(c => c.name).filter(Boolean);
        const mergedCustom = mergeUniqueNamesCI(userData.customCategories || [], parentNames);

        await userRef.update({
            structuredCategories: structuredCategories,
            customCategories: mergedCustom
        });

        res.status(200).json({ success: true });
    } catch (error) {
        console.error("Błąd zapisu kategorii hierarchicznych (v2):", error);
        res.status(500).json({ error: 'Błąd serwera podczas zapisywania kategorii v2.' });
    }
});

// PUT: Aktualizuj pojedynczą kategorię w strukturze (v2) — zmień nazwę, ikonę lub kolor
app.put('/api/categories/v2/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, icon, color } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Nazwa kategorii jest wymagana.' });
        }

        const userRef = usersCollection.doc(req.userId);
        const userDoc = await userRef.get();
        const userData = userDoc.exists ? userDoc.data() : {};
        let cats = userData.structuredCategories || [];

        const idx = cats.findIndex(c => c.id === id);
        if (idx === -1) {
            return res.status(404).json({ error: 'Kategoria nie znaleziona.' });
        }

        const oldCat = cats[idx];
        const oldName = oldCat.name;
        const parentId = oldCat.parentId || null;
        const siblingExists = cats.some((c, i) =>
            i !== idx &&
            (c.parentId || null) === parentId &&
            namesEqualCI(c.name, name)
        );
        if (siblingExists) {
            return res.status(400).json({ error: 'Kategoria o tej nazwie już istnieje na tym poziomie.' });
        }

        cats[idx] = { ...cats[idx], name };
        if (icon !== undefined) cats[idx].icon = icon;
        if (color !== undefined) cats[idx].color = color;

        let customCategories = userData.customCategories || [];
        if (parentId === null) {
            customCategories = renameNameCI(customCategories, oldName, name);
        }

        await userRef.update({ structuredCategories: cats, customCategories });

        // Jeśli nazwa się zmieniła, zaktualizuj wszystkie zakupy
        if (oldName !== name) {
            await bulkUpdatePurchasesCategory(req.userId, oldName, name, { parentId, isDelete: false });
        }

        res.json({ success: true, category: cats[idx] });
    } catch (error) {
        console.error("Błąd aktualizacji kategorii v2:", error);
        res.status(500).json({ error: 'Błąd serwera podczas aktualizacji kategorii v2.' });
    }
});

// DELETE: Usuń kategorię (v2) — jeśli główna, usuwa też jej podkategorie
app.delete('/api/categories/v2/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const userRef = usersCollection.doc(req.userId);
        const userDoc = await userRef.get();
        const userData = userDoc.exists ? userDoc.data() : {};
        let cats = userData.structuredCategories || [];

        const target = cats.find(c => c.id === id);
        if (!target) {
            return res.status(404).json({ error: 'Kategoria nie znaleziona.' });
        }

        const oldName = target.name;
        const parentId = target.parentId || null;

        // 1. Kaskadowa aktualizacja zakupów
        if (parentId === null) {
            fallback = resolveOrphanFallback(cats, id);
            await bulkUpdatePurchasesCategory(req.userId, oldName, '', { fallback, isDelete: true });
        } else {
            await bulkUpdatePurchasesCategory(req.userId, oldName, '', { parentId, isDelete: true });
        }

        // 2. Usunięcie z definicji kategorii
        if (target.parentId === null || target.parentId === undefined) {
            cats = cats.filter(c => c.id !== id && c.parentId !== id);
        } else {
            cats = cats.filter(c => c.id !== id);
        }

        const updatedCustom = parentId === null
            ? mergeUniqueNamesCI(
                removeNameCI(userData.customCategories || [], oldName),
                [fallback?.category || 'inne']
            )
            : (userData.customCategories || []);

        await userRef.update({ structuredCategories: cats, customCategories: updatedCustom });
        res.json({ success: true });
    } catch (error) {
        console.error("Błąd usuwania kategorii v2:", error);
        res.status(500).json({ error: 'Błąd serwera podczas usuwania kategorii v2.' });
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
        // Krok 1: Zaktualizuj nazwę w liście niestandardowej i strukturze użytkownika
        const userRef = usersCollection.doc(req.userId);
        await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                throw new Error("User not found");
            }
            const userData = userDoc.data() || {};
            const hasStructuredConflict = (userData.structuredCategories || []).some(cat =>
                !cat.parentId &&
                namesEqualCI(cat.name, newNameLower) &&
                !namesEqualCI(cat.name, oldName)
            );
            if (hasStructuredConflict) {
                throw new Error('Kategoria o tej nazwie już istnieje.');
            }
            const customCategories = renameNameCI(userData.customCategories || [], oldName, newNameLower);
            const structuredCategories = (userData.structuredCategories || []).map(cat => {
                if (!cat.parentId && namesEqualCI(cat.name, oldName)) {
                    return { ...cat, name: newNameLower };
                }
                return cat;
            });

            transaction.update(userRef, { customCategories, structuredCategories });
        });

        // Krok 2: Zaktualizuj nazwę w istniejących zakupach
        await bulkUpdatePurchasesCategory(req.userId, oldName, newNameLower, { isDelete: false });

        // Krok 3: Zaktualizuj nazwę w istniejących budżetach
        const budgetsSnapshot = await db.collection('budgets').where('userId', '==', req.userId).get();
        if (!budgetsSnapshot.empty) {
            const batch = db.batch();
            budgetsSnapshot.docs.forEach(doc => {
                const budgetData = doc.data();
                if (budgetData.budgets && typeof budgetData.budgets === 'object') {
                    const oldBudgetKey = Object.keys(budgetData.budgets).find(k => namesEqualCI(k, oldName));
                    if (!oldBudgetKey) return;
                    const newBudgets = { ...budgetData.budgets };
                    newBudgets[newNameLower] = newBudgets[oldBudgetKey];
                    delete newBudgets[oldBudgetKey];
                    batch.update(doc.ref, { budgets: newBudgets });
                }
            });
            await batch.commit();
        }

        res.json({ success: true, message: `Kategoria '${oldName}' została zmieniona na '${newNameLower}'.` });

    } catch (error) {
        console.error("Błąd zmiany nazwy kategorii:", error);
        if (error && error.message === 'Kategoria o tej nazwie już istnieje.') {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Błąd serwera podczas zmiany nazwy kategorii.' });
    }
});

// DELETE: Usuń kategorię (aktualizuje zakupy, profil użytkownika i wszystkie budżety)
app.delete('/api/categories/:name', authMiddleware, async (req, res) => {
    const { name } = req.params;

    try {
        const userRef = usersCollection.doc(req.userId);
        const userDoc = await userRef.get();
        const userData = userDoc.exists ? userDoc.data() : {};
        const structured = userData.structuredCategories || [];
        const targetParent = structured.find(c => !c.parentId && namesEqualCI(c.name, name));
        const fallback = resolveOrphanFallback(structured, targetParent ? targetParent.id : null);

        // Krok 1: Zaktualizuj kategorię w istniejących zakupach na fallback
        await bulkUpdatePurchasesCategory(req.userId, name, '', { isDelete: true, fallback });

        // Krok 2: Usuń kategorię z listy niestandardowej i struktury profilu użytkownika
        const newStructured = targetParent
            ? structured.filter(c => c.id !== targetParent.id && c.parentId !== targetParent.id)
            : structured;
        await userRef.update({
            customCategories: removeNameCI(userData.customCategories || [], name),
            structuredCategories: newStructured
        });

        // Krok 3: Usuń kategorię ze wszystkich zdefiniowanych budżetów tego użytkownika
        const budgetsSnapshot = await db.collection('budgets').where('userId', '==', req.userId).get();
        if (!budgetsSnapshot.empty) {
            const batch = db.batch();
            budgetsSnapshot.docs.forEach(doc => {
                const budgetData = doc.data();
                // Sprawdź, czy usuwana kategoria istnieje w tym budżecie
                if (budgetData.budgets && typeof budgetData.budgets === 'object') {
                    const budgetKey = Object.keys(budgetData.budgets).find(k => namesEqualCI(k, name));
                    if (!budgetKey) return;
                    const newBudgets = { ...budgetData.budgets };
                    delete newBudgets[budgetKey];
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

        await budgetRef.set(budgetData); // Nie używamy merge, aby nadpisać cały dokument (w tym obiekt budgets)

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

        // Pobranie dostępnych miesięcy z metadanych zamiast skanowania całej bazy
        const metadata = await getUserMetadata(req.userId);
        const availableMonths = metadata.availableMonths || [];

        // Ustalanie okresu do analizy
        const targetDate = (year && month) ? new Date(parseInt(year), parseInt(month) - 1, 15) : new Date();
        const firstDayOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1).toISOString().split('T')[0];
        const lastDayOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).toISOString().split('T')[0];

        // Pobranie TYLKO zakupów z danego miesiąca, by zoptymalizować reads
        const snapshot = await purchasesCollection
            .where('userId', '==', req.userId)
            .where('date', '>=', firstDayOfMonth)
            .where('date', '<=', lastDayOfMonth)
            .get();

        const purchasesInMonth = snapshot.docs.map(doc => doc.data());

        // Filtruj wydatki, aby wykluczyć te ze specjalnych budżetów
        const monthlyPurchases = purchasesInMonth.filter(p => !p.specialBudgetId);

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
        const { mode, category, subCategory, nature, purpose, mtd } = req.query;
        const isMtdMode = mtd === 'true' || mode === 'mtd';
        const today = new Date();
        const targetDay = today.getDate();

        let startDateStr;
        let endDateStr;
        let expectedMonths = [];

        if (mode === '6months') {
            const d = new Date(today.getFullYear(), today.getMonth() - 5, 1);
            startDateStr = d.toISOString().split('T')[0];
            endDateStr = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
            for (let i = 5; i >= 0; i--) {
                const m = new Date(today.getFullYear(), today.getMonth() - i, 1);
                expectedMonths.push(m.toISOString().substring(0, 7));
            }
        } else if (mode === 'year') {
            const targetYear = req.query.year || today.getFullYear();
            startDateStr = `${targetYear}-01-01`;
            endDateStr = `${targetYear}-12-31`;
            for (let i = 1; i <= 12; i++) {
                expectedMonths.push(`${targetYear}-${String(i).padStart(2, '0')}`);
            }
        } else {
            // Default: last 12 months
            const d = new Date(today.getFullYear() - 1, today.getMonth() + 1, 1);
            startDateStr = d.toISOString().split('T')[0];
            endDateStr = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
            for (let i = 11; i >= 0; i--) {
                const m = new Date(today.getFullYear(), today.getMonth() - i, 1);
                expectedMonths.push(m.toISOString().substring(0, 7));
            }
        }

        let query = purchasesCollection
            .where('userId', '==', req.userId)
            .where('date', '>=', startDateStr)
            .where('date', '<=', endDateStr);

        const snapshot = await query.get();

        if (snapshot.empty) {
            const emptyTotals = expectedMonths.map(month => ({ month, total: 0 }));
            return res.json({ monthlyTotals: emptyTotals });
        }

        const purchases = snapshot.docs.map(doc => doc.data()).filter(p => !p.specialBudgetId);

        console.log(`Generowanie porównania. Tryb: ${mode || 'full'}`);

        const monthlyTotalsMap = purchases.reduce((acc, p) => {
            const month = p.date.substring(0, 7); // YYYY-MM
            let amount = 0;

            // Zidentyfikuj wszystkie filtry tag\u00f3w z query (pomi\u0144 standardowe pola)
            const standardParams = ['mode', 'category', 'subCategory', 'mtd', 'year'];
            const tagFilters = Object.keys(req.query)
                .filter(key => !standardParams.includes(key) && req.query[key])
                .reduce((acc, key) => {
                    acc[key] = normalizeTagValue(req.query[key]);
                    return acc;
                }, {});

            if (category || subCategory || Object.keys(tagFilters).length > 0) {
                amount = (p.items || [])
                    .filter(item => {
                        let match = true;
                        if (category && (item.category || 'inne') !== category) match = false;
                        if (subCategory && (item.subCategory || '') !== subCategory) match = false;

                        // Dynamiczne sprawdzanie wszystkich filtr\u00f3w tag\u00f3w
                        for (const [group, targetValue] of Object.entries(tagFilters)) {
                            const itemTagValue = normalizeTagValue((item.tags && item.tags[group]) || (p.tags && p.tags[group]));
                            if (itemTagValue !== targetValue) {
                                match = false;
                                break;
                            }
                        }

                        return match;
                    })
                    .reduce((sum, item) => sum + (item.price || 0), 0);
            } else {
                amount = p.totalAmount || 0;
            }

            if (amount === 0) return acc;

            if (isMtdMode) {
                const purchaseDate = new Date(p.date);
                if (purchaseDate.getDate() <= targetDay) {
                    acc[month] = (acc[month] || 0) + amount;
                }
            } else {
                acc[month] = (acc[month] || 0) + amount;
            }

            return acc;
        }, {});

        const monthlyTotals = expectedMonths.map(month => ({
            month,
            total: monthlyTotalsMap[month] || 0
        }));

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

        const firstDayOfMonth = new Date(parseInt(year), parseInt(month) - 1, 1).toISOString().split('T')[0];
        const lastDayOfMonth = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];

        const snapshot = await purchasesCollection
            .where('userId', '==', req.userId)
            .where('date', '>=', firstDayOfMonth)
            .where('date', '<=', lastDayOfMonth)
            .get();

        if (snapshot.empty) {
            return res.json({ spendingByShop: {} });
        }

        // Wyklucz wydatki ze specjalnych budżetów oraz wydatki cykliczne
        const monthlyPurchases = snapshot.docs.map(doc => doc.data())
            .filter(p => !p.specialBudgetId && p.shop !== 'Wydatek cykliczny');

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
}); ""

app.get('/api/statistics/category-details', authMiddleware, async (req, res) => {
    try {
        const { year, month, category } = req.query;
        if (!year || !month || !category) {
            return res.status(400).json({ error: 'Rok, miesiąc i kategoria są wymagane.' });
        }

        const firstDayOfMonth = new Date(parseInt(year), parseInt(month) - 1, 1).toISOString().split('T')[0];
        const lastDayOfMonth = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];

        const snapshot = await purchasesCollection
            .where('userId', '==', req.userId)
            .where('date', '>=', firstDayOfMonth)
            .where('date', '<=', lastDayOfMonth)
            .get();

        if (snapshot.empty) {
            return res.json({ items: [] });
        }

        const monthlyPurchases = snapshot.docs.map(doc => doc.data());

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

// Funkcja pomocnicza do określania, czy wydatek cykliczny powinien zostać dodany dzisiaj
function shouldAddExpenseToday(expense, today) {
    const lastAddedDate = expense.lastAdded
        ? new Date(expense.lastAdded)
        : new Date(expense.createdAt.toDate());

    const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    const lastAddedUTC = new Date(Date.UTC(lastAddedDate.getFullYear(), lastAddedDate.getMonth(), lastAddedDate.getDate()));

    if (lastAddedUTC.getTime() === todayUTC.getTime()) {
        return false;
    }

    switch (expense.schedule.type) {
        case 'monthly': {
            const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
            const dueDay = Math.min(expense.schedule.dayOfMonth, daysInMonth);
            const dueDateUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), dueDay));

            return todayUTC >= dueDateUTC && lastAddedUTC < dueDateUTC;
        }

        case 'weekly': {
            const daysSinceLastAdded = Math.floor((todayUTC - lastAddedUTC) / (1000 * 60 * 60 * 24));
            return daysSinceLastAdded >= 7;
        }

        case 'daily_interval': {
            const startDate = new Date(expense.schedule.startDate);
            const startUTC = new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()));

            if (todayUTC < startUTC) return false;

            const daysSinceLast = Math.floor((todayUTC - lastAddedUTC) / (1000 * 60 * 60 * 24));
            return daysSinceLast >= expense.schedule.interval;
        }

        default:
            return false;
    }
};

exports.addRecurringExpensesScheduled = onSchedule('every 24 hours', async (event) => {
    console.log('Uruchomiono zaplanowane dodawanie wydatków cyklicznych.');
    const today = new Date();
    const recurringSnapshot = await recurringExpensesCollection.get();

    if (recurringSnapshot.empty) {
        console.log('Brak zdefiniowanych wydatków cyklicznych. Zakończono.');
        return null;
    }

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
            if (shouldAddExpenseToday(expense, today)) {
                const newPurchaseDate = today.toISOString().split('T')[0];

                const newPurchase = {
                    userId: userId,
                    shop: "Wydatek cykliczny",
                    date: newPurchaseDate,
                    items: [{
                        name: expense.name,
                        price: expense.amount,
                        category: expense.category,
                        subCategory: expense.subCategory || '',
                        tags: expense.tags || {}
                    }],
                    totalAmount: expense.amount,
                    tags: expense.tags || {}, // Legacy support
                    createdAt: new Date(),
                    isRecurring: true
                };

                const newPurchaseRef = purchasesCollection.doc();
                batch.set(newPurchaseRef, newPurchase);
                anyNewPurchases = true;

                // Zaktualizuj lastAdded na dzisiejszą datę
                const expenseRef = recurringExpensesCollection.doc(expense.id);
                batch.update(expenseRef, { lastAdded: newPurchaseDate });
            }
        }

        if (anyNewPurchases) {
            try {
                await batch.commit();
                console.log(`Pomyślnie dodano nowe wydatki cykliczne dla użytkownika: ${userId}`);

                // Zaktualizuj metadane użytkownika (dostępne miesiące)
                const dateMonth = today.toISOString().substring(0, 7);
                await usersCollection.doc(userId).set({
                    availableMonths: FieldValue.arrayUnion(dateMonth)
                }, { merge: true });
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
    secrets: ['GEMINI_API_KEY', 'MIGRATION_SECRET_KEY']
}, app);

// WERSJA TESTOWA (Side-by-side) dla linku preview
exports.api_v2 = exports.api;