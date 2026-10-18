const router = require('express').Router();
const { register, verifyEmail, resendCode, login, logout, me } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { uploadIdCard } = require('../middleware/upload');
const sanitize = require('../middleware/sanitize');
const { loginLimiter, registerLimiter, codeRequestLimiter, codeVerifyLimiter } = require('../middleware/rateLimiters');

router.post('/register', registerLimiter, codeRequestLimiter, uploadIdCard, sanitize, register); // step 1
router.post('/verify-email', codeVerifyLimiter, verifyEmail); // step 2
router.post('/resend-code', codeRequestLimiter, resendCode);
router.post('/login', loginLimiter, login);
router.post('/logout', logout);
router.get('/me', protect, me);

module.exports = router;