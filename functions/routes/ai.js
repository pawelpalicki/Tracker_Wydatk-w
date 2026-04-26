const express = require('express');
const router = express.Router();
const { getFirestore } = require('firebase-admin/firestore');
const { authMiddleware, asyncHandler } = require('../middleware');
const { 
    generateInsights, 
    extractAndCategorizePurchase, 
    transcribeAudio, 
    analyzeVoiceExpenseText 
} = require('../ai-service');
const { getUserCategories } = require('../categories-service');
const { validateDate, convertCurrencyToPLN } = require('../utils');

const db = getFirestore();
const notificationsCollection = db.collection('notifications');

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
