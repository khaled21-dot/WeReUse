const router = require('express').Router();
const {
  updateProfile,
  changePassword,
  requestEmailChange,
  confirmEmailChange,
  resendEmailChange,
  cancelEmailChange,
  uploadAvatar,
  removeAvatar,
  sendAvatar,
} = require('../controllers/profileController');
const { protect, requireVerified } = require('../middleware/auth');
const { uploadAvatar: readAvatarFile } = require('../middleware/upload');
const { codeRequestLimiter, codeVerifyLimiter, passwordChangeLimiter } = require('../middleware/rateLimiters');

// Profile photo: every logged-in account (also students still waiting for verification)
router.get('/avatars/:filename', protect, sendAvatar);
router.post('/avatar', protect, readAvatarFile, uploadAvatar);
router.delete('/avatar', protect, removeAvatar);

// Everything else: only verified students and admins may edit a profile (requireVerified lets admins through)
router.use(protect, requireVerified);

router.patch('/', updateProfile);
router.post('/password', passwordChangeLimiter, changePassword);
router.post('/email/request', passwordChangeLimiter, codeRequestLimiter, requestEmailChange);
router.post('/email/confirm', codeVerifyLimiter, confirmEmailChange);
router.post('/email/resend', codeRequestLimiter, resendEmailChange);
router.delete('/email', cancelEmailChange);

module.exports = router;
