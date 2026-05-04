const express = require('express');
const router = express.Router();
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { authMiddleware, asyncHandler } = require('../middleware');

const db = getFirestore();
const budgetsCollection = db.collection('budgets');
const specialBudgetsCollection = db.collection('specialBudgets');
const purchasesCollection = db.collection('expenses');

// --- Budżety Miesięczne (stara ścieżka: /api/budgets) ---

router.get('/budgets/:year/:month', authMiddleware, asyncHandler(async (req, res) => {
    const doc = await budgetsCollection.doc(`${req.userId}_${req.params.year}-${req.params.month}`).get();
    res.json(doc.exists ? doc.data() : { budgets: {} });
}));

router.post('/budgets/:year/:month', authMiddleware, asyncHandler(async (req, res) => {
    const { year, month } = req.params;
    const { budgets } = req.body;
    const budgetData = { userId: req.userId, month: `${year}-${month}`, budgets, updatedAt: new Date() };
    await budgetsCollection.doc(`${req.userId}_${year}-${month}`).set(budgetData);
    res.json(budgetData);
}));

// --- Budżety Specjalne (stara ścieżka: /api/special-budgets) ---

router.get('/special-budgets', authMiddleware, asyncHandler(async (req, res) => {
    const snapshot = await specialBudgetsCollection.where('userId', '==', req.userId).get();
    const budgets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Obliczamy wydatki dla każdego budżetu
    const budgetsWithSpent = await Promise.all(budgets.map(async (budget) => {
        const purchaseSnapshot = await purchasesCollection
            .where('userId', '==', req.userId)
            .where('specialBudgetId', '==', budget.id)
            .get();
        
        let spent = 0;
        purchaseSnapshot.forEach(doc => {
            spent += (doc.data().totalAmount || 0);
        });
        
        return { ...budget, spent };
    }));

    budgetsWithSpent.sort((a, b) => b.createdAt.toDate() - a.createdAt.toDate());
    res.json(budgetsWithSpent);
}));

router.post('/special-budgets', authMiddleware, asyncHandler(async (req, res) => {
    const { name, amount } = req.body;
    const newBudget = { userId: req.userId, name, amount: parseFloat(amount), createdAt: new Date() };
    const docRef = await specialBudgetsCollection.add(newBudget);
    res.status(201).json({ id: docRef.id, ...newBudget });
}));

router.put('/special-budgets/:id', authMiddleware, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, amount } = req.body;
    const ref = specialBudgetsCollection.doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().userId !== req.userId) return res.status(403).json({ error: 'Brak uprawnień.' });
    await ref.update({ name, amount: parseFloat(amount), updatedAt: new Date() });
    res.json({ id, name, amount: parseFloat(amount) });
}));

router.delete('/special-budgets/:id', authMiddleware, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const ref = specialBudgetsCollection.doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().userId !== req.userId) return res.status(403).json({ error: 'Brak uprawnień.' });
    
    const snapshot = await purchasesCollection.where('specialBudgetId', '==', id).get();
    if (!snapshot.empty) {
        const batch = db.batch();
        snapshot.docs.forEach(d => batch.update(d.ref, { specialBudgetId: FieldValue.delete() }));
        await batch.commit();
    }
    await ref.delete();
    res.status(204).send();
}));

module.exports = router;
