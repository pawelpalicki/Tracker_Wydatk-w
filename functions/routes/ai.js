const express = require('express');
const router = express.Router();
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { authMiddleware, asyncHandler } = require('../middleware');
const { 
    generateInsights,
    generateInsightsRange,
    generateNaturalSearchAnswer,
    extractAndCategorizePurchase, 
    parseNaturalSearchQuery,
    transcribeAudio, 
    analyzeVoiceExpenseText 
} = require('../ai-service');
const { getUserCategories } = require('../categories-service');
const { validateDate, convertCurrencyToPLN } = require('../utils');

const db = getFirestore();
const notificationsCollection = db.collection('notifications');
const aiAnalysisRangeQuota = db.collection('aiAnalysisRangeQuota');
const purchasesCollection = db.collection('expenses');

const ANALYSIS_AI_RANGE_DAILY_LIMIT = 8;
const ANALYSIS_AI_RANGE_MONTHLY_LIMIT = 50;

function getAnalysisRangeQuotaDateKeys() {
    const todayKey = new Date().toISOString().substring(0, 10);
    const monthYm = todayKey.substring(0, 7);
    return { todayKey, monthYm };
}

async function getAnalysisRangeQuotaStatus(userId) {
    const { todayKey, monthYm } = getAnalysisRangeQuotaDateKeys();
    const dailyRef = aiAnalysisRangeQuota.doc(`${userId}_${todayKey}`);
    const monthlyRef = aiAnalysisRangeQuota.doc(`${userId}_m_${monthYm}`);
    const [dSnap, mSnap] = await Promise.all([dailyRef.get(), monthlyRef.get()]);
    return {
        daily: {
            used: dSnap.exists ? Number(dSnap.data().count || 0) : 0,
            limit: ANALYSIS_AI_RANGE_DAILY_LIMIT
        },
        monthly: {
            used: mSnap.exists ? Number(mSnap.data().count || 0) : 0,
            limit: ANALYSIS_AI_RANGE_MONTHLY_LIMIT
        }
    };
}

// --- AI (stara ścieżka: /api/analysis/insights i /api/analyze-receipt itp.) ---

function normalizeSearchText(value = '') {
    return String(value)
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function addMonthsToDateKey(dateKey, months) {
    const [year, month, day] = String(dateKey).split('-').map(Number);
    const date = new Date(Date.UTC(year, (month || 1) - 1 + months, day || 1));
    return date.toISOString().substring(0, 10);
}

function amountOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function sanitizeNaturalSearchFilters(rawFilters = {}, localDate) {
    const defaultStartDate = addMonthsToDateKey(localDate, -6);
    const startDate = validateDate(rawFilters.startDate) || defaultStartDate;
    const endDate = validateDate(rawFilters.endDate) || localDate;
    const minAmount = amountOrNull(rawFilters.minAmount);
    const maxAmount = amountOrNull(rawFilters.maxAmount);

    return {
        startDate: startDate <= endDate ? startDate : endDate,
        endDate: endDate >= startDate ? endDate : startDate,
        shop: String(rawFilters.shop || '').trim(),
        category: String(rawFilters.category || '').trim(),
        subCategory: String(rawFilters.subCategory || '').trim(),
        keyword: String(rawFilters.keyword || '').trim(),
        tagFilters: rawFilters.tagFilters && typeof rawFilters.tagFilters === 'object' ? rawFilters.tagFilters : {},
        minAmount,
        maxAmount,
        intent: String(rawFilters.intent || '').trim()
    };
}

function purchaseMatchesAmount(purchase, filters) {
    const total = Number(purchase.totalAmount || 0);
    if (filters.minAmount !== null && total < filters.minAmount) return false;
    if (filters.maxAmount !== null && total > filters.maxAmount) return false;
    return true;
}

function itemMatchesNaturalFilters(item, filters) {
    const keyword = normalizeSearchText(filters.keyword);
    const category = normalizeSearchText(filters.category);
    const subCategory = normalizeSearchText(filters.subCategory);

    if (keyword) {
        const itemText = normalizeSearchText(`${item.name || ''} ${item.category || ''} ${item.subCategory || ''}`);
        if (!itemText.includes(keyword)) return false;
    }
    if (category && normalizeSearchText(item.category) !== category) return false;
    if (subCategory && normalizeSearchText(item.subCategory) !== subCategory) return false;

    const tagEntries = Object.entries(filters.tagFilters || {}).filter(([, value]) => value);
    for (const [group, value] of tagEntries) {
        if (normalizeSearchText(item.tags && item.tags[group]) !== normalizeSearchText(value)) return false;
    }

    return true;
}

function filterPurchasesForNaturalSearch(purchases, filters) {
    const shop = normalizeSearchText(filters.shop);
    const hasItemFilters = Boolean(
        filters.keyword ||
        filters.category ||
        filters.subCategory ||
        Object.values(filters.tagFilters || {}).some(Boolean)
    );

    return purchases.reduce((out, purchase) => {
        if (shop && !normalizeSearchText(purchase.shop).includes(shop)) return out;
        if (!purchaseMatchesAmount(purchase, filters)) return out;

        const items = Array.isArray(purchase.items) ? purchase.items : [];
        const matchingItems = hasItemFilters ? items.filter(item => itemMatchesNaturalFilters(item, filters)) : items;
        if (hasItemFilters && matchingItems.length === 0) return out;

        const matchedTotalAmount = hasItemFilters
            ? matchingItems.reduce((sum, item) => sum + Number(item.price || 0), 0)
            : Number(purchase.totalAmount || 0);

        out.push({
            ...purchase,
            matchedItems: matchingItems,
            matchedTotalAmount
        });
        return out;
    }, []);
}

function topEntries(values, limit = 3) {
    const counts = new Map();
    values.filter(Boolean).forEach(value => {
        counts.set(value, (counts.get(value) || 0) + 1);
    });
    return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([name, count]) => ({ name, count }));
}

function buildNaturalSearchSummary(query, filters, purchases, totalScanned) {
    const items = purchases.flatMap(purchase => purchase.matchedItems || purchase.items || []);
    const totalAmount = purchases.reduce((sum, purchase) => {
        const amount = purchase.matchedTotalAmount !== undefined ? purchase.matchedTotalAmount : purchase.totalAmount;
        return sum + Number(amount || 0);
    }, 0);
    return {
        query,
        filters,
        totalAmount: Math.round(totalAmount * 100) / 100,
        purchaseCount: purchases.length,
        itemCount: items.length,
        totalScanned,
        topShops: topEntries(purchases.map(purchase => purchase.shop)),
        topCategories: topEntries(items.map(item => item.category)),
        dateRange: {
            startDate: filters.startDate,
            endDate: filters.endDate
        }
    };
}

function buildNaturalSearchFallbackAnswer(summary) {
    if (!summary.purchaseCount) {
        return 'Nie znalazlem pasujacych transakcji dla tego pytania.';
    }

    const amount = Number(summary.totalAmount || 0).toFixed(2).replace('.', ',');
    const itemPart = summary.itemCount ? `, obejmujacych ${summary.itemCount} pasujacych pozycji` : '';
    return `Wynik: ${amount} zl w ${summary.purchaseCount} zakupach${itemPart}.`;
}

router.post('/analysis/insights', authMiddleware, asyncHandler(async (req, res) => {
    const todayKey = new Date().toISOString().substring(0, 10);
    const existing = await notificationsCollection
        .where('userId', '==', req.userId)
        .where('type', '==', 'ai_insight')
        .where('monthKey', '==', todayKey)
        .limit(1)
        .get();
        
    if (!existing.empty) {
        return res.status(429).json({ error: 'Dzisiejsza analiza już wygenerowana.' });
    }
    
    const { currentMonthData, previousMonthData, categories } = req.body;
    const insights = await generateInsights(req.userId, currentMonthData, previousMonthData, categories);
    res.json(insights);
}));

router.get('/analysis/insights-range/quota', authMiddleware, asyncHandler(async (req, res) => {
    const quota = await getAnalysisRangeQuotaStatus(req.userId);
    res.json(quota);
}));

router.post('/analysis/insights-range', authMiddleware, asyncHandler(async (req, res) => {
    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
        return res.status(400).json({ error: 'Brak danych analizy.' });
    }
    if (!payload.range || typeof payload.range.startDate !== 'string' || typeof payload.range.endDate !== 'string') {
        return res.status(400).json({ error: 'Nieprawidłowy zakres dat.' });
    }

    const { todayKey, monthYm } = getAnalysisRangeQuotaDateKeys();
    const dailyRef = aiAnalysisRangeQuota.doc(`${req.userId}_${todayKey}`);
    const monthlyRef = aiAnalysisRangeQuota.doc(`${req.userId}_m_${monthYm}`);

    await db.runTransaction(async (tx) => {
        const dSnap = await tx.get(dailyRef);
        const mSnap = await tx.get(monthlyRef);
        const dCount = dSnap.exists ? Number(dSnap.data().count || 0) : 0;
        const mCount = mSnap.exists ? Number(mSnap.data().count || 0) : 0;
        if (dCount >= ANALYSIS_AI_RANGE_DAILY_LIMIT) {
            const err = new Error(`Dzienny limit analiz AI (${ANALYSIS_AI_RANGE_DAILY_LIMIT}) został wykorzystany. Spróbuj jutro.`);
            err.statusCode = 429;
            throw err;
        }
        if (mCount >= ANALYSIS_AI_RANGE_MONTHLY_LIMIT) {
            const err = new Error(`Miesięczny limit analiz AI (${ANALYSIS_AI_RANGE_MONTHLY_LIMIT}) został wykorzystany.`);
            err.statusCode = 429;
            throw err;
        }
        tx.set(dailyRef, {
            count: dCount + 1,
            userId: req.userId,
            day: todayKey,
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        tx.set(monthlyRef, {
            count: mCount + 1,
            userId: req.userId,
            month: monthYm,
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
    });

    try {
        const result = await generateInsightsRange(req.userId, payload);
        const insights = Array.isArray(result.insights) ? result.insights : [];
        if (insights.length === 0) {
            const err = new Error('Model nie zwrócił wniosków. Spróbuj ponownie.');
            err.statusCode = 502;
            throw err;
        }
        const quota = await getAnalysisRangeQuotaStatus(req.userId);
        res.json({ insights, quota });
    } catch (e) {
        try {
            await db.runTransaction(async (tx) => {
                const dSnap = await tx.get(dailyRef);
                const mSnap = await tx.get(monthlyRef);
                const dCount = dSnap.exists ? Number(dSnap.data().count || 0) : 0;
                const mCount = mSnap.exists ? Number(mSnap.data().count || 0) : 0;
                if (dCount > 0) {
                    tx.set(dailyRef, {
                        count: dCount - 1,
                        userId: req.userId,
                        updatedAt: FieldValue.serverTimestamp()
                    }, { merge: true });
                }
                if (mCount > 0) {
                    tx.set(monthlyRef, {
                        count: mCount - 1,
                        userId: req.userId,
                        updatedAt: FieldValue.serverTimestamp()
                    }, { merge: true });
                }
            });
        } catch (rollbackErr) {
            console.error('Rollback quota aiAnalysisRangeQuota:', rollbackErr);
        }
        throw e;
    }
}));

router.post('/ai/natural-search', authMiddleware, asyncHandler(async (req, res) => {
    const queryText = String(req.body.query || '').trim();
    if (!queryText) {
        return res.status(400).json({ error: 'Brak tekstu zapytania.' });
    }

    const localDate = validateDate(req.body.localDate) || new Date().toISOString().split('T')[0];
    const timezone = req.body.timezone || 'Europe/Warsaw';
    const categories = await getUserCategories(req.userId);
    const parsedFilters = await parseNaturalSearchQuery(queryText, categories, { localDate, timezone });
    const filters = sanitizeNaturalSearchFilters(parsedFilters, localDate);

    const snapshot = await purchasesCollection
        .where('userId', '==', req.userId)
        .where('date', '>=', filters.startDate)
        .where('date', '<=', filters.endDate)
        .orderBy('date', 'desc')
        .limit(1000)
        .get();

    const purchases = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const filteredPurchases = filterPurchasesForNaturalSearch(purchases, filters);
    const summary = buildNaturalSearchSummary(queryText, filters, filteredPurchases, purchases.length);

    let answer = '';
    try {
        answer = await generateNaturalSearchAnswer(summary);
    } catch (error) {
        console.error('Blad generowania odpowiedzi wyszukiwania naturalnego:', error);
        answer = buildNaturalSearchFallbackAnswer(summary);
    }
    if (!String(answer || '').trim()) {
        answer = buildNaturalSearchFallbackAnswer(summary);
    }

    res.json({
        success: true,
        answer,
        purchases: filteredPurchases.slice(0, 200),
        filters,
        summary: {
            ...summary,
            returnedCount: Math.min(filteredPurchases.length, 200),
            truncated: filteredPurchases.length > 200
        }
    });
}));

router.post('/analyze-receipt', authMiddleware, asyncHandler(async (req, res) => {
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
}));

router.post('/transcribe-audio', authMiddleware, asyncHandler(async (req, res) => {
    const { audio, mimetype, filename, size, languageCode } = req.body;
    if (!audio) return res.status(400).json({ error: 'Brak nagrania audio.' });

    const fileObject = { buffer: Buffer.from(audio, 'base64'), mimetype, originalname: filename, size };
    const transcription = await transcribeAudio(fileObject, { languageCode });
    res.json({ success: true, transcript: transcription.transcript, results: transcription.results });
}));

router.post('/analyze-voice-expense', authMiddleware, asyncHandler(async (req, res) => {
    const { transcript, context = {} } = req.body;
    if (!transcript || !transcript.trim()) {
        return res.status(400).json({ error: 'Brak tekstu do analizy.' });
    }

    const categories = await getUserCategories(req.userId);
    const validatedLocalDate = validateDate(context.localDate) || new Date().toISOString().split('T')[0];
    const analysisResult = await analyzeVoiceExpenseText(transcript.trim(), categories, {
        localDate: validatedLocalDate,
        timezone: context.timezone || 'Europe/Warsaw'
    });

    const conversion = await convertCurrencyToPLN(analysisResult.items || [], analysisResult.currency || 'PLN');
    const finalAnalysis = {
        shop: analysisResult.shop || 'Zakup głosowy',
        date: validateDate(analysisResult.date) || validatedLocalDate,
        currency: 'PLN',
        originalCurrency: conversion.originalCurrency,
        exchangeRate: conversion.exchangeRate,
        rateSuccess: conversion.rateSuccess,
        items: conversion.items
    };

    res.json({ success: true, analysis: finalAnalysis });
}));

router.post('/convert-currency', authMiddleware, asyncHandler(async (req, res) => {
    const { items, fromCurrency, exchangeRate } = req.body;
    const rate = parseFloat(exchangeRate);
    if (isNaN(rate) || rate <= 0) return res.status(400).json({ error: 'Nieprawidłowy kurs.' });
    const convertedItems = items.map(item => ({ ...item, price: Math.round(item.price * rate * 100) / 100 }));
    res.json({ success: true, items: convertedItems, exchangeRate: rate, originalCurrency: fromCurrency, currency: 'PLN' });
}));

module.exports = router;
