const express = require('express');
const router = express.Router();
const { getFirestore } = require('firebase-admin/firestore');
const { authMiddleware, asyncHandler } = require('../middleware');

const db = getFirestore();
const notificationsCollection = db.collection('notifications');

// --- Powiadomienia (stara ścieżka: /api/notifications) ---

router.get('/notifications', authMiddleware, asyncHandler(async (req, res) => {
    const snapshot = await notificationsCollection
        .where('userId', '==', req.userId)
        .limit(100)
        .get();
        
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const notifications = [];
    
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.isDeleted === true) return;
        if (data.isRead && data.readAt && (now - data.readAt > sevenDays)) return;
        notifications.push({ id: doc.id, ...data });
    });
    
    notifications.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    res.json(notifications.slice(0, 50));
}));

router.post('/notifications', authMiddleware, asyncHandler(async (req, res) => {
    const { type, message, monthKey } = req.body;
    const existing = await notificationsCollection
        .where('userId', '==', req.userId)
        .where('type', '==', type)
        .where('monthKey', '==', monthKey)
        .limit(1)
        .get();
        
    if (!existing.empty) {
        return res.json({ success: true, message: 'Notification already exists' });
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
}));

router.post('/notifications/read', authMiddleware, asyncHandler(async (req, res) => {
    const batch = db.batch();
    req.body.notificationIds.forEach(id => {
        batch.update(notificationsCollection.doc(id), { isRead: true, readAt: Date.now() });
    });
    await batch.commit();
    res.json({ success: true });
}));

router.delete('/notifications/:id', authMiddleware, asyncHandler(async (req, res) => {
    const ref = notificationsCollection.doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().userId !== req.userId) {
        return res.status(403).json({ error: 'Brak uprawnień.' });
    }
    await ref.update({ isDeleted: true });
    res.json({ success: true });
}));

module.exports = router;
