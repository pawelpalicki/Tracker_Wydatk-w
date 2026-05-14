/**
 * Route: /api/init
 * 
 * Skonsolidowany endpoint startowy — zwraca wszystkie dane potrzebne
 * do załadowania aplikacji w jednym zapytaniu HTTP.
 * 
 * Zastępuje sekwencyjne wywołania:
 *   /api/categories, /api/categories/v2, /api/shops, /api/tags,
 *   /api/special-budgets, /api/recurring-expenses, /api/statistics,
 *   /api/budgets/{y}/{m}, /api/purchases (x2), /api/statistics/comparison,
 *   /api/notifications
 */

const express = require('express');
const router = express.Router();
const { getFirestore } = require('firebase-admin/firestore');
const { authMiddleware, asyncHandler } = require('../middleware');
const { getUserMetadata } = require('../categories-service');

const db = getFirestore();
const purchasesCollection = db.collection('expenses');
const budgetsCollection = db.collection('budgets');
const specialBudgetsCollection = db.collection('specialBudgets');
const recurringExpensesCollection = db.collection('recurringExpenses');
const notificationsCollection = db.collection('notifications');

router.get('/init', authMiddleware, asyncHandler(async (req, res) => {
    const userId = req.userId;
    const now = new Date();
    const currentYear = String(now.getFullYear());
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const currentMonthKey = `${currentYear}-${currentMonth}`;
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const startDate = `${currentYear}-${currentMonth}-01`;
    const endDate = `${currentYear}-${currentMonth}-${String(daysInMonth).padStart(2, '0')}`;

    // --- Faza 1: Równoległe zapytania do Firestore ---
    const [
        metadata,
        budgetDoc,
        currentMonthSnapshot,
        sixMonthSnapshot,
        purchaseListSnapshot,
        specialBudgetsSnapshot,
        recurringSnapshot,
        notificationsSnapshot
    ] = await Promise.all([
        // 1. Metadane użytkownika (kategorie, tagi, sklepy, miesiące) — 1 read
        getUserMetadata(userId),

        // 2. Budżet bieżącego miesiąca — 1 read
        budgetsCollection.doc(`${userId}_${currentMonthKey}`).get(),

        // 3. Zakupy bieżącego miesiąca (do dashboardu) — 1 query
        purchasesCollection
            .where('userId', '==', userId)
            .where('date', '>=', startDate)
            .where('date', '<=', endDate)
            .get(),

        // 4. Zakupy z 6 miesięcy (do porównania) — 1 query
        (() => {
            const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
            const sixStartDate = sixMonthsAgo.toISOString().split('T')[0];
            return purchasesCollection
                .where('userId', '==', userId)
                .where('date', '>=', sixStartDate)
                .where('date', '<=', endDate)
                .get();
        })(),

        // 5. Lista zakupów — pierwsza strona (30 pozycji) — 1 query
        purchasesCollection
            .where('userId', '==', userId)
            .orderBy('date', 'desc')
            .limit(30)
            .get(),

        // 6. Budżety specjalne — 1 query
        specialBudgetsCollection
            .where('userId', '==', userId)
            .get(),

        // 7. Wydatki cykliczne — 1 query
        recurringExpensesCollection
            .where('userId', '==', userId)
            .get(),

        // 8. Powiadomienia — 1 query
        notificationsCollection
            .where('userId', '==', userId)
            .limit(100)
            .get()
    ]);

    // --- Faza 2: Przetwarzanie danych ---

    // Budżet
    const budgets = budgetDoc.exists ? (budgetDoc.data().budgets || {}) : {};

    // Zakupy bieżącego miesiąca
    const currentMonthPurchases = currentMonthSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));

    // Porównanie 6-miesięczne (przetwarzane server-side)
    const today = now.getDate();
    const isMtdMode = true; // Przy starcie zawsze aktualny miesiąc
    const expectedMonths = [];
    for (let i = 5; i >= 0; i--) {
        const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
        expectedMonths.push(m.toISOString().substring(0, 7));
    }

    const sixMonthPurchases = sixMonthSnapshot.docs
        .map(doc => doc.data())
        .filter(p => !p.specialBudgetId);

    const monthlyTotalsMap = sixMonthPurchases.reduce((acc, p) => {
        const month = p.date.substring(0, 7);
        const amount = p.totalAmount || 0;
        if (amount === 0) return acc;
        if (isMtdMode && month === currentMonthKey && new Date(p.date).getDate() > today) return acc;
        acc[month] = (acc[month] || 0) + amount;
        return acc;
    }, {});

    const comparisonData = {
        monthlyTotals: expectedMonths.map(month => ({
            month,
            total: monthlyTotalsMap[month] || 0
        }))
    };

    // Ostatnie 10 transakcji (z listy zakupów)
    const recentTransactions = purchaseListSnapshot.docs
        .slice(0, 10)
        .map(doc => ({ id: doc.id, ...doc.data() }));

    // Lista zakupów — pierwsza strona
    const purchaseListItems = purchaseListSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));
    const purchaseListNextCursor = purchaseListSnapshot.docs.length === 30
        ? purchaseListSnapshot.docs[purchaseListSnapshot.docs.length - 1].id
        : null;

    // Budżety specjalne ze wydanymi kwotami
    const specialBudgets = specialBudgetsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));

    // Oblicz spent dla każdego budżetu specjalnego
    // Optymalizacja: jeśli mamy już 6-miesięczne dane, użyj ich
    // Ale special budgets mogą mieć zakupy sprzed 6 miesięcy, więc musimy query osobno
    const specialBudgetsWithSpent = await Promise.all(specialBudgets.map(async (budget) => {
        const spentSnapshot = await purchasesCollection
            .where('userId', '==', userId)
            .where('specialBudgetId', '==', budget.id)
            .get();
        let spent = 0;
        spentSnapshot.forEach(doc => {
            spent += (doc.data().totalAmount || 0);
        });
        return { ...budget, spent };
    }));

    specialBudgetsWithSpent.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return dateB - dateA;
    });

    // Wydatki cykliczne
    const recurringExpenses = recurringSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));

    // Powiadomienia (ta sama logika co GET /notifications)
    const nowMs = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const notifications = [];
    notificationsSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.isDeleted === true) return;
        if (data.isRead && data.readAt && (nowMs - data.readAt > sevenDays)) return;
        notifications.push({ id: doc.id, ...data });
    });
    notifications.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    // --- Faza 3: Odpowiedź ---
    res.json({
        // Dane core
        categories: metadata.categories || [],
        structuredCategories: metadata.structuredCategories || [],
        shops: metadata.shops || [],
        tagDefinitions: metadata.tagDefinitions || {},
        availableMonths: metadata.availableMonths || [],
        specialBudgets: specialBudgetsWithSpent,
        recurringExpenses,

        // Dashboard
        dashboard: {
            currentMonth: currentMonthKey,
            budgets,
            purchases: currentMonthPurchases,
            comparison: comparisonData,
            recentTransactions
        },

        // Lista zakupów
        purchasesList: {
            purchases: purchaseListItems,
            nextCursor: purchaseListNextCursor
        },

        // Powiadomienia
        notifications: notifications.slice(0, 50)
    });
}));

module.exports = router;
