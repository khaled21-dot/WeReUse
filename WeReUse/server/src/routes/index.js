const router = require('express').Router();
const mongoose = require('mongoose');

router.get('/health', (req, res) => {
  res.json({ success: true, status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

router.use('/auth', require('./authRoutes'));
router.use('/categories', require('./categoryRoutes'));
router.use('/listings', require('./listingRoutes'));
router.use('/conversations', require('./chatRoutes'));
router.use('/verification', require('./verificationRoutes'));
router.use('/profile', require('./profileRoutes'));
router.use('/admin', require('./adminRoutes'));
router.use('/notifications', require('./notificationRoutes'));
router.use('/ratings', require('./ratingRoutes'));
router.use('/complaints', require('./complaintRoutes'));
router.use('/users', require('./userRoutes'));

module.exports = router;