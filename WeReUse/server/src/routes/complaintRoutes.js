const router = require('express').Router();
const { protect, requireRole } = require('../middleware/auth');
const { complaintLimiter } = require('../middleware/rateLimiters');
const { createComplaint, myComplaints } = require('../controllers/complaintController');

// Every student may complain - also one still waiting for verification (e.g. about a system problem).
router.use(protect, requireRole('student'));

router.get('/mine', myComplaints);
router.post('/', complaintLimiter, createComplaint);

module.exports = router;
