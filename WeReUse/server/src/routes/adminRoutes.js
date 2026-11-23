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
const {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} = require('../controllers/categoryController');
const { adminListComplaints, adminUpdateComplaint } = require('../controllers/complaintController');
const { adminListReports, adminUpdateReport, adminModerateUser } = require('../controllers/userController');
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

// Category management (CRUD)
router.get('/categories', listCategories);
router.post('/categories', createCategory);
router.patch('/categories/:id', updateCategory);
router.delete('/categories/:id', deleteCategory);

// Complaint box
router.get('/complaints', adminListComplaints);
router.patch('/complaints/:id', adminUpdateComplaint);

// Report box (students reporting students) and blocking / removing accounts
router.get('/reports', adminListReports);
router.patch('/reports/:id', adminUpdateReport);
router.post('/users/:id/moderate', adminModerateUser);

module.exports = router;