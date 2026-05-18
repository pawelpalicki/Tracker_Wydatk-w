const express = require('express');
const router = express.Router();
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { authMiddleware, asyncHandler } = require('../middleware');

const db = getFirestore();
const savingsGoalsCollection = db.collection('savingsGoals');
const budgetsCollection = db.collection('budgets');
const purchasesCollection = db.collection('expenses');

// --- 1. Pobieranie celów oszczędnościowych ---
router.get('/savings-goals', authMiddleware, asyncHandler(async (req, res) => {
    const snapshot = await savingsGoalsCollection.where('userId', '==', req.userId).get();
    const goals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Sortuj: nowo utworzone na początku
    goals.sort((a, b) => {
        const dateA = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt)) : new Date(0);
        const dateB = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt)) : new Date(0);
        return dateB - dateA;
    });
    
    res.json(goals);
}));

// --- 2. Dodawanie nowego celu ---
router.post('/savings-goals', authMiddleware, asyncHandler(async (req, res) => {
    const { name, targetAmount, deadline, icon, color } = req.body;
    
    if (!name || !targetAmount || isNaN(targetAmount) || parseFloat(targetAmount) <= 0) {
        return res.status(400).json({ error: 'Nazwa oraz poprawna kwota docelowa są wymagane.' });
    }

    const newGoal = {
        userId: req.userId,
        name: name.trim(),
        targetAmount: parseFloat(targetAmount),
        currentAmount: 0,
        deadline: deadline || null,
        icon: icon || 'fa-piggy-bank',
        color: color || '#10b981',
        createdAt: new Date()
    };

    const docRef = await savingsGoalsCollection.add(newGoal);
    res.status(201).json({ id: docRef.id, ...newGoal });
}));

// --- 3. Edycja celu ---
router.put('/savings-goals/:id', authMiddleware, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, targetAmount, deadline, icon, color } = req.body;

    if (!name || !targetAmount || isNaN(targetAmount) || parseFloat(targetAmount) <= 0) {
        return res.status(400).json({ error: 'Nazwa oraz poprawna kwota docelowa są wymagane.' });
    }

    const ref = savingsGoalsCollection.doc(id);
    const doc = await ref.get();

    if (!doc.exists || doc.data().userId !== req.userId) {
        return res.status(403).json({ error: 'Brak uprawnień do edycji tego celu.' });
    }

    const updates = {
        name: name.trim(),
        targetAmount: parseFloat(targetAmount),
        deadline: deadline || null,
        icon: icon || doc.data().icon || 'fa-piggy-bank',
        color: color || doc.data().color || '#10b981',
        updatedAt: new Date()
    };

    await ref.update(updates);
    res.json({ id, ...updates });
}));

// --- 4. Usuwanie celu ---
router.delete('/savings-goals/:id', authMiddleware, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const ref = savingsGoalsCollection.doc(id);
    const doc = await ref.get();

    if (!doc.exists || doc.data().userId !== req.userId) {
        return res.status(403).json({ error: 'Brak uprawnień do usunięcia tego celu.' });
    }

    await ref.delete();
    res.status(204).send();
}));

// --- 5. Wpłata środków ---
router.post('/savings-goals/:id/deposit', authMiddleware, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { amount } = req.body;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: 'Podaj poprawną kwotę wpłaty większą od 0.' });
    }

    const ref = savingsGoalsCollection.doc(id);
    const doc = await ref.get();

    if (!doc.exists || doc.data().userId !== req.userId) {
        return res.status(403).json({ error: 'Brak uprawnień.' });
    }

    const currentAmount = parseFloat(doc.data().currentAmount || 0);
    const newAmount = Math.max(0, currentAmount + parsedAmount);

    await ref.update({
        currentAmount: newAmount,
        updatedAt: new Date()
    });

    res.json({ success: true, currentAmount: newAmount });
}));

// --- 6. Wypłata środków ---
router.post('/savings-goals/:id/withdraw', authMiddleware, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { amount } = req.body;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: 'Podaj poprawną kwotę wypłaty większą od 0.' });
    }

    const ref = savingsGoalsCollection.doc(id);
    const doc = await ref.get();

    if (!doc.exists || doc.data().userId !== req.userId) {
        return res.status(403).json({ error: 'Brak uprawnień.' });
    }

    const currentAmount = parseFloat(doc.data().currentAmount || 0);
    if (currentAmount < parsedAmount) {
        return res.status(400).json({ error: `Niewystarczające środki w skarbonce. Zgromadzono tylko: ${currentAmount} zł.` });
    }

    const newAmount = Math.max(0, currentAmount - parsedAmount);

    await ref.update({
        currentAmount: newAmount,
        updatedAt: new Date()
    });

    res.json({ success: true, currentAmount: newAmount });
}));

// --- 7. Kalkulator nadwyżki budżetowej (Surplus) ---
router.get('/savings-goals/surplus', authMiddleware, asyncHandler(async (req, res) => {
    let { month } = req.query;

    // Domyślnie poprzedni miesiąc
    if (!month) {
        const now = new Date();
        const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        month = prevMonthDate.toISOString().substring(0, 7); // Format YYYY-MM
    }

    // 1. Pobierz budżet dla wybranego miesiąca
    const budgetDoc = await budgetsCollection.doc(`${req.userId}_${month}`).get();
    let totalBudget = 0;
    
    if (budgetDoc.exists) {
        const budgets = budgetDoc.data().budgets || {};
        totalBudget = Object.values(budgets).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
    }

    // 2. Pobierz wydatki z wybranego miesiąca (od 1-ego do 31-ego dnia)
    const startDate = `${month}-01`;
    const endDate = `${month}-31`;

    const purchasesSnapshot = await purchasesCollection
        .where('userId', '==', req.userId)
        .where('date', '>=', startDate)
        .where('date', '<=', endDate)
        .get();

    let totalSpent = 0;
    purchasesSnapshot.forEach(doc => {
        const data = doc.data();
        // Pomijamy wydatki z budżetów specjalnych (ponieważ są odrębne od standardowego budżetu)
        if (!data.specialBudgetId) {
            totalSpent += parseFloat(data.totalAmount || 0);
        }
    });

    const surplus = Math.max(0, totalBudget - totalSpent);

    res.json({
        month,
        totalBudget,
        totalSpent,
        surplus
    });
}));

module.exports = router;
