const functions = require("firebase-functions");
const express = require('express');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { onSchedule } = require("firebase-functions/v2/scheduler");
const cors = require('cors');

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

// Importy serwisów
const { shouldAddExpenseToday } = require('./recurring-service');

// --- Konfiguracja Express ---
const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '10mb' }));

// Główny router API
const apiRouter = express.Router();

// Montowanie modułów do apiRouter
apiRouter.use(authRoutes);
apiRouter.use(purchaseRoutes);
apiRouter.use(categoryRoutes);
apiRouter.use(budgetRoutes);
apiRouter.use(statisticsRoutes);
apiRouter.use(aiRoutes);
apiRouter.use(notificationsRoutes);

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

exports.api = functions.https.onRequest({
    secrets: ['GEMINI_API_KEY']
}, app);
