const { 
    CATEGORY_ICONS, 
    COLOR_PALETTE 
} = require('./config');

/**
 * Funkcja migrująca tagi z poziomu nagłówka zakupu do poszczególnych przedmiotów (KROK 3).
 * Wykonywana tylko dla starych zakupów, które mają tagi w starym miejscu.
 */
async function migrateTagsToItems(userId, purchasesCollection, recurringExpensesCollection, db) {
    console.log(`[Migration] Sprawdzanie i migracja tagów dla: ${userId}`);
    
    // A. Zakupy
    const snapshot = await purchasesCollection.where('userId', '==', userId).get();
    let batch = db.batch();
    let count = 0;

    for (const doc of snapshot.docs) {
        const purchase = doc.data();
        let changed = false;

        // Jeśli zakup ma tagi na górze, a przedmioty ich nie mają - kopiujemy
        if (purchase.tags && Object.keys(purchase.tags).length > 0) {
            const topTags = purchase.tags;
            const newItems = (purchase.items || []).map(item => {
                // Jeśli przedmiot nie ma własnych tagów, dajemy mu te z góry
                if (!item.tags || Object.keys(item.tags).length === 0) {
                    changed = true;
                    return { ...item, tags: { ...topTags } };
                }
                return item;
            });

            if (changed) {
                // Czyścimy tagi z góry i aktualizujemy przedmioty
                batch.update(doc.ref, { 
                    items: newItems,
                    tags: {} // Czyścimy legacy tags
                });
                count++;
            }
        }

        if (count >= 400) {
            await batch.commit();
            batch = db.batch();
            count = 0;
        }
    }
    if (count > 0) await batch.commit();

    // B. Wydatki cykliczne - tutaj zazwyczaj tagi są na górze i to jest OK w definicji, 
    // ale dla spójności można też je trzymać w określony sposób. 
    // Pozostawiamy je bez zmian, bo one generują zakupy już z nową strukturą.
}

/**
 * Główna funkcja migracji dla starych użytkowników (V1 -> V2).
 */
async function runUserMigration(userId, userData, purchasesCollection, recurringExpensesCollection, db) {
    let structuredCategories = userData.structuredCategories || [];
    let customCategories = userData.customCategories || [];
    let availableMonths = userData.availableMonths || [];
    
    // 1. Migracja płaskich kategorii do struktury V2 (dla użytkownika nr 2)
    if (structuredCategories.length === 0 && customCategories.length > 0) {
        console.log(`[Migration] Pierwsza migracja kategorii dla ${userId}`);
        structuredCategories = customCategories.map((cat, index) => ({
            id: `migrated-${Date.now()}-${index}`,
            name: cat,
            parentId: null,
            icon: CATEGORY_ICONS[cat.toLowerCase()] || 'fa-tag',
            color: COLOR_PALETTE[index % COLOR_PALETTE.length]
        }));
    }

    // 2. Synchronizacja kategorii dodanych starym API
    const structuredNames = new Set(structuredCategories.map(c => c.name.toLowerCase()));
    customCategories.forEach((cat, index) => {
        if (cat && !structuredNames.has(cat.toLowerCase())) {
            structuredCategories.push({
                id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                name: cat,
                parentId: null,
                icon: CATEGORY_ICONS[cat.toLowerCase()] || 'fa-tag',
                color: COLOR_PALETTE[(structuredCategories.length + index) % COLOR_PALETTE.length]
            });
        }
    });

    // 3. Naprawa tagów (Legacy -> Items)
    await migrateTagsToItems(userId, purchasesCollection, recurringExpensesCollection, db);

    // 4. Przeliczenie dostępnych miesięcy (jeśli puste)
    const currentMonth = new Date().toISOString().substring(0, 7);
    if (availableMonths.length <= 1) {
        const snapshot = await purchasesCollection.where('userId', '==', userId).get();
        const monthsSet = new Set(availableMonths);
        monthsSet.add(currentMonth);
        snapshot.docs.forEach(doc => {
            const d = doc.data().date;
            if (d && d.length >= 7) monthsSet.add(d.substring(0, 7));
        });
        availableMonths = Array.from(monthsSet).sort().reverse();
    } else if (!availableMonths.includes(currentMonth)) {
        availableMonths.push(currentMonth);
        availableMonths.sort().reverse();
    }

    return {
        updatedData: {
            structuredCategories,
            customCategories: [...new Set(structuredCategories.filter(c => !c.parentId).map(c => c.name))].sort(),
            availableMonths,
            metadataInitialized: true
        }
    };
}

module.exports = {
    runUserMigration
};
