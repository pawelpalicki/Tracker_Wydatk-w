const express = require('express');
const router = express.Router();
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { authMiddleware, asyncHandler } = require('../middleware');
const rateLimit = require('express-rate-limit');

const db = getFirestore();
const usersCollection = db.collection('users');

// Konfiguracja rate limiting dla rejestracji
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 godzina
    max: 5, // Limit 5 rejestracji na godzinę z jednego adresu IP
    message: { success: false, error: 'Zbyt wiele prób rejestracji z tego adresu IP. Spróbuj ponownie za godzinę.' },
    standardHeaders: true, // Zwróć info o limicie w nagłówkach `RateLimit-*`
    legacyHeaders: false, // Wyłącz nagłówki `X-RateLimit-*`
});

// Obsługuje /auth/register (gdy montowany pod /auth)
router.post('/register', registerLimiter, asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Email i hasło są wymagane.' });
    }
    
    try {
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
        throw error;
    }
}));

// Obsługuje /api/user/me (gdy montowany pod /api)
router.get('/user/me', authMiddleware, asyncHandler(async (req, res) => {
    const userDoc = await usersCollection.doc(req.userId).get();
    if (!userDoc.exists) {
        return res.status(404).json({ error: 'Nie znaleziono użytkownika' });
    }
    res.json({ success: true, user: userDoc.data() });
}));

module.exports = router;
