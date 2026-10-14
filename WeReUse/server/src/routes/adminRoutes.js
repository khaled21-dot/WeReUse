const router = require('express').Router();
const {
  getStats,
  listVerifications,
  approve,
  reject,
  createAdmin,
  promoteStudent,
  getAdminIdCard,
} = require('../controllers/adminController');
const { protect, requireRole } = require('../middleware/auth');
const { uploadIdCard } = require('../middleware/upload');
const sanitize = require('../middleware/sanitize');

router.use(protect, requireRole('admin'));

router.get('/stats', getStats);
router.get('/verifications', listVerifications);
router.patch('/verifications/:id/approve', approve);
router.patch('/verifications/:id/reject', reject);

router.post('/students/:id/promote', promoteStudent); // any admin may make any (active) student an admin
router.post('/admins', uploadIdCard, sanitize, createAdmin); // upload runs only AFTER the admin check
router.get('/id-card/:adminId', getAdminIdCard);

module.exports = router;
