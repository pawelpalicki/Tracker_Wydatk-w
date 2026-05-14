/**
 * Route: /api/analysis/data
 * 
 * Skonsolidowany endpoint dla widoku Analizy — zwraca wszystkie zakupy
 * z danego zakresu dat + budżety miesięczne w jednym zapytaniu HTTP.
 * 
 * Zastępuje:
 *   - Wielokrotne paginowane GET /api/purchases?startDate=...&endDate=... (pętla while)
 *   - N × GET /api/budgets/{year}/{month} (po jednym na miesiąc)
 * 
 * Redukuje ~11 sekwencyjnych zapytań do 1.
 */

const express = require('express');
const router = express.Router();
const { getFirestore } = require('firebase-admin/firestore');
const { authMiddleware, asyncHandler } = require('../middleware');

const db = getFirestore();
const purchasesCollection = db.collection('expenses');
const budgetsCollection = db.collection('budgets');

router.get('/analysis/data', authMiddleware, asyncHandler(async (req, res) => {
    const userId = req.userId;
    const { startDate, endDate, months } = req.query;

    if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate i endDate są wymagane.' });
    }

    // Parsuj listę miesięcy do pobrania budżetów
    const monthKeys = months ? months.split(',').filter(Boolean) : [];

    // Równoległe zapytania: zakupy + budżety
    const [purchasesSnapshot, ...budgetDocs] = await Promise.all([
        // Wszystkie zakupy w zakresie — BEZ limitu (analiza potrzebuje ALL)
        purchasesCollection
            .where('userId', '==', userId)
            .where('date', '>=', startDate)
            .where('date', '<=', endDate)
            .orderBy('date', 'desc')
            .get(),

        // Budżety dla każdego miesiąca — równolegle
        ...monthKeys.map(monthKey => {
            return budgetsCollection.doc(`${userId}_${monthKey}`).get();
        })
    ]);

    // Zakupy — filtruj specialBudgetId (analiza ich nie używa)
    const purchases = purchasesSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(p => !p.specialBudgetId);

    // Budżety — mapa monthKey -> budgets object
    const budgets = {};
    monthKeys.forEach((monthKey, index) => {
        const doc = budgetDocs[index];
        budgets[monthKey] = doc && doc.exists ? (doc.data().budgets || {}) : {};
    });

    res.json({ purchases, budgets });
}));

module.exports = router;
