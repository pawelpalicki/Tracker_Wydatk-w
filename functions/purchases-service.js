const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const db = getFirestore();
const purchasesCollection = db.collection('expenses');
const usersCollection = db.collection('users');

/**
 * Dodaje nowy zakup i aktualizuje metadane użytkownika
 */
async function addPurchase(userId, purchaseData) {
    const { shop, date, items, specialBudgetId } = purchaseData;
    
    if (!shop || !date || !items || !Array.isArray(items) || items.length === 0) {
        throw new Error('Nieprawidłowe dane zakupu.');
    }

    const totalAmount = items.reduce((sum, item) => sum + (item.price || 0), 0);
    const newPurchase = {
        userId,
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

    // Aktualizacja metadanych użytkownika (sklepy, miesiące, kategorie)
    const updateData = {
        shops: FieldValue.arrayUnion(shop),
        availableMonths: FieldValue.arrayUnion(date.substring(0, 7)),
        customCategories: FieldValue.arrayUnion(...items.map(item => item.category).filter(Boolean))
    };
    await usersCollection.doc(userId).set(updateData, { merge: true });

    return { id: docRef.id, ...newPurchase };
}

/**
 * Aktualizuje istniejący zakup
 */
async function updatePurchase(userId, purchaseId, updateData) {
    const { shop, date, items, specialBudgetId } = updateData;
    const purchaseRef = purchasesCollection.doc(purchaseId);
    const doc = await purchaseRef.get();

    if (!doc.exists || doc.data().userId !== userId) {
        const error = new Error('Brak uprawnień lub zakup nie istnieje.');
        error.statusCode = 403;
        throw error;
    }

    const totalAmount = items.reduce((sum, item) => sum + (item.price || 0), 0);
    const updatedFields = {
        shop,
        date,
        items,
        totalAmount,
        updatedAt: new Date()
    };

    if (specialBudgetId) {
        updatedFields.specialBudgetId = specialBudgetId;
    } else {
        updatedFields.specialBudgetId = FieldValue.delete();
    }

    await purchaseRef.update(updatedFields);

    // Aktualizacja metadanych
    await usersCollection.doc(userId).set({
        shops: FieldValue.arrayUnion(shop),
        availableMonths: FieldValue.arrayUnion(date.substring(0, 7)),
        customCategories: FieldValue.arrayUnion(...items.map(item => item.category).filter(Boolean))
    }, { merge: true });

    return { id: purchaseId, ...updatedFields, userId, createdAt: doc.data().createdAt };
}

/**
 * Usuwa zakup
 */
async function deletePurchase(userId, purchaseId) {
    const purchaseRef = purchasesCollection.doc(purchaseId);
    const doc = await purchaseRef.get();

    if (!doc.exists || doc.data().userId !== userId) {
        const error = new Error('Brak uprawnień lub zakup nie istnieje.');
        error.statusCode = 403;
        throw error;
    }

    await purchaseRef.delete();
    return true;
}

module.exports = {
    addPurchase,
    updatePurchase,
    deletePurchase
};
