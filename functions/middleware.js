const { getAuth } = require('firebase-admin/auth');

/**
 * Middleware uwierzytelniający żądania przy użyciu Firebase ID Token
 */
const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization || req.headers['x-firebase-token'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Brak tokena lub nieprawidłowy format.' });
    }

    const idToken = authHeader.split('Bearer ')[1];

    try {
        const decodedToken = await getAuth().verifyIdToken(idToken);
        req.userId = decodedToken.uid;
        next();
    } catch (error) {
        console.error("Błąd weryfikacji tokena:", error);
        return res.status(401).json({ success: false, error: 'Nieprawidłowy lub nieważny token.' });
    }
};

/**
 * Wrapper dla asynchronicznych funkcji tras, automatycznie przekazujący błędy do next()
 */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Globalny handler błędów
 */
const errorHandler = (err, req, res, next) => {
    console.error('[Global Error Handler]:', err);
    
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Wystąpił nieoczekiwany błąd serwera.';
    
    res.status(statusCode).json({
        success: false,
        error: message,
        stack: process.env.NODE_ENV === 'production' ? null : err.stack
    });
};

module.exports = {
    authMiddleware,
    asyncHandler,
    errorHandler
};
