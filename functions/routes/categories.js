const express = require('express');
const router = express.Router();
const { getFirestore } = require('firebase-admin/firestore');
const { authMiddleware, asyncHandler } = require('../middleware');
const { 
    getUserCategories, 
    getUserMetadata, 
    resolveOrphanFallback, 
    bulkUpdatePurchasesCategory,
    updateTagInUserData,
    deleteTagGroupFromUserData
} = require('../categories-service');
const { 
    normalizeTagValue, 
    isValidGroupName, 
    normalizeTagDefinitions, 
    getDefaultTagValue,
    mergeUniqueNamesCI,
    renameNameCI,
    removeNameCI
} = require('../utils');

const db = getFirestore();
const usersCollection = db.collection('users');

// --- Kategorie (stara ścieżka: /api/categories) ---

router.get('/categories', authMiddleware, asyncHandler(async (req, res) => {
    const categories = await getUserCategories(req.userId);
    res.json(categories.flat);
}));

router.get('/categories/v2', authMiddleware, asyncHandler(async (req, res) => {
    const categories = await getUserCategories(req.userId);
    res.json(categories.structured);
}));

router.post('/categories/v2', authMiddleware, asyncHandler(async (req, res) => {
    const { structuredCategories } = req.body;
    const userRef = usersCollection.doc(req.userId);
    const userData = (await userRef.get()).data() || {};
    const parentNames = structuredCategories.filter(c => !c.parentId).map(c => c.name).filter(Boolean);
    const mergedCustom = mergeUniqueNamesCI(userData.customCategories || [], parentNames);
    await userRef.update({ structuredCategories, customCategories: mergedCustom });
    res.status(200).json({ success: true });
}));

router.put('/categories/v2/:id', authMiddleware, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, icon, color, excludeFromExpenses } = req.body;
    const userRef = usersCollection.doc(req.userId);
    const userData = (await userRef.get()).data() || {};
    let cats = userData.structuredCategories || [];
    const idx = cats.findIndex(c => c.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Nie znaleziono.' });
    
    const cat = cats[idx];
    const oldName = cat.name;
    const parentId = cat.parentId;

    const updatedCat = { ...cat };
    if (name !== undefined) updatedCat.name = name;
    if (icon !== undefined) updatedCat.icon = icon;
    if (color !== undefined) updatedCat.color = color;
    if (excludeFromExpenses !== undefined) updatedCat.excludeFromExpenses = excludeFromExpenses;
    
    cats[idx] = updatedCat;
    
    let customCategories = userData.customCategories || [];
    if (!parentId) {
        customCategories = renameNameCI(customCategories, oldName, updatedCat.name);
    }
    
    await userRef.update({ 
        structuredCategories: cats, 
        customCategories 
    });
    
    if (oldName !== updatedCat.name) {
        await bulkUpdatePurchasesCategory(req.userId, oldName, updatedCat.name, { parentId });
    }
    
    res.json({ success: true, category: updatedCat });
}));

router.delete('/categories/v2/:id', authMiddleware, asyncHandler(async (req, res) => {
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
}));

// --- Tagi (stara ścieżka: /api/tags) ---

router.get('/tags', authMiddleware, asyncHandler(async (req, res) => {
    const metadata = await getUserMetadata(req.userId);
    res.json(metadata.tagDefinitions);
}));

router.post('/tags/groups', authMiddleware, asyncHandler(async (req, res) => {
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
}));

router.put('/tags/groups/:group', authMiddleware, asyncHandler(async (req, res) => {
    const group = normalizeTagValue(req.params.group);
    const { label } = req.body;
    if (!label) return res.status(400).json({ error: 'Etykieta jest wymagana.' });
    const userRef = usersCollection.doc(req.userId);
    const tagDefinitions = normalizeTagDefinitions((await userRef.get()).data()?.tagDefinitions || {});
    if (!tagDefinitions[group]) return res.status(404).json({ error: 'Grupa nie istnieje.' });
    tagDefinitions[group + '_label'] = label;
    await userRef.update({ tagDefinitions });
    res.json({ success: true, tagDefinitions });
}));

router.delete('/tags/groups/:group', authMiddleware, asyncHandler(async (req, res) => {
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
}));

router.post('/tags/:group', authMiddleware, asyncHandler(async (req, res) => {
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
}));

router.put('/tags/:group/:value', authMiddleware, asyncHandler(async (req, res) => {
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
}));

router.delete('/tags/:group/:value', authMiddleware, asyncHandler(async (req, res) => {
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
}));

module.exports = router;
