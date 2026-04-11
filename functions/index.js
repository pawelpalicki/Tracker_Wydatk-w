const functions = require("firebase-functions");
const express = require('express');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { onSchedule } = require("firebase-functions/v2/scheduler");
const cors = require('cors');

// Inicjalizacja Firebase
if (getApps().length === 0) {
    initializeApp();
}

const db = getFirestore();
const usersCollection = db.collection('users');
const purchasesCollection = db.collection('expenses');
const recurringExpensesCollection = db.collection('recurringExpenses');
const notificationsCollection = db.collection('notifications');
const budgetsCollection = db.collection('budgets');
const specialBudgetsCollection = db.collection('specialBudgets');

// Importy modułów
const { authMiddleware } = require('./middleware');
const { 
    getUserMetadata, 
    getUserCategories, 
    resolveOrphanFallback, 
    bulkUpdatePurchasesCategory, 
    updateTagInUserData, 
    deleteTagGroupFromUserData 
} = require('./categories-service');
const { 
    normalizeTagValue, 
    isValidGroupName, 
    normalizeTagDefinitions, 
    getDefaultTagValue, 
    validateDate,
    namesEqualCI,
    renameNameCI,
    removeNameCI,
    mergeUniqueNamesCI,
    convertCurrencyToPLN
} = require('./utils');
const { extractAndCategorizePurchase, generateInsights } = require('./ai-service');
const { shouldAddExpenseToday } = require('./recurring-service');

// --- Konfiguracja Express ---
const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '10mb' }));

// --- API Uwierzytelniania ---

app.post('/auth/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email i hasło są wymagane.' });
        }
        const userRecord = await getAuth().createUser({ email, password });
        await usersCollection.doc(userRecord.uid).set({
            email: userRecord.email,
            uid: userRecord.uid,
            createdAt: new Date()
        });
        res.status(201).json({ success: true, userId: userRecord.uid });
    } catch (error) {
        console.error("Błąd podczas rejestracji:", error);
        if (error.code === 'auth/email-already-exists') {
            return res.status(400).json({ success: false, error: 'Użytkownik o tym emailu już istnieje.' });
        }
        res.status(500).json({ success: false, error: 'Błąd serwera podczas rejestracji.' });
    }
});

app.get('/api/user/me', authMiddleware, async (req, res) => {
    try {
        const userDoc = await usersCollection.doc(req.userId).get();
        if (!userDoc.exists) return res.status(404).json({ error: 'Nie znaleziono użytkownika' });
        res.json({ success: true, user: userDoc.data() });
    } catch (error) {
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

// --- API Wydatków Cyklicznych ---

app.get('/api/recurring-expenses', authMiddleware, async (req, res) => {
    try {
        const snapshot = await recurringExpensesCollection.where('userId', '==', req.userId).get();
        const expenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(expenses);
    } catch (error) {
        console.error("Błąd pobierania wydatków cyklicznych:", error);
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

app.post('/api/recurring-expenses', authMiddleware, async (req, res) => {
    try {
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
    } catch (error) {
        console.error("Błąd dodawania wydatku cyklicznego:", error);
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

app.put('/api/recurring-expenses/:id', authMiddleware, async (req, res) => {
    try {
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
    } catch (error) {
        console.error("Błąd aktualizacji wydatku cyklicznego:", error);
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

app.delete('/api/recurring-expenses/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const expenseRef = recurringExpensesCollection.doc(id);
        const doc = await expenseRef.get();
        if (!doc.exists || doc.data().userId !== req.userId) {
            return res.status(403).json({ error: 'Brak uprawnień lub wydatek nie istnieje.' });
        }
        await expenseRef.delete();
        res.status(204).send();
    } catch (error) {
        console.error("Błąd usuwania wydatku cyklicznego:", error);
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

// --- API Zakupów ---

app.get('/api/purchases', authMiddleware, async (req, res) => {
    try {
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
    } catch (error) {
        console.error("Błąd pobierania zakupów:", error);
        res.status(500).json({ error: 'Błąd serwera podczas pobierania zakupów' });
    }
});

app.get('/api/shops', authMiddleware, async (req, res) => {
    try {
        const metadata = await getUserMetadata(req.userId);
        res.json(metadata.shops || []);
    } catch (error) {
        console.error("Błąd pobierania sklepów:", error);
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

app.post('/api/purchases', authMiddleware, async (req, res) => {
    try {
        const { shop, date, items, specialBudgetId } = req.body;
        if (!shop || !date || !items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Nieprawidłowe dane zakupu.' });
        }
        const totalAmount = items.reduce((sum, item) => sum + (item.price || 0), 0);
        const newPurchase = { userId: req.userId, shop, date, items, totalAmount, createdAt: new Date() };
        if (specialBudgetId) newPurchase.specialBudgetId = specialBudgetId;
        const docRef = await purchasesCollection.add(newPurchase);

        const updateData = {
            shops: FieldValue.arrayUnion(shop),
            availableMonths: FieldValue.arrayUnion(date.substring(0, 7)),
            customCategories: FieldValue.arrayUnion(...items.map(item => item.category).filter(Boolean))
        };
        await usersCollection.doc(req.userId).set(updateData, { merge: true });
        res.status(201).json({ id: docRef.id, ...newPurchase });
    } catch (error) {
        console.error("Błąd dodawania zakupu:", error);
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

app.put('/api/purchases/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { shop, date, items, specialBudgetId } = req.body;
        const purchaseRef = purchasesCollection.doc(id);
        const doc = await purchaseRef.get();
        if (!doc.exists || doc.data().userId !== req.userId) {
            return res.status(403).json({ error: 'Brak uprawnień lub zakup nie istnieje.' });
        }
        const totalAmount = items.reduce((sum, item) => sum + (item.price || 0), 0);
        const updateData = { shop, date, items, totalAmount, updatedAt: new Date() };
        if (specialBudgetId) updateData.specialBudgetId = specialBudgetId;
        else updateData.specialBudgetId = FieldValue.delete();

        await purchaseRef.update(updateData);
        await usersCollection.doc(req.userId).set({
            shops: FieldValue.arrayUnion(shop),
            availableMonths: FieldValue.arrayUnion(date.substring(0, 7)),
            customCategories: FieldValue.arrayUnion(...items.map(item => item.category).filter(Boolean))
        }, { merge: true });

        res.json({ id, ...updateData, userId: req.userId, createdAt: doc.data().createdAt.toDate().toISOString() });
    } catch (error) {
        console.error("Błąd aktualizacji zakupu:", error);
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

app.delete('/api/purchases/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const purchaseRef = purchasesCollection.doc(id);
        const doc = await purchaseRef.get();
        if (!doc.exists || doc.data().userId !== req.userId) {
            return res.status(403).json({ error: 'Brak uprawnień lub zakup nie istnieje.' });
        }
        await purchaseRef.delete();
        res.status(204).send();
    } catch (error) {
        console.error("Błąd usuwania zakupu:", error);
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

// --- API Kategorii i Tagów ---

app.get('/api/categories', authMiddleware, async (req, res) => {
    try {
        const categories = await getUserCategories(req.userId);
        res.json(categories.flat);
    } catch (error) {
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

app.get('/api/categories/v2', authMiddleware, async (req, res) => {
    try {
        const categories = await getUserCategories(req.userId);
        res.json(categories.structured);
    } catch (error) {
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

app.get('/api/tags', authMiddleware, async (req, res) => {
    try {
        const metadata = await getUserMetadata(req.userId);
        res.json(metadata.tagDefinitions);
    } catch (error) {
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

app.post('/api/tags/groups', authMiddleware, async (req, res) => {
    try {
        const { group, label, firstValue, firstLabel, firstIcon } = req.body;
        const groupKey = normalizeTagValue(group).replace(/\s+/g, '_');
        if (!groupKey || !isValidGroupName(groupKey) || ['nature', 'purpose'].includes(groupKey)) {
            return res.status(400).json({ error: 'Nieprawidłowa nazwa grupy.' });
        }
        const userRef = usersCollection.doc(req.userId);
        const userData = (await userRef.get()).data() || {};
        const tagDefinitions = normalizeTagDefinitions(userData.tagDefinitions || {});
        if (tagDefinitions[groupKey]) return res.status(400).json({ error: 'Grupa już istnieje.' });

        const fv = normalizeTagValue(firstValue || firstLabel || 'domyślny');
        const fl = (firstLabel || firstValue || 'Domyślny').trim();
        tagDefinitions[groupKey] = [{ value: fv, label: fl, icon: (firstIcon || '').trim() }];
        tagDefinitions[groupKey + '_label'] = (label || groupKey).trim();
        await userRef.update({ tagDefinitions });
        res.status(201).json({ success: true, tagDefinitions });
    } catch (error) {
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

app.put('/api/tags/groups/:group', authMiddleware, async (req, res) => {
    try {
        const group = normalizeTagValue(req.params.group);
        const { label } = req.body;
        if (!label) return res.status(400).json({ error: 'Etykieta jest wymagana.' });
        const userRef = usersCollection.doc(req.userId);
        const tagDefinitions = normalizeTagDefinitions((await userRef.get()).data()?.tagDefinitions || {});
        if (!tagDefinitions[group]) return res.status(404).json({ error: 'Grupa nie istnieje.' });
        tagDefinitions[group + '_label'] = label;
        await userRef.update({ tagDefinitions });
        res.json({ success: true, tagDefinitions });
    } catch (error) {
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

app.delete('/api/tags/groups/:group', authMiddleware, async (req, res) => {
    try {
        const group = normalizeTagValue(req.params.group);
        if (['nature', 'purpose'].includes(group)) return res.status(400).json({ error: 'Nie można usunąć tej grupy.' });
        const userRef = usersCollection.doc(req.userId);
        const tagDefinitions = normalizeTagDefinitions((await userRef.get()).data()?.tagDefinitions || {});
        if (!tagDefinitions[group]) return res.status(404).json({ error: 'Grupa nie istnieje.' });
        delete tagDefinitions[group];
        delete tagDefinitions[group + '_label'];
        await userRef.update({ tagDefinitions });
        await deleteTagGroupFromUserData(req.userId, group);
        res.json({ success: true, tagDefinitions });
    } catch (error) {
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

app.post('/api/tags/:group', authMiddleware, async (req, res) => {
    try {
        const group = normalizeTagValue(req.params.group);
        const { value, label, icon } = req.body;
        if (!value) return res.status(400).json({ error: 'Wartość jest wymagana.' });
        const userRef = usersCollection.doc(req.userId);
        const tagDefinitions = normalizeTagDefinitions((await userRef.get()).data()?.tagDefinitions || {});
        if (!tagDefinitions[group]) tagDefinitions[group] = [];
        if (tagDefinitions[group].some(t => t.value === value)) return res.status(400).json({ error: 'Tag już istnieje.' });
        tagDefinitions[group].push({ value: normalizeTagValue(value), label: (label || value).trim(), icon: (icon || '').trim() });
        await userRef.update({ tagDefinitions });
        res.status(201).json({ success: true, tagDefinitions });
    } catch (error) {
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

app.put('/api/tags/:group/:value', authMiddleware, async (req, res) => {
    try {
        const { group: groupKey, value: oldValue } = req.params;
        const group = normalizeTagValue(groupKey);
        const oldVal = normalizeTagValue(oldValue);
        const { value: newVal, label, icon } = req.body;
        if (!newVal) return res.status(400).json({ error: 'Nowa wartość jest wymagana.' });
        const userRef = usersCollection.doc(req.userId);
        const tagDefinitions = normalizeTagDefinitions((await userRef.get()).data()?.tagDefinitions || {});
        const idx = tagDefinitions[group]?.findIndex(t => t.value === oldVal);
        if (idx === -1 || idx === undefined) return res.status(404).json({ error: 'Tag nie istnieje.' });
        const nv = normalizeTagValue(newVal);
        tagDefinitions[group][idx] = { value: nv, label: (label || newVal).trim(), icon: (icon || '').trim() };
        await userRef.update({ tagDefinitions });
        if (oldVal !== nv) {
            const fallback = getDefaultTagValue(tagDefinitions, group);
            await updateTagInUserData(req.userId, group, oldVal, nv, false, fallback);
        }
        res.json({ success: true, tagDefinitions });
    } catch (error) {
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

app.delete('/api/tags/:group/:value', authMiddleware, async (req, res) => {
    try {
        const { group: groupKey, value: targetVal } = req.params;
        const group = normalizeTagValue(groupKey);
        const target = normalizeTagValue(targetVal);
        const userRef = usersCollection.doc(req.userId);
        const tagDefinitions = normalizeTagDefinitions((await userRef.get()).data()?.tagDefinitions || {});
        if (!tagDefinitions[group]) return res.status(404).json({ error: 'Grupa nie istnieje.' });
        if (tagDefinitions[group].length <= 1) return res.status(400).json({ error: 'Nie można usunąć ostatniego tagu.' });
        tagDefinitions[group] = tagDefinitions[group].filter(t => t.value !== target);
        const fallback = getDefaultTagValue(tagDefinitions, group);
        await userRef.update({ tagDefinitions });
        await updateTagInUserData(req.userId, group, target, '', true, fallback);
        res.json({ success: true, tagDefinitions });
    } catch (error) {
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

app.post('/api/categories/v2', authMiddleware, async (req, res) => {
    try {
        const { structuredCategories } = req.body;
        const userRef = usersCollection.doc(req.userId);
        const userData = (await userRef.get()).data() || {};
        const parentNames = structuredCategories.filter(c => !c.parentId).map(c => c.name).filter(Boolean);
        const mergedCustom = mergeUniqueNamesCI(userData.customCategories || [], parentNames);
        await userRef.update({ structuredCategories, customCategories: mergedCustom });
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

app.put('/api/categories/v2/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, icon, color } = req.body;
        const userRef = usersCollection.doc(req.userId);
        const userData = (await userRef.get()).data() || {};
        let cats = userData.structuredCategories || [];
        const idx = cats.findIndex(c => c.id === id);
        if (idx === -1) return res.status(404).json({ error: 'Nie znaleziono.' });
        
        const cat = cats[idx];
        const oldName = cat.name;
        const parentId = cat.parentId;

        // Aktualizacja obiektu bez wprowadzania wartości undefined
        const updatedCat = { ...cat };
        if (name !== undefined) updatedCat.name = name;
        if (icon !== undefined) updatedCat.icon = icon;
        if (color !== undefined) updatedCat.color = color;
        
        cats[idx] = updatedCat;
        
        let customCategories = userData.customCategories || [];
        // customCategories zawiera tylko nazwy głównych kategorii (parentId == null)
        if (!parentId) {
            customCategories = renameNameCI(customCategories, oldName, updatedCat.name);
        }
        
        await userRef.update({ 
            structuredCategories: cats, 
            customCategories 
        });
        
        if (oldName !== updatedCat.name) {
            // Przekazujemy parentId, aby bulkUpdate wiedziało czy to kategoria główna czy podkategoria
            await bulkUpdatePurchasesCategory(req.userId, oldName, updatedCat.name, { parentId });
        }
        
        res.json({ success: true, category: updatedCat });
    } catch (error) {
        console.error("Błąd aktualizacji kategorii:", error);
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

app.delete('/api/categories/v2/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const userRef = usersCollection.doc(req.userId);
        const userData = (await userRef.get()).data() || {};
        let cats = userData.structuredCategories || [];
        const target = cats.find(c => c.id === id);
        if (!target) return res.status(404).json({ error: 'Nie znaleziono.' });
        const oldName = target.name;
        const isParent = !target.parentId;
        let fallback = null;
        if (isParent) {
            fallback = resolveOrphanFallback(cats, id);
            await bulkUpdatePurchasesCategory(req.userId, oldName, '', { fallback, isDelete: true });
            cats = cats.filter(c => c.id !== id && c.parentId !== id);
        } else {
            await bulkUpdatePurchasesCategory(req.userId, oldName, '', { parentId: target.parentId, isDelete: true });
            cats = cats.filter(c => c.id !== id);
        }
        const updatedCustom = isParent ? mergeUniqueNamesCI(removeNameCI(userData.customCategories || [], oldName), [fallback?.category || 'inne']) : userData.customCategories;
        await userRef.update({ structuredCategories: cats, customCategories: updatedCustom });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

// --- API Budżetów ---

app.get('/api/budgets/:year/:month', authMiddleware, async (req, res) => {
    try {
        const doc = await budgetsCollection.doc(`${req.userId}_${req.params.year}-${req.params.month}`).get();
        res.json(doc.exists ? doc.data() : { budgets: {} });
    } catch (error) {
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

app.post('/api/budgets/:year/:month', authMiddleware, async (req, res) => {
    try {
        const { year, month } = req.params;
        const { budgets } = req.body;
        const budgetData = { userId: req.userId, month: `${year}-${month}`, budgets, updatedAt: new Date() };
        await budgetsCollection.doc(`${req.userId}_${year}-${month}`).set(budgetData);
        res.json(budgetData);
    } catch (error) {
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

app.get('/api/special-budgets', authMiddleware, async (req, res) => {
    try {
        const snapshot = await specialBudgetsCollection.where('userId', '==', req.userId).get();
        const budgets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        budgets.sort((a, b) => b.createdAt.toDate() - a.createdAt.toDate());
        res.json(budgets);
    } catch (error) {
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

app.post('/api/special-budgets', authMiddleware, async (req, res) => {
    try {
        const { name, amount } = req.body;
        const newBudget = { userId: req.userId, name, amount: parseFloat(amount), createdAt: new Date() };
        const docRef = await specialBudgetsCollection.add(newBudget);
        res.status(201).json({ id: docRef.id, ...newBudget });
    } catch (error) {
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

app.put('/api/special-budgets/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, amount } = req.body;
        const ref = specialBudgetsCollection.doc(id);
        const doc = await ref.get();
        if (!doc.exists || doc.data().userId !== req.userId) return res.status(403).json({ error: 'Brak uprawnień.' });
        await ref.update({ name, amount: parseFloat(amount), updatedAt: new Date() });
        res.json({ id, name, amount: parseFloat(amount) });
    } catch (error) {
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

app.delete('/api/special-budgets/:id', authMiddleware, async (req, res) => {
    try {
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
    } catch (error) {
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

// --- API Powiadomień ---

app.get('/api/notifications', authMiddleware, async (req, res) => {
    try {
        const snapshot = await notificationsCollection
            .where('userId', '==', req.userId)
            .limit(100)
            .get();
            
        const now = Date.now();
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        const notifications = [];
        
        snapshot.forEach(doc => {
            const data = doc.data();
            
            // Filtrujemy usunięte (obsługujemy brak pola isDeleted jako false)
            if (data.isDeleted === true) return;
            
            // Ukrywamy stare, przeczytane powiadomienia (powyżej 7 dni)
            if (data.isRead && data.readAt && (now - data.readAt > sevenDays)) return;
            
            notifications.push({ id: doc.id, ...data });
        });
        
        // Sortowanie po dacie (najnowsze na górze)
        notifications.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        
        res.json(notifications.slice(0, 50));
    } catch (error) {
        console.error('Błąd pobierania powiadomień:', error);
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

app.post('/api/notifications', authMiddleware, async (req, res) => {
    try {
        const { type, message, monthKey } = req.body;
        
        // Sprawdzamy czy powiadomienie o tym typie już istnieje (nawet jeśli zostało usunięte/isDeleted: true)
        const existing = await notificationsCollection
            .where('userId', '==', req.userId)
            .where('type', '==', type)
            .where('monthKey', '==', monthKey)
            .limit(1)
            .get();
            
        if (!existing.empty) {
            return res.json({ success: true, message: 'Notification already exists (could be deleted by user)' });
        }
        
        const newNotif = { 
            userId: req.userId, 
            type, 
            message, 
            monthKey, 
            date: new Date().toISOString(), 
            isRead: false, 
            readAt: null,
            isDeleted: false 
        };
        
        const docRef = await notificationsCollection.add(newNotif);
        res.json({ id: docRef.id, ...newNotif });
    } catch (error) {
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

app.post('/api/notifications/read', authMiddleware, async (req, res) => {
    try {
        const batch = db.batch();
        req.body.notificationIds.forEach(id => {
            batch.update(notificationsCollection.doc(id), { isRead: true, readAt: Date.now() });
        });
        await batch.commit();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

app.delete('/api/notifications/:id', authMiddleware, async (req, res) => {
    try {
        const ref = notificationsCollection.doc(req.params.id);
        const doc = await ref.get();
        if (!doc.exists || doc.data().userId !== req.userId) {
            return res.status(403).json({ error: 'Brak uprawnień.' });
        }
        
        // Zamiast usuwać fizycznie, oznaczamy jako usunięte
        await ref.update({ isDeleted: true });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

// --- API Analizy AI ---

app.post('/api/analysis/insights', authMiddleware, async (req, res) => {
    try {
        const todayKey = new Date().toISOString().substring(0, 10);
        const existing = await notificationsCollection.where('userId', '==', req.userId).where('type', '==', 'ai_insight').where('monthKey', '==', todayKey).limit(1).get();
        if (!existing.empty) return res.status(429).json({ error: 'Dzisiejsza analiza już wygenerowana.' });
        const { currentMonthData, previousMonthData, categories } = req.body;
        const insights = await generateInsights(req.userId, currentMonthData, previousMonthData, categories);
        res.json(insights);
    } catch (error) {
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

app.post('/api/analyze-receipt', authMiddleware, async (req, res) => {
    try {
        const { image, mimetype, filename, size } = req.body;
        if (!image) return res.status(400).json({ error: 'Brak obrazu.' });
        const fileObject = { buffer: Buffer.from(image, 'base64'), mimetype, originalname: filename, size };
        const categories = await getUserCategories(req.userId);
        const analysisResult = await extractAndCategorizePurchase(fileObject, categories);
        const conversion = await convertCurrencyToPLN(analysisResult.items || [], analysisResult.currency || 'PLN');
        const finalAnalysis = {
            shop: analysisResult.shop || 'Nieznany sklep',
            date: validateDate(analysisResult.date) || new Date().toISOString().split('T')[0],
            currency: 'PLN',
            originalCurrency: conversion.originalCurrency,
            exchangeRate: conversion.exchangeRate,
            rateSuccess: conversion.rateSuccess,
            items: conversion.items
        };
        res.json({ success: true, analysis: finalAnalysis });
    } catch (error) {
        console.error("Błąd analizy paragonu:", error);
        const status = (error.message && (error.message.includes('503') || error.message.includes('overloaded'))) ? 503 : 400;
        res.status(status).json({ success: false, error: error.message || 'Błąd analizy.' });
    }
});

// --- API Statystyk ---

app.get('/api/statistics', authMiddleware, async (req, res) => {
    try {
        const { year, month } = req.query;
        const metadata = await getUserMetadata(req.userId);
        const targetDate = (year && month) ? new Date(parseInt(year), parseInt(month) - 1, 15) : new Date();
        const start = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1).toISOString().split('T')[0];
        const end = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).toISOString().split('T')[0];
        const snapshot = await purchasesCollection.where('userId', '==', req.userId).where('date', '>=', start).where('date', '<=', end).get();
        const monthlyPurchases = snapshot.docs.map(doc => doc.data()).filter(p => !p.specialBudgetId);
        const monthlyTotal = monthlyPurchases.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
        const spendingByCategory = monthlyPurchases.flatMap(p => p.items || []).reduce((acc, item) => {
            const cat = item.category || 'inne';
            acc[cat] = (acc[cat] || 0) + (item.price || 0);
            return acc;
        }, {});
        res.json({ monthlyTotal, spendingByCategory, availableMonths: metadata.availableMonths });
    } catch (error) {
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

app.get('/api/statistics/comparison', authMiddleware, async (req, res) => {
    try {
        const { mode, category, subCategory, mtd } = req.query;
        const isMtdMode = mtd === 'true' || mode === 'mtd';
        const today = new Date();
        const targetDay = today.getDate();
        let startDateStr, endDateStr, expectedMonths = [];

        if (mode === '6months') {
            const d = new Date(today.getFullYear(), today.getMonth() - 5, 1);
            startDateStr = d.toISOString().split('T')[0];
            endDateStr = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
            for (let i = 5; i >= 0; i--) {
                const m = new Date(today.getFullYear(), today.getMonth() - i, 1);
                expectedMonths.push(m.toISOString().substring(0, 7));
            }
        } else if (mode === 'year') {
            const targetYear = req.query.year || today.getFullYear();
            startDateStr = `${targetYear}-01-01`;
            endDateStr = `${targetYear}-12-31`;
            for (let i = 1; i <= 12; i++) expectedMonths.push(`${targetYear}-${String(i).padStart(2, '0')}`);
        } else {
            const d = new Date(today.getFullYear() - 1, today.getMonth() + 1, 1);
            startDateStr = d.toISOString().split('T')[0];
            endDateStr = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
            for (let i = 11; i >= 0; i--) {
                const m = new Date(today.getFullYear(), today.getMonth() - i, 1);
                expectedMonths.push(m.toISOString().substring(0, 7));
            }
        }

        const snapshot = await purchasesCollection.where('userId', '==', req.userId).where('date', '>=', startDateStr).where('date', '<=', endDateStr).get();
        if (snapshot.empty) return res.json({ monthlyTotals: expectedMonths.map(month => ({ month, total: 0 })) });

        const purchases = snapshot.docs.map(doc => doc.data()).filter(p => !p.specialBudgetId);
        const standardParams = ['mode', 'category', 'subCategory', 'mtd', 'year'];
        const tagFilters = Object.keys(req.query).filter(k => !standardParams.includes(k) && req.query[k]).reduce((acc, k) => { acc[k] = normalizeTagValue(req.query[k]); return acc; }, {});

        const monthlyTotalsMap = purchases.reduce((acc, p) => {
            const month = p.date.substring(0, 7);
            let amount = 0;
            if (category || subCategory || Object.keys(tagFilters).length > 0) {
                amount = (p.items || []).filter(item => {
                    let match = true;
                    if (category && (item.category || 'inne') !== category) match = false;
                    if (subCategory && (item.subCategory || '') !== subCategory) match = false;
                    for (const [group, targetVal] of Object.entries(tagFilters)) {
                        if (normalizeTagValue((item.tags && item.tags[group]) || (p.tags && p.tags[group])) !== targetVal) { match = false; break; }
                    }
                    return match;
                }).reduce((sum, item) => sum + (item.price || 0), 0);
            } else amount = p.totalAmount || 0;

            if (amount === 0) return acc;
            if (isMtdMode && new Date(p.date).getDate() > targetDay) return acc;
            acc[month] = (acc[month] || 0) + amount;
            return acc;
        }, {});

        res.json({ monthlyTotals: expectedMonths.map(month => ({ month, total: monthlyTotalsMap[month] || 0 })) });
    } catch (error) {
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

app.get('/api/statistics/by-shop', authMiddleware, async (req, res) => {
    try {
        const { year, month } = req.query;
        const start = new Date(parseInt(year), parseInt(month) - 1, 1).toISOString().split('T')[0];
        const end = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];
        const snapshot = await purchasesCollection.where('userId', '==', req.userId).where('date', '>=', start).where('date', '<=', end).get();
        const spendingByShop = snapshot.docs.map(doc => doc.data()).filter(p => !p.specialBudgetId && p.shop !== 'Wydatek cykliczny').reduce((acc, p) => {
            const shop = p.shop || 'Nieznany sklep';
            acc[shop] = (acc[shop] || 0) + (p.totalAmount || 0);
            return acc;
        }, {});
        res.json({ spendingByShop });
    } catch (error) {
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

app.get('/api/statistics/category-details', authMiddleware, async (req, res) => {
    try {
        const { year, month, category } = req.query;
        const start = new Date(parseInt(year), parseInt(month) - 1, 1).toISOString().split('T')[0];
        const end = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];
        const snapshot = await purchasesCollection.where('userId', '==', req.userId).where('date', '>=', start).where('date', '<=', end).get();
        const items = snapshot.docs.map(doc => doc.data()).flatMap(p => (p.items || []).map(item => ({ ...item, purchaseDate: p.date, shop: p.shop }))).filter(item => (item.category || 'inne') === category);
        res.json({ items });
    } catch (error) {
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

app.post('/api/convert-currency', authMiddleware, async (req, res) => {
    try {
        const { items, fromCurrency, exchangeRate } = req.body;
        const rate = parseFloat(exchangeRate);
        if (isNaN(rate) || rate <= 0) return res.status(400).json({ error: 'Nieprawidłowy kurs.' });
        const convertedItems = items.map(item => ({ ...item, price: Math.round(item.price * rate * 100) / 100 }));
        res.json({ success: true, items: convertedItems, exchangeRate: rate, originalCurrency: fromCurrency, currency: 'PLN' });
    } catch (error) {
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

// --- Funkcja Cykliczna (CRON) ---

exports.addRecurringExpensesScheduled = onSchedule({
    schedule: '0 3 * * *',
    timeZone: 'Europe/Warsaw'
}, async (event) => {
    console.log('--- START: addRecurringExpensesScheduled (03:00 Warsaw) ---');
    try {
        const today = new Date();
        const snapshot = await recurringExpensesCollection.get();
        
        if (snapshot.empty) {
            console.log('Brak zdefiniowanych wydatków cyklicznych.');
            return null;
        }

        console.log(`Znaleziono ${snapshot.size} dokumentów wydatków cyklicznych.`);

        const expensesByUser = {};
        snapshot.forEach(doc => {
            try {
                const exp = doc.data();
                if (!expensesByUser[exp.userId]) expensesByUser[exp.userId] = [];
                expensesByUser[exp.userId].push({ id: doc.id, ...exp });
            } catch (err) {
                console.error(`Błąd podczas odczytu dokumentu ${doc.id}:`, err);
            }
        });

        for (const userId in expensesByUser) {
            const batch = db.batch();
            let anyNew = false;
            
            for (const exp of expensesByUser[userId]) {
                try {
                    if (shouldAddExpenseToday(exp, today)) {
                        const date = today.toISOString().split('T')[0];
                        console.log(`DODAJĘ: Wydatek "${exp.name}" (ID: ${exp.id}) dla użytkownika ${userId}`);
                        
                        const newPurchase = {
                            userId, 
                            shop: "Wydatek cykliczny", 
                            date, 
                            totalAmount: exp.amount, 
                            isRecurring: true, 
                            createdAt: new Date(),
                            items: [{ 
                                name: exp.name, 
                                price: exp.amount, 
                                category: exp.category, 
                                subCategory: exp.subCategory || '', 
                                tags: exp.tags || {} 
                            }]
                        };
                        batch.set(purchasesCollection.doc(), newPurchase);
                        batch.update(recurringExpensesCollection.doc(exp.id), { lastAdded: date });
                        anyNew = true;
                    }
                } catch (err) {
                    console.error(`Błąd przetwarzania wydatku ${exp.id} dla użytkownika ${userId}:`, err);
                }
            }
            
            if (anyNew) {
                await batch.commit();
                await usersCollection.doc(userId).set({ 
                    availableMonths: FieldValue.arrayUnion(today.toISOString().substring(0, 7)) 
                }, { merge: true });
                console.log(`Zapisano batche dla użytkownika ${userId}`);
            }
        }
    } catch (globalErr) {
        console.error('KRYTYCZNY BŁĄD funkcji addRecurringExpensesScheduled:', globalErr);
    }
    
    console.log('--- KONIEC: addRecurringExpensesScheduled ---');
    return null;
});

exports.api = functions.https.onRequest({
    secrets: ['GEMINI_API_KEY']
}, app);
