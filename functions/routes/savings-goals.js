const express = require('express');
const router = express.Router();
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { authMiddleware, asyncHandler } = require('../middleware');

const db = getFirestore();
const savingsGoalsCollection = db.collection('savingsGoals');
const budgetsCollection = db.collection('budgets');
const purchasesCollection = db.collection('expenses');
const settledMonthsCollection = db.collection('settledMonths');

// --- 1. Pobieranie celów oszczędnościowych (Zoptymalizowane: bez historii transakcji) ---
router.get('/savings-goals', authMiddleware, asyncHandler(async (req, res) => {
    const snapshot = await savingsGoalsCollection
        .where('userId', '==', req.userId)
        .select('userId', 'name', 'targetAmount', 'currentAmount', 'deadline', 'icon', 'color', 'createdAt', 'updatedAt')
        .get();
    const goals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Sortuj: nowo utworzone na początku
    goals.sort((a, b) => {
        const dateA = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt)) : new Date(0);
        const dateB = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt)) : new Date(0);
        return dateB - dateA;
    });
    
    res.json(goals);
}));

// --- 1b. Pobieranie historii transakcji celu (Lazy-loading dla wydajności sieciowej) ---
router.get('/savings-goals/:id/history', authMiddleware, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const ref = savingsGoalsCollection.doc(id);
    const doc = await ref.get();

    if (!doc.exists) {
        return res.status(404).json({ error: 'Cel oszczędnościowy nie istnieje.' });
    }
    if (doc.data().userId !== req.userId) {
        return res.status(403).json({ error: 'Brak uprawnień.' });
    }

    res.json(doc.data().history || []);
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
        history: [],
        createdAt: new Date()
    };

    const docRef = await savingsGoalsCollection.add(newGoal);
    res.status(201).json({ id: docRef.id, ...newGoal });
}));

// --- 3. Edycja celu (Zoptymalizowane: bez nadpisywania historii) ---
router.put('/savings-goals/:id', authMiddleware, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, targetAmount, deadline, icon, color } = req.body;

    if (!name || !targetAmount || isNaN(targetAmount) || parseFloat(targetAmount) <= 0) {
        return res.status(400).json({ error: 'Nazwa oraz poprawna kwota docelowa są wymagane.' });
    }

    const ref = savingsGoalsCollection.doc(id);
    const doc = await ref.get();

    if (!doc.exists) {
        return res.status(404).json({ error: 'Cel oszczędnościowy nie istnieje.' });
    }
    if (doc.data().userId !== req.userId) {
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

    if (!doc.exists) {
        return res.status(404).json({ error: 'Cel oszczędnościowy nie istnieje.' });
    }
    if (doc.data().userId !== req.userId) {
        return res.status(403).json({ error: 'Brak uprawnień do usunięcia tego celu.' });
    }

    await ref.delete();
    res.status(204).send();
}));

// --- 5. Wpłata środków (Zoptymalizowane: Bezpieczna Transakcja Firestore przed Race Conditions) ---
router.post('/savings-goals/:id/deposit', authMiddleware, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { amount, note } = req.body;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: 'Podaj poprawną kwotę wpłaty większą od 0.' });
    }

    const ref = savingsGoalsCollection.doc(id);
    const now = new Date();

    try {
        const result = await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(ref);
            if (!doc.exists) {
                throw new Error('GoalNotFound');
            }
            if (doc.data().userId !== req.userId) {
                throw new Error('Unauthorized');
            }

            const currentAmount = parseFloat(doc.data().currentAmount || 0);
            const newAmount = parseFloat((currentAmount + parsedAmount).toFixed(2));

            transaction.update(ref, {
                currentAmount: newAmount,
                updatedAt: now,
                history: FieldValue.arrayUnion({
                    type: 'deposit',
                    amount: parsedAmount,
                    date: now,
                    note: note || 'Wpłata własna'
                })
            });

            return { currentAmount: newAmount };
        });

        res.json({ success: true, currentAmount: result.currentAmount });
    } catch (err) {
        if (err.message === 'GoalNotFound') {
            return res.status(404).json({ error: 'Cel oszczędnościowy nie istnieje.' });
        }
        if (err.message === 'Unauthorized') {
            return res.status(403).json({ error: 'Brak uprawnień.' });
        }
        throw err;
    }
}));

// --- 6. Wypłata środków (Zoptymalizowane: Bezpieczna Transakcja Firestore przed Race Conditions) ---
router.post('/savings-goals/:id/withdraw', authMiddleware, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { amount, note } = req.body;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: 'Podaj poprawną kwotę wypłaty większą od 0.' });
    }

    const ref = savingsGoalsCollection.doc(id);
    const now = new Date();

    try {
        const result = await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(ref);
            if (!doc.exists) {
                throw new Error('GoalNotFound');
            }
            if (doc.data().userId !== req.userId) {
                throw new Error('Unauthorized');
            }

            const currentAmount = parseFloat(doc.data().currentAmount || 0);
            if (currentAmount < parsedAmount) {
                throw new Error('InsufficientFunds');
            }

            const newAmount = parseFloat(Math.max(0, currentAmount - parsedAmount).toFixed(2));

            transaction.update(ref, {
                currentAmount: newAmount,
                updatedAt: now,
                history: FieldValue.arrayUnion({
                    type: 'withdraw',
                    amount: parsedAmount,
                    date: now,
                    note: note || 'Wypłata własna'
                })
            });

            return { currentAmount: newAmount };
        });

        res.json({ success: true, currentAmount: result.currentAmount });
    } catch (err) {
        if (err.message === 'GoalNotFound') {
            return res.status(404).json({ error: 'Cel oszczędnościowy nie istnieje.' });
        }
        if (err.message === 'Unauthorized') {
            return res.status(403).json({ error: 'Brak uprawnień.' });
        }
        if (err.message === 'InsufficientFunds') {
            return res.status(400).json({ error: 'Niewystarczające środki w skarbonce.' });
        }
        throw err;
    }
}));

// --- 7. Zoptymalizowany Kalkulator Nadwyżek Zbiorczych (surplus-batch) ---
// Pobiera analizę dla 12 zamkniętych miesięcy w 1 zapytaniu HTTP i zminimalizowanych odczytach Firestore!
router.get('/savings-goals/surplus-batch', authMiddleware, asyncHandler(async (req, res) => {
    // Wyznacz 12 poprzednich zamkniętych miesięcy
    const months = [];
    const now = new Date();
    for (let i = 1; i <= 12; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        months.push(`${yyyy}-${mm}`);
    }

    const sortedMonths = [...months].sort();
    const oldestMonth = sortedMonths[0];
    const newestMonth = sortedMonths[sortedMonths.length - 1];

    const startDate = `${oldestMonth}-01`;
    const endDate = `${newestMonth}-31`;

    const budgetDocRefs = months.map(m => budgetsCollection.doc(`${req.userId}_${m}`));

    // Pobierz wszystkie budżety i wydatki w sposób zoptymalizowany (równolegle, db.getAll + 1 query)
    const [budgetSnapshots, purchasesSnapshot] = await Promise.all([
        db.getAll(...budgetDocRefs),
        purchasesCollection
            .where('userId', '==', req.userId)
            .where('date', '>=', startDate)
            .where('date', '<=', endDate)
            .get()
    ]);

    // Mapujemy budżety
    const budgetsMap = {};
    budgetSnapshots.forEach((doc, index) => {
        const month = months[index];
        let totalBudget = 0;
        if (doc.exists) {
            const budgets = doc.data().budgets || {};
            totalBudget = Object.values(budgets).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
        }
        budgetsMap[month] = totalBudget;
    });

    // Mapujemy wydatki w pamięci serwera
    const spentMap = {};
    purchasesSnapshot.forEach(doc => {
        const data = doc.data();
        if (!data.specialBudgetId && data.date) {
            const month = data.date.substring(0, 7);
            if (months.includes(month)) {
                spentMap[month] = (spentMap[month] || 0) + parseFloat(data.totalAmount || 0);
            }
        }
    });

    // Obliczamy nadwyżki / deficyty
    const results = months.map(month => {
        const totalBudget = budgetsMap[month] || 0;
        const totalSpent = spentMap[month] || 0;
        const difference = totalBudget - totalSpent;
        const surplus = difference > 0 ? parseFloat(difference.toFixed(2)) : 0;
        const deficit = difference < 0 ? parseFloat(Math.abs(difference).toFixed(2)) : 0;

        return {
            month,
            totalBudget,
            totalSpent,
            surplus,
            deficit
        };
    });

    res.json(results);
}));

// --- Stary Kalkulator Nadwyżki budżetowej (Zachowany dla kompatybilności wstecznej) ---
router.get('/savings-goals/surplus', authMiddleware, asyncHandler(async (req, res) => {
    let { month } = req.query;

    if (!month) {
        const now = new Date();
        const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        month = prevMonthDate.toISOString().substring(0, 7);
    }

    const budgetDoc = await budgetsCollection.doc(`${req.userId}_${month}`).get();
    let totalBudget = 0;
    
    if (budgetDoc.exists) {
        const budgets = budgetDoc.data().budgets || {};
        totalBudget = Object.values(budgets).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
    }

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
        if (!data.specialBudgetId) {
            totalSpent += parseFloat(data.totalAmount || 0);
        }
    });

    const difference = totalBudget - totalSpent;
    const surplus = difference > 0 ? parseFloat(difference.toFixed(2)) : 0;
    const deficit = difference < 0 ? parseFloat(Math.abs(difference).toFixed(2)) : 0;

    res.json({
        month,
        totalBudget,
        totalSpent,
        surplus,
        deficit
    });
}));

// --- 8. Rozliczone miesiące (settledMonths) ---
router.get('/savings-goals/settled', authMiddleware, asyncHandler(async (req, res) => {
    const snapshot = await settledMonthsCollection.where('userId', '==', req.userId).get();
    const settled = snapshot.docs.map(doc => doc.data());
    res.json(settled);
}));

router.post('/savings-goals/settled', authMiddleware, asyncHandler(async (req, res) => {
    const { month, type } = req.body;
    if (!month || !type) {
        return res.status(400).json({ error: 'Miesiąc i typ są wymagane.' });
    }
    const docId = `${req.userId}_${month}`;
    await settledMonthsCollection.doc(docId).set({
        userId: req.userId,
        month,
        type,
        settledAt: new Date()
    });
    res.json({ success: true });
}));

// --- 9. Bezpośredni przelew między celami (Zoptymalizowane: Pełna Transakcja ACID) ---
router.post('/savings-goals/transfer', authMiddleware, asyncHandler(async (req, res) => {
    const { sourceGoalId, targetGoalId, amount } = req.body;
    const parsedAmount = parseFloat(amount);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: 'Podaj poprawną kwotę przelewu.' });
    }
    if (!sourceGoalId || !targetGoalId || sourceGoalId === targetGoalId) {
        return res.status(400).json({ error: 'Nieprawidłowe cele przelewu.' });
    }

    const sourceRef = savingsGoalsCollection.doc(sourceGoalId);
    const targetRef = savingsGoalsCollection.doc(targetGoalId);
    const now = new Date();

    try {
        const result = await db.runTransaction(async (transaction) => {
            const sourceDoc = await transaction.get(sourceRef);
            const targetDoc = await transaction.get(targetRef);

            if (!sourceDoc.exists || !targetDoc.exists) {
                throw new Error('GoalNotFound');
            }
            if (sourceDoc.data().userId !== req.userId || targetDoc.data().userId !== req.userId) {
                throw new Error('Unauthorized');
            }

            const sourceAmount = parseFloat(sourceDoc.data().currentAmount || 0);
            if (sourceAmount < parsedAmount) {
                throw new Error('InsufficientFunds');
            }

            const sourceNewAmount = parseFloat(Math.max(0, sourceAmount - parsedAmount).toFixed(2));
            const targetAmountVal = parseFloat(targetDoc.data().currentAmount || 0);
            const targetNewAmount = parseFloat((targetAmountVal + parsedAmount).toFixed(2));

            // 1. Zdejmij ze źródła
            transaction.update(sourceRef, {
                currentAmount: sourceNewAmount,
                updatedAt: now,
                history: FieldValue.arrayUnion({
                    type: 'transfer_out',
                    amount: parsedAmount,
                    date: now,
                    note: `Przelew do: ${targetDoc.data().name}`
                })
            });

            // 2. Dodaj do celu docelowego
            transaction.update(targetRef, {
                currentAmount: targetNewAmount,
                updatedAt: now,
                history: FieldValue.arrayUnion({
                    type: 'transfer_in',
                    amount: parsedAmount,
                    date: now,
                    note: `Przelew z: ${sourceDoc.data().name}`
                })
            });

            return { sourceAmount: sourceNewAmount, targetAmount: targetNewAmount };
        });

        res.json({ success: true, sourceAmount: result.sourceAmount, targetAmount: result.targetAmount });
    } catch (err) {
        if (err.message === 'GoalNotFound') {
            return res.status(404).json({ error: 'Jeden z celów oszczędnościowych nie istnieje.' });
        }
        if (err.message === 'Unauthorized') {
            return res.status(403).json({ error: 'Brak uprawnień do jednego z celów.' });
        }
        if (err.message === 'InsufficientFunds') {
            return res.status(400).json({ error: 'Niewystarczające środki w celu źródłowym.' });
        }
        throw err;
    }
}));

module.exports = router;
