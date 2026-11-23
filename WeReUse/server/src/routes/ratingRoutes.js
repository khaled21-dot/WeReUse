const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { sellerRatings } = require('../controllers/ratingController');

// Any logged-in user may read a student's ratings (shown next to their items).
router.get('/seller/:id', protect, sellerRatings);

module.exports = router;
