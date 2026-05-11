const express = require('express');
const router = express.Router();
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { authMiddleware, asyncHandler } = require('../middleware');
const { 
    generateInsights,
    generateInsightsRange,
    extractAndCategorizePurchase, 
    transcribeAudio, 
    analyzeVoiceExpenseText 
} = require('../ai-service');
const { getUserCategories } = require('../categories-service');
const { validateDate, convertCurrencyToPLN } = require('../utils');

const db = getFirestore();
const notificationsCollection = db.collection('notifications');
const aiAnalysisRangeQuota = db.collection('aiAnalysisRangeQuota');

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
