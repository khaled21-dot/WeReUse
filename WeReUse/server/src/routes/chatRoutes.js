const router = require('express').Router();
const { protect, requireRole, requireVerified } = require('../middleware/auth');
const { messageLimiter, startChatLimiter } = require('../middleware/rateLimiters');
const {
  startConversation,
  listConversations,
  unreadCount,
  getConversation,
  listMessages,
  sendMessage,
  respondToOffer,
  markRead,
} = require('../controllers/chatController');

// Chat is for verified STUDENTS only (admins do not take part in conversations).
router.use(protect, requireRole('student'), requireVerified);

router.get('/', listConversations);
router.get('/unread-count', unreadCount); // must come before "/:id"
router.post('/', startChatLimiter, startConversation);

router.get('/:id', getConversation);
router.get('/:id/messages', listMessages);
router.post('/:id/messages', messageLimiter, sendMessage);
router.patch('/:id/messages/:messageId/offer', respondToOffer);
router.post('/:id/read', markRead);

module.exports = router;