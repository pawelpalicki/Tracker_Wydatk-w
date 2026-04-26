const express = require('express');
const router = express.Router();
const { getFirestore } = require('firebase-admin/firestore');
const { authMiddleware, asyncHandler } = require('../middleware');
const { getUserMetadata } = require('../categories-service');
const { normalizeTagValue } = require('../utils');

const db = getFirestore();
const purchasesCollection = db.collection('expenses');

// --- Statystyki (stara ścieżka: /api/statistics) ---

router.get('/statistics', authMiddleware, asyncHandler(async (req, res) => {
    const { year, month } = req.query;
    const metadata = await getUserMetadata(req.userId);
    const targetDate = (year && month) ? new Date(parseInt(year), parseInt(month) - 1, 15) : new Date();
    const start = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1).toISOString().split('T')[0];
    const end = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).toISOString().split('T')[0];
    
    const snapshot = await purchasesCollection
        .where('userId', '==', req.userId)
        .where('date', '>=', start)
        .where('date', '<=', end)
        .get();
        
    const monthlyPurchases = snapshot.docs.map(doc => doc.data()).filter(p => !p.specialBudgetId);
    const monthlyTotal = monthlyPurchases.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
    const spendingByCategory = monthlyPurchases.flatMap(p => p.items || []).reduce((acc, item) => {
        const cat = item.category || 'inne';
        acc[cat] = (acc[cat] || 0) + (item.price || 0);
        return acc;
    }, {});
    
    res.json({ monthlyTotal, spendingByCategory, availableMonths: metadata.availableMonths });
}));

router.get('/statistics/comparison', authMiddleware, asyncHandler(async (req, res) => {
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

    const snapshot = await purchasesCollection
        .where('userId', '==', req.userId)
        .where('date', '>=', startDateStr)
        .where('date', '<=', endDateStr)
        .get();
        
    if (snapshot.empty) {
        return res.json({ monthlyTotals: expectedMonths.map(month => ({ month, total: 0 })) });
    }

    const purchases = snapshot.docs.map(doc => doc.data()).filter(p => !p.specialBudgetId);
    const standardParams = ['mode', 'category', 'subCategory', 'mtd', 'year'];
    const tagFilters = Object.keys(req.query)
        .filter(k => !standardParams.includes(k) && req.query[k])
        .reduce((acc, k) => { acc[k] = normalizeTagValue(req.query[k]); return acc; }, {});

    const monthlyTotalsMap = purchases.reduce((acc, p) => {
        const month = p.date.substring(0, 7);
        let amount = 0;
        if (category || subCategory || Object.keys(tagFilters).length > 0) {
            amount = (p.items || []).filter(item => {
                let match = true;
                if (category && (item.category || 'inne') !== category) match = false;
                if (subCategory && (item.subCategory || '') !== subCategory) match = false;
                for (const [group, targetVal] of Object.entries(tagFilters)) {
                    if (normalizeTagValue((item.tags && item.tags[group]) || (p.tags && p.tags[group])) !== targetVal) { 
                        match = false; 
                        break; 
                    }
                }
                return match;
            }).reduce((sum, item) => sum + (item.price || 0), 0);
        } else {
            amount = p.totalAmount || 0;
        }

        if (amount === 0) return acc;
        if (isMtdMode && new Date(p.date).getDate() > targetDay) return acc;
        acc[month] = (acc[month] || 0) + amount;
        return acc;
    }, {});

    res.json({ monthlyTotals: expectedMonths.map(month => ({ month, total: monthlyTotalsMap[month] || 0 })) });
}));

router.get('/statistics/by-shop', authMiddleware, asyncHandler(async (req, res) => {
    const { year, month } = req.query;
    const start = new Date(parseInt(year), parseInt(month) - 1, 1).toISOString().split('T')[0];
    const end = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];
    const snapshot = await purchasesCollection
        .where('userId', '==', req.userId)
        .where('date', '>=', start)
        .where('date', '<=', end)
        .get();
        
    const spendingByShop = snapshot.docs.map(doc => doc.data())
        .filter(p => !p.specialBudgetId && p.shop !== 'Wydatek cykliczny')
        .reduce((acc, p) => {
            const shop = p.shop || 'Nieznany sklep';
            acc[shop] = (acc[shop] || 0) + (p.totalAmount || 0);
            return acc;
        }, {});
        
    res.json({ spendingByShop });
}));

router.get('/statistics/category-details', authMiddleware, asyncHandler(async (req, res) => {
    const { year, month, category } = req.query;
    const start = new Date(parseInt(year), parseInt(month) - 1, 1).toISOString().split('T')[0];
    const end = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];
    const snapshot = await purchasesCollection
        .where('userId', '==', req.userId)
        .where('date', '>=', start)
        .where('date', '<=', end)
        .get();
        
    const items = snapshot.docs.map(doc => doc.data())
        .flatMap(p => (p.items || []).map(item => ({ ...item, purchaseDate: p.date, shop: p.shop })))
        .filter(item => (item.category || 'inne') === category);
        
    res.json({ items });
}));

module.exports = router;
