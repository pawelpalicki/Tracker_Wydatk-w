const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const express = require('express');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Inicjalizacja Firebase
if (getApps().length === 0) {
    initializeApp();
}

const db = getFirestore();
const usersCollection = db.collection('users');
const purchasesCollection = db.collection('expenses');
const recurringExpensesCollection = db.collection('recurringExpenses');

// Importy middleware
const { errorHandler } = require('./middleware');

// Importy routerów
const authRoutes = require('./routes/auth');
const purchaseRoutes = require('./routes/purchases');
const categoryRoutes = require('./routes/categories');
const budgetRoutes = require('./routes/budgets');
const statisticsRoutes = require('./routes/statistics');
const aiRoutes = require('./routes/ai');
const notificationsRoutes = require('./routes/notifications');
const initRoutes = require('./routes/init');
const analysisDataRoutes = require('./routes/analysis');
const savingsGoalsRoutes = require('./routes/savings-goals');
const userDataRoutes = require('./routes/user-data');

// Importy serwisów
const { shouldAddExpenseToday } = require('./recurring-service');

// --- Konfiguracja Express ---
const app = express();
app.set('trust proxy', 1); // Zaufaj proxy Google Cloud dla poprawnego IP w rate-limit

// Security Headers z Helmet
app.use(helmet({
    contentSecurityPolicy: false, // Dostosuj jeśli CSP jest wymuszone na poziomie CDN
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Bezpieczna konfiguracja CORS
const allowedOrigins = [
    'http://localhost:5000',
    'http://localhost:3000',
    'http://127.0.0.1:5000',
    process.env.ALLOWED_ORIGIN || ''
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        // Zezwalaj na żądania bez origin (np. mobile app, curl, samedomain) lub dopasowane do białej listy
        if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.web.app') || origin.endsWith('.firebaseapp.com')) {
            callback(null, true);
        } else {
            callback(null, true); // Domyślnie zezwalaj, ale nagłówek spersonalizowany
        }
    },
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// --- Konfiguracja Rate Limiterów ---
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minut
    max: 200, // Limit 200 zapytań na 15 min per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Zbyt wiele żądań z tego adresu IP. Spróbuj ponownie za 15 minut.' }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10, // Limit 10 prób rejestracji/logowania na 15 min
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Zbyt wiele prób rejestracji/logowania. Spróbuj ponownie za 15 minut.' }
});

const aiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 godzina
    max: 30, // Limit 30 operacji AI na godzinę
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Przekroczono limit operacji AI (analiza paragonu/głos/szukanie). Spróbuj ponownie za godzinę.' }
});

app.use(globalLimiter);

// Główny router API
const apiRouter = express.Router();

// Aplikowanie ograniczeń prędkości dla wrażliwych ścieżek
app.use('/auth/register', authLimiter);
apiRouter.use('/analyze-receipt', aiLimiter);
apiRouter.use('/transcribe-audio', aiLimiter);
apiRouter.use('/ai/natural-search', aiLimiter);

// Montowanie modułów do apiRouter
apiRouter.use(authRoutes);
apiRouter.use(purchaseRoutes);
apiRouter.use(categoryRoutes);
apiRouter.use(budgetRoutes);
apiRouter.use(statisticsRoutes);
apiRouter.use(aiRoutes);
apiRouter.use(notificationsRoutes);
apiRouter.use(initRoutes);
apiRouter.use(analysisDataRoutes);
apiRouter.use(savingsGoalsRoutes);
apiRouter.use(userDataRoutes);

// Rejestracja routerów w aplikacji
app.use('/auth', authRoutes);
app.use('/api', apiRouter);

// Globalna obsługa błędów
app.use(errorHandler);

// --- Funkcja Cykliczna (CRON) ---

exports.addRecurringExpensesScheduled = onSchedule({
    schedule: '0 3 * * *',
    timeZone: 'Europe/Warsaw'
}, async (event) => {
    console.log('--- START: addRecurringExpensesScheduled (03:00 Warsaw) ---');
    try {
        const today = new Date();
        const snapshot = await recurringExpensesCollection.get();
        
        if (snapshot.empty) {
            console.log('Brak zdefiniowanych wydatków cyklicznych.');
            return null;
        }

        const expensesByUser = {};
        snapshot.forEach(doc => {
            const exp = doc.data();
            if (!expensesByUser[exp.userId]) expensesByUser[exp.userId] = [];
            expensesByUser[exp.userId].push({ id: doc.id, ...exp });
        });

        for (const userId in expensesByUser) {
            const batch = db.batch();
            let anyNew = false;
            
            for (const exp of expensesByUser[userId]) {
                if (shouldAddExpenseToday(exp, today)) {
                    const date = today.toISOString().split('T')[0];
                    const newPurchase = {
                        userId, 
                        shop: "Wydatek cykliczny", 
                        date, 
                        totalAmount: exp.amount, 
                        isRecurring: true, 
                        createdAt: new Date(),
                        items: [{ 
                            name: exp.name, 
                            price: exp.amount, 
                            category: exp.category, 
                            subCategory: exp.subCategory || '', 
                            tags: exp.tags || {} 
                        }]
                    };
                    batch.set(purchasesCollection.doc(), newPurchase);
                    batch.update(recurringExpensesCollection.doc(exp.id), { lastAdded: date });
                    anyNew = true;
                }
            }
            
            if (anyNew) {
                await batch.commit();
                await usersCollection.doc(userId).set({ 
                    availableMonths: FieldValue.arrayUnion(today.toISOString().substring(0, 7)) 
                }, { merge: true });
            }
        }
    } catch (globalErr) {
        console.error('KRYTYCZNY BŁĄD funkcji addRecurringExpensesScheduled:', globalErr);
    }
    return null;
});

exports.api = onRequest({
    secrets: ['GEMINI_API_KEY'],
    invoker: 'public'
}, app);
