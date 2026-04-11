const { getFirestore } = require('firebase-admin/firestore');
const { 
    DEFAULT_TAG_DEFINITIONS,
    DEFAULT_STRUCTURED_CATEGORIES,
    CATEGORY_ICONS
} = require('./config');
const { 
    normalizeTagDefinitions, 
    normalizeTagValue, 
    namesEqualCI, 
    getDefaultTagValue 
} = require('./utils');
const { runUserMigration } = require('./migration');

const db = getFirestore();
const usersCollection = db.collection('users');
const purchasesCollection = db.collection('expenses');
const recurringExpensesCollection = db.collection('recurringExpenses');

/**
 * Inicjalizuje kategorie dla zupełnie nowego użytkownika (V2)
 */
async function initializeNewUser(userId) {
    console.log(`[Init] Inicjalizacja nowego użytkownika: ${userId}`);
    const structuredCategories = [];
    
    DEFAULT_STRUCTURED_CATEGORIES.forEach((main) => {
        const mainId = main.id;
        structuredCategories.push({
            id: mainId,
            name: main.name,
            parentId: null,
            icon: main.icon,
            color: main.color
        });
        main.children.forEach((child, cIdx) => {
            structuredCategories.push({
                id: `${mainId}_${cIdx + 1}`,
                name: child,
                parentId: mainId,
                icon: CATEGORY_ICONS[child.toLowerCase()] || 'fa-tag',
                color: main.color
            });
        });
    });

    const initialData = {
        structuredCategories,
        customCategories: [...new Set(structuredCategories.filter(c => !c.parentId).map(c => c.name))].sort(),
        tagDefinitions: normalizeTagDefinitions({}, DEFAULT_TAG_DEFINITIONS),
        availableMonths: [new Date().toISOString().substring(0, 7)],
        metadataInitialized: true,
        schemaVersion: 2 // Nowy użytkownik od razu ma najnowszą wersję
    };

    await usersCollection.doc(userId).set(initialData, { merge: true });
    return initialData;
}

/**
 * Pobiera metadane użytkownika (kategorie, tagi, sklepy, miesiące).
 */
async function getUserMetadata(userId) {
    const userRef = usersCollection.doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
        return await initializeNewUser(userId);
    }

    const userData = userDoc.data();

    // Jeśli użytkownik nie ma kategorii ani wersji schematu - traktuj go jako nowego
    if (!userData.schemaVersion && (!userData.customCategories || userData.customCategories.length === 0)) {
        return await initializeNewUser(userId);
    }

    // Jeśli użytkownik ma stary schemat - uruchom migrację
    let currentData = userData;
    if (!userData.schemaVersion || userData.schemaVersion < 2) {
        console.log(`[Migration] Uruchamiam migrację dla użytkownika: ${userId}`);
        const migrationResult = await runUserMigration(userId, userData, purchasesCollection, recurringExpensesCollection, db);
        
        const updateData = {
            ...migrationResult.updatedData,
            schemaVersion: 2 // Oznaczamy jako zmigrowany
        };
        await userRef.set(updateData, { merge: true });
        currentData = { ...userData, ...updateData };
    }

    return {
        categories: currentData.customCategories || [],
        structuredCategories: currentData.structuredCategories || [],
        tagDefinitions: normalizeTagDefinitions(currentData.tagDefinitions, DEFAULT_TAG_DEFINITIONS),
        shops: currentData.shops || [],
        availableMonths: currentData.availableMonths || []
    };
}

/**
 * Pobiera kategorie użytkownika w różnych formatach
 */
async function getUserCategories(userId) {
    const metadata = await getUserMetadata(userId);
    return {
        flat: metadata.categories,
        structured: metadata.structuredCategories,
        tags: metadata.tagDefinitions
    };
}

/**
 * Znajduje kategoryzację zapasową (fallback)
 */
function resolveOrphanFallback(structuredCategories = [], deletingParentId = null) {
    const remaining = (structuredCategories || []).filter(c => c.id !== deletingParentId && c.parentId !== deletingParentId);
    const parentInne = remaining.find(c => !c.parentId && namesEqualCI(c.name, 'inne'));
    if (!parentInne) {
        return { category: 'inne', subCategory: '' };
    }
    const subPozostale = remaining.find(c => c.parentId === parentInne.id && namesEqualCI(c.name, 'pozostałe'));
    return {
        category: parentInne.name || 'inne',
        subCategory: subPozostale ? (subPozostale.name || '') : ''
    };
}

/**
 * Masowa aktualizacja kategorii w zakupach
 */
async function bulkUpdatePurchasesCategory(userId, oldName, newName, options = {}) {
    const { parentId = null, isDelete = false, fallback = null } = options;
    const fallbackCategory = fallback?.category || 'inne';
    const fallbackSubCategory = fallback?.subCategory || '';

    try {
        const snapshot = await purchasesCollection.where('userId', '==', userId).get();
        if (snapshot.empty) return;

        let parentName = null;
        if (parentId !== null) {
            const userDoc = await usersCollection.doc(userId).get();
            const userData = userDoc.data() || {};
            const parentCat = (userData.structuredCategories || []).find(c => c.id === parentId);
            parentName = parentCat ? parentCat.name : null;
        }

        let batch = db.batch();
        let count = 0;

        for (const doc of snapshot.docs) {
            const purchase = doc.data();
            let changed = false;
            const update = {};

            // 1. Kategoria główna
            if (parentId === null) {
                if (namesEqualCI(purchase.category, oldName)) {
                    update.category = isDelete ? fallbackCategory : newName;
                    changed = true;
                }
                if (Array.isArray(purchase.items)) {
                    const newItems = purchase.items.map(item => {
                        if (namesEqualCI(item.category, oldName)) {
                            changed = true;
                            return {
                                ...item,
                                category: isDelete ? fallbackCategory : newName,
                                subCategory: isDelete ? fallbackSubCategory : (item.subCategory || '')
                            };
                        }
                        return item;
                    });
                    if (changed) update.items = newItems;
                }
            }
            // 2. Podkategoria
            else {
                if (Array.isArray(purchase.items)) {
                    const newItems = purchase.items.map(item => {
                        if (namesEqualCI(item.subCategory, oldName) && namesEqualCI(item.category, parentName)) {
                            changed = true;
                            return { ...item, subCategory: isDelete ? '' : newName };
                        }
                        return item;
                    });
                    if (changed) update.items = newItems;
                }
            }

            if (changed) {
                batch.update(doc.ref, update);
                count++;
                if (count >= 400) {
                    await batch.commit();
                    batch = db.batch();
                    count = 0;
                }
            }
        }
        if (count > 0) await batch.commit();
    } catch (err) {
        console.error(`[BulkUpdate] Błąd dla ${userId}:`, err);
    }
}

/**
 * Aktualizacja tagu w danych użytkownika (zakupy i wydatki cykliczne)
 */
async function updateTagInUserData(userId, group, oldValue, newValue, isDelete, fallbackValue) {
    const normalizedOld = normalizeTagValue(oldValue);
    const normalizedNew = normalizeTagValue(newValue);
    const normalizedFallback = normalizeTagValue(fallbackValue);
    const replacement = isDelete ? normalizedFallback : normalizedNew;
    if (!normalizedOld || !replacement) return;

    const purchasesSnapshot = await purchasesCollection.where('userId', '==', userId).get();
    let batch = db.batch();
    let count = 0;
    for (const doc of purchasesSnapshot.docs) {
        const purchase = doc.data();
        let changed = false;
        const updateData = {};

        if (purchase.tags && normalizeTagValue(purchase.tags[group]) === normalizedOld) {
            updateData.tags = { ...purchase.tags, [group]: replacement };
            changed = true;
        }

        if (Array.isArray(purchase.items)) {
            const newItems = purchase.items.map(item => {
                const current = normalizeTagValue(item.tags && item.tags[group]);
                if (current === normalizedOld) {
                    changed = true;
                    return {
                        ...item,
                        tags: {
                            ...(item.tags || {}),
                            [group]: replacement
                        }
                    };
                }
                return item;
            });
            if (changed) updateData.items = newItems;
        }

        if (changed) {
            batch.update(doc.ref, updateData);
            count++;
            if (count >= 400) {
                await batch.commit();
                batch = db.batch();
                count = 0;
            }
        }
    }
    if (count > 0) await batch.commit();

    const recurringSnapshot = await recurringExpensesCollection.where('userId', '==', userId).get();
    batch = db.batch();
    count = 0;
    for (const doc of recurringSnapshot.docs) {
        const expense = doc.data();
        const current = normalizeTagValue(expense.tags && expense.tags[group]);
        if (current === normalizedOld) {
            batch.update(doc.ref, {
                tags: {
                    ...(expense.tags || {}),
                    [group]: replacement
                }
            });
            count++;
            if (count >= 400) {
                await batch.commit();
                batch = db.batch();
                count = 0;
            }
        }
    }
    if (count > 0) await batch.commit();
}

/**
 * Usuwanie całej grupy tagów z danych użytkownika
 */
async function deleteTagGroupFromUserData(userId, group) {
    console.log(`[Cleanup] Usuwanie grupy tagów '${group}' dla użytkownika ${userId}`);

    // A. Czyszczenie zakupów
    const purchasesSnapshot = await purchasesCollection.where('userId', '==', userId).get();
    let batch = db.batch();
    let count = 0;
    for (const doc of purchasesSnapshot.docs) {
        const purchase = doc.data();
        let changed = false;
        const updateData = {};

        if (purchase.tags && purchase.tags[group] !== undefined) {
            const newTags = { ...purchase.tags };
            delete newTags[group];
            updateData.tags = newTags;
            changed = true;
        }

        if (Array.isArray(purchase.items)) {
            const newItems = purchase.items.map(item => {
                if (item.tags && item.tags[group] !== undefined) {
                    changed = true;
                    const itags = { ...item.tags };
                    delete itags[group];
                    return { ...item, tags: itags };
                }
                return item;
            });
            if (changed) updateData.items = newItems;
        }

        if (changed) {
            batch.update(doc.ref, updateData);
            count++;
            if (count >= 400) {
                await batch.commit();
                batch = db.batch();
                count = 0;
            }
        }
    }
    if (count > 0) await batch.commit();

    // B. Czyszczenie wydatków cyklicznych
    const recurringSnapshot = await recurringExpensesCollection.where('userId', '==', userId).get();
    batch = db.batch();
    count = 0;
    for (const doc of recurringSnapshot.docs) {
        const expense = doc.data();
        if (expense.tags && expense.tags[group] !== undefined) {
            const newTags = { ...expense.tags };
            delete newTags[group];
            batch.update(doc.ref, { tags: newTags });
            count++;
            if (count >= 400) {
                await batch.commit();
                batch = db.batch();
                count = 0;
            }
        }
    }
    if (count > 0) await batch.commit();
    console.log(`[Cleanup] Zakończono usuwanie grupy '${group}'.`);
}

module.exports = {
    getUserMetadata,
    getUserCategories,
    resolveOrphanFallback,
    bulkUpdatePurchasesCategory,
    updateTagInUserData,
    deleteTagGroupFromUserData
};
