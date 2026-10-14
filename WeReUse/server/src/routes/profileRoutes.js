const router = require('express').Router();
const {
  updateProfile,
  changePassword,
  requestEmailChange,
  confirmEmailChange,
  resendEmailChange,
  cancelEmailChange,
} = require('../controllers/profileController');
const { protect, requireVerified } = require('../middleware/auth');
const { codeRequestLimiter, codeVerifyLimiter, passwordChangeLimiter } = require('../middleware/rateLimiters');

// Only verified students and admins may edit a profile (requireVerified lets admins through)
router.use(protect, requireVerified);

router.patch('/', updateProfile);
router.post('/password', passwordChangeLimiter, changePassword);
router.post('/email/request', passwordChangeLimiter, codeRequestLimiter, requestEmailChange);
router.post('/email/confirm', codeVerifyLimiter, confirmEmailChange);
router.post('/email/resend', codeRequestLimiter, resendEmailChange);
router.delete('/email', cancelEmailChange);

module.exports = router;
