const express = require('express');
const router = express.Router();
const { getFirestore } = require('firebase-admin/firestore');
const { authMiddleware, asyncHandler } = require('../middleware');
const { addPurchase, updatePurchase, deletePurchase } = require('../purchases-service');
const { getUserMetadata } = require('../categories-service');

const db = getFirestore();
const purchasesCollection = db.collection('expenses');
const recurringExpensesCollection = db.collection('recurringExpenses');

// --- Zakupy (stara ścieżka: /api/purchases) ---

router.get('/purchases', authMiddleware, asyncHandler(async (req, res) => {
    const { lastVisible, keyword, category, subCategory, shop, budget, minAmount, maxAmount, startDate, endDate } = req.query;
    const limit = 30;
    const isAnyFilterActive = keyword || category || subCategory || shop || budget || minAmount || maxAmount || startDate || endDate;

    let query = purchasesCollection.where('userId', '==', req.userId);
    if (startDate) query = query.where('date', '>=', startDate);
    if (endDate) query = query.where('date', '<=', endDate);

    if (isAnyFilterActive) {
        const snapshot = await query.orderBy('date', 'desc').get();
        let purchases = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (shop) purchases = purchases.filter(p => p.shop === shop);
        if (budget) {
            if (budget === 'monthly') purchases = purchases.filter(p => !p.specialBudgetId);
            else purchases = purchases.filter(p => p.specialBudgetId === budget);
        }
        if (minAmount) purchases = purchases.filter(p => p.totalAmount >= parseFloat(minAmount));
        if (maxAmount) purchases = purchases.filter(p => p.totalAmount <= parseFloat(maxAmount));
        if (keyword) {
            const lowerKeyword = keyword.toLowerCase();
            purchases = purchases.filter(p => p.items.some(item => item.name.toLowerCase().includes(lowerKeyword)));
        }
        if (category || subCategory) {
            purchases = purchases.filter(p => p.items.some(item => {
                const matchesCategory = !category || item.category === category;
                const matchesSubCategory = !subCategory || (item.subCategory || '') === subCategory;
                return matchesCategory && matchesSubCategory;
            }));
        }
        res.json({ purchases, nextCursor: null });
    } else {
        let paginatedQuery = query.orderBy('date', 'desc').limit(limit);
        if (lastVisible) {
            const lastDocSnapshot = await purchasesCollection.doc(lastVisible).get();
            if (lastDocSnapshot.exists) paginatedQuery = paginatedQuery.startAfter(lastDocSnapshot);
        }
        const snapshot = await paginatedQuery.get();
        const purchases = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const nextCursor = snapshot.docs.length === limit ? snapshot.docs[snapshot.docs.length - 1].id : null;
        res.json({ purchases, nextCursor });
    }
}));

router.post('/purchases', authMiddleware, asyncHandler(async (req, res) => {
    const result = await addPurchase(req.userId, req.body);
    res.status(201).json(result);
}));

router.put('/purchases/:id', authMiddleware, asyncHandler(async (req, res) => {
    const result = await updatePurchase(req.userId, req.params.id, req.body);
    res.json(result);
}));

router.delete('/purchases/:id', authMiddleware, asyncHandler(async (req, res) => {
    await deletePurchase(req.userId, req.params.id);
    res.status(204).send();
}));

// --- Sklepy (stara ścieżka: /api/shops) ---

router.get('/shops', authMiddleware, asyncHandler(async (req, res) => {
    const metadata = await getUserMetadata(req.userId);
    res.json(metadata.shops || []);
}));

// --- Wydatki Cykliczne (stara ścieżka: /api/recurring-expenses) ---

router.get('/recurring-expenses', authMiddleware, asyncHandler(async (req, res) => {
    const snapshot = await recurringExpensesCollection.where('userId', '==', req.userId).get();
    const expenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(expenses);
}));

router.post('/recurring-expenses', authMiddleware, asyncHandler(async (req, res) => {
    const { name, amount, category, subCategory, schedule, tags } = req.body;
    if (!name || !amount || !category || !schedule) {
        return res.status(400).json({ error: 'Pola nazwa, kwota, kategoria i harmonogram są wymagane.' });
    }
    const createdAt = new Date();
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
        schedule,
        createdAt,
        lastAdded
    };
    const docRef = await recurringExpensesCollection.add(newExpense);
    res.status(201).json({ id: docRef.id, ...newExpense });
}));

router.put('/recurring-expenses/:id', authMiddleware, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, amount, category, subCategory, schedule, tags } = req.body;
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
        schedule,
        updatedAt: new Date()
    };
    await expenseRef.update(updatedExpense);
    res.json({ id, ...updatedExpense });
}));

router.delete('/recurring-expenses/:id', authMiddleware, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const expenseRef = recurringExpensesCollection.doc(id);
    const doc = await expenseRef.get();
    if (!doc.exists || doc.data().userId !== req.userId) {
        return res.status(403).json({ error: 'Brak uprawnień lub wydatek nie istnieje.' });
    }
    await expenseRef.delete();
    res.status(204).send();
}));

module.exports = router;
