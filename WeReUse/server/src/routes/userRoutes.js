const router = require('express').Router();
const { protect, requireRole, requireVerified } = require('../middleware/auth');
const { reportLimiter, ratingLimiter } = require('../middleware/rateLimiters');
const { getProfile, rateUser, removeRating, reportUser, myReports } = require('../controllers/userController');

router.use(protect);

router.get('/reports/mine', requireRole('student'), myReports); // before "/:id"
router.get('/:id', getProfile); // any logged-in user (students and admins)

// Rating: verified students. Reporting: every student (also one still waiting for verification).
router.put('/:id/rating', requireRole('student'), requireVerified, ratingLimiter, rateUser);
router.delete('/:id/rating', requireRole('student'), requireVerified, removeRating);
router.post('/:id/report', requireRole('student'), reportLimiter, reportUser);

module.exports = router;
