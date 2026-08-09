const express = require('express');
const router = express.Router();
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { authMiddleware, asyncHandler } = require('../middleware');

const db = getFirestore();

/**
 * Pomocnicza funkcja do kaskadowego usuwania zapytań z kolekcją
 */
async function deleteQueryBatch(query, resolve) {
    const snapshot = await query.get();
    const batchSize = snapshot.size;
    if (batchSize === 0) {
        resolve();
        return;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
    });

    await batch.commit();

    process.nextTick(() => {
        deleteQueryBatch(query, resolve);
    });
}

async function deleteCollectionByUserId(collectionName, userId) {
    const query = db.collection(collectionName).where('userId', '==', userId).limit(500);
    return new Promise((resolve, reject) => {
        deleteQueryBatch(query, resolve).catch(reject);
    });
}

/**
 * Endpoint RODO Art. 20 - Eksport danych użytkownika
 * GET /api/user/export-data
 */
router.get('/user/export-data', authMiddleware, asyncHandler(async (req, res) => {
    const userId = req.userId;

    const collectionsToExport = [
        'expenses',
        'budgets',
        'specialBudgets',
        'categories',
        'recurringExpenses',
        'notifications',
        'savingsGoals'
    ];

    const exportedData = {
        exportedAt: new Date().toISOString(),
        userId: userId
    };

    // Pobranie danych profilu
    const userDoc = await db.collection('users').doc(userId).get();
    exportedData.profile = userDoc.exists ? userDoc.data() : null;

    // Pobranie danych z poszczególnych kolekcji
    for (const collName of collectionsToExport) {
        const snapshot = await db.collection(collName).where('userId', '==', userId).get();
        exportedData[collName] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=tracker-wydatkow-export-${userId}.json`);
    res.json(exportedData);
}));

/**
 * Endpoint RODO Art. 17 - Kaskadowe usunięcie konta użytkownika i danych
 * DELETE /api/user/delete-account
 */
router.delete('/user/delete-account', authMiddleware, asyncHandler(async (req, res) => {
    const userId = req.userId;

    const collectionsToDelete = [
        'expenses',
        'budgets',
        'specialBudgets',
        'categories',
        'recurringExpenses',
        'notifications',
        'savingsGoals'
    ];

    // 1. Usuwanie dokumentów powiązanych we wszystkich kolekcjach
    for (const collName of collectionsToDelete) {
        await deleteCollectionByUserId(collName, userId);
    }

    // 2. Usuwanie dokumentu profilu użytkownika
    await db.collection('users').doc(userId).delete();

    // 3. Usuwanie konta autoryzacji Firebase Auth
    try {
        await getAuth().deleteUser(userId);
    } catch (authErr) {
        console.warn(`[RODO Delete] Nie udało się usunąć z Firebase Auth (być może już usunięty):`, authErr.message);
    }

    res.json({
        success: true,
        message: 'Konto oraz wszystkie powiązane dane zostały trwale usunięte zgodnie z RODO.'
    });
}));

module.exports = router;
