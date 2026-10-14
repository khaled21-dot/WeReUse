const router = require('express').Router();
const { resubmit, getIdCard } = require('../controllers/verificationController');
const { protect, requireRole } = require('../middleware/auth');
const { uploadIdCard } = require('../middleware/upload');
const sanitize = require('../middleware/sanitize');

router.use(protect);

router.post('/resubmit', requireRole('student'), uploadIdCard, sanitize, resubmit);
router.get('/id-card/:userId', getIdCard); // owner or admin (checked in the controller)

module.exports = router;
