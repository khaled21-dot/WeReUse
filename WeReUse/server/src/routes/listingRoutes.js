const router = require('express').Router();
const { protect, requireRole, requireVerified } = require('../middleware/auth');
const { uploadListingImages } = require('../middleware/upload');
const sanitize = require('../middleware/sanitize');
const { listingCreateLimiter } = require('../middleware/rateLimiters');
const {
listListings,
myListings,
getListing,
createListing,
updateListingStatus,
updateListing,
deleteListing,
sendImage,
} = require('../controllers/listingController');

// Everything here needs a login.
router.use(protect);

// Browse + search + filter: any logged-in user
router.get('/', listListings);

// These fixed paths must come BEFORE "/:id", or "mine" would be read as an item id.
router.get('/mine', requireRole('student'), myListings);
router.get('/images/:filename', sendImage);

// Post an item: verified STUDENTS only. The check runs before the upload, so an unverified
// student's files are never even read.
router.post('/', requireRole('student'), requireVerified, listingCreateLimiter, uploadListingImages, sanitize, createListing);

router.get('/:id', getListing);
router.patch('/:id/status', requireRole('student'), updateListingStatus);
// Edit an item (multipart: text fields + keepImages + new photos). Upload only after the role checks.
router.patch('/:id', requireRole('student'), requireVerified, uploadListingImages, sanitize, updateListing);
router.delete('/:id', requireRole('student'), deleteListing);

module.exports = router;