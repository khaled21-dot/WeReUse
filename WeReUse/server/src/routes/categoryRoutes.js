const router = require('express').Router();
const { listActiveCategories } = require('../controllers/categoryController');
const { protect } = require('../middleware/auth');

// Any logged-in user may read the ACTIVE categories (used by listing forms and filters later)
router.get('/', protect, listActiveCategories);

module.exports = router;
