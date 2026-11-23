const mongoose = require('mongoose');
const Listing = require('../models/Listing');
const Category = require('../models/Category');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const {
  parse,
  createListingSchema,
  listListingsSchema,
  mineListingsSchema,
  listingStatusSchema,
  keepImagesSchema,
} = require('../utils/validators');
const { saveListingImage, deleteListingImages, LISTING_DIR } = require('../utils/fileStore');
const { detectImageType } = require('../utils/imageType');
const { MAX_LISTING_IMAGES } = require('../utils/listingConstants');

// Only what other students may see about a seller - never an email address or phone number.
const SELLER_FIELDS = 'name department batch createdAt verificationStatus status avatar rating ratingCount';
const CATEGORY_FIELDS = 'name isActive';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const tidy = (s) => s.replace(/\s+/g, ' ').trim();

const notFound = () => new AppError('Item not found.', 404);
const assertId = (id) => {
  if (!mongoose.isValidObjectId(id)) throw notFound();
};

/** Turns a (populated, lean) listing into the JSON the client receives. */
function present(l, viewer) {
  const seller = l.seller && l.seller._id ? l.seller : null;
  const sellerId = String(seller ? seller._id : l.seller);
  const category = l.category && l.category._id ? l.category : null;
  return {
    id: String(l._id),
    title: l.title,
    description: l.description,
    listingType: l.listingType,
    price: l.price ?? null,
    exchangeFor: l.exchangeFor || '',
    condition: l.condition,
    usedFor: l.usedFor ? { value: l.usedFor.value, unit: l.usedFor.unit } : null,
    images: [...l.images],
    status: l.status,
    category: category ? { id: String(category._id), name: category.name, isActive: category.isActive } : null,
    seller: seller
      ? {
          id: sellerId,
          name: seller.name,
          avatar: seller.avatar || null,
          department: seller.department || '',
          batch: seller.batch || '',
          memberSince: seller.createdAt,
          isVerified: seller.verificationStatus === 'verified',
          rating: seller.rating || 0,
          ratingCount: seller.ratingCount || 0,
        }
      : null,
    isMine: viewer.role === 'student' && sellerId === String(viewer._id),
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}

const withRelations = (query) => query.populate('seller', SELLER_FIELDS).populate('category', CATEGORY_FIELDS);

/** GET /api/listings?search=&category=&condition=good,fair&type=&minPrice=&maxPrice=&sort=&page=&limit= */
exports.listListings = asyncHandler(async (req, res) => {
  const q = parse(listListingsSchema, req.query);

  const filter = { status: 'available' };

  // Only categories the admin has left ACTIVE. Items of a disabled category are hidden.
  const activeIds = await Category.find({ isActive: true }).distinct('_id');
  if (q.category) {
    const isActive = activeIds.some((id) => String(id) === q.category);
    filter.category = isActive ? new mongoose.Types.ObjectId(q.category) : { $in: [] };
  } else {
    filter.category = { $in: activeIds };
  }

  // Items of suspended students are hidden too
  const blockedSellers = await User.find({ status: { $ne: 'active' } }).distinct('_id');
  if (blockedSellers.length) filter.seller = { $nin: blockedSellers };

  if (q.search) {
    const rx = new RegExp(escapeRegex(tidy(q.search)), 'i');
    filter.$or = [{ title: rx }, { description: rx }];
  }
  if (q.condition && q.condition.length) filter.condition = { $in: q.condition };
  if (q.type) filter.listingType = q.type;
  if (q.minPrice !== undefined || q.maxPrice !== undefined) {
    // a price range only matches items that HAVE a price (exchange / donate items have none)
    filter.price = {};
    if (q.minPrice !== undefined) filter.price.$gte = q.minPrice;
    if (q.maxPrice !== undefined) filter.price.$lte = q.maxPrice;
  }

  const sort =
    q.sort === 'price_asc'
      ? { price: 1, createdAt: -1, _id: -1 }
      : q.sort === 'price_desc'
        ? { price: -1, createdAt: -1, _id: -1 }
        : { createdAt: -1, _id: -1 };

  const [total, listings] = await Promise.all([
    Listing.countDocuments(filter),
    withRelations(Listing.find(filter).sort(sort).skip((q.page - 1) * q.limit).limit(q.limit)).lean(),
  ]);

  res.json({
    success: true,
    data: {
      listings: listings.map((l) => present(l, req.user)),
      pagination: { page: q.page, limit: q.limit, total, pages: Math.max(1, Math.ceil(total / q.limit)) },
    },
  });
});

/** GET /api/listings/mine?status=all|available|closed - the logged-in student's own items */
exports.myListings = asyncHandler(async (req, res) => {
  const { status } = parse(mineListingsSchema, req.query);
  const filter = { seller: req.user._id };
  if (status !== 'all') filter.status = status;

  const listings = await withRelations(Listing.find(filter).sort({ createdAt: -1, _id: -1 }).limit(200)).lean();
  res.json({ success: true, data: { listings: listings.map((l) => present(l, req.user)) } });
});

/** GET /api/listings/:id */
exports.getListing = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const listing = await withRelations(Listing.findById(req.params.id)).lean();
  if (!listing) throw notFound();

  const view = present(listing, req.user);
  const hiddenFromPublic =
    listing.status !== 'available' || !view.category?.isActive || (listing.seller && listing.seller.status !== 'active');
  // The owner always sees their own item; admins can look at anything (moderation).
  if (hiddenFromPublic && !view.isMine && req.user.role !== 'admin') throw notFound();

  res.json({ success: true, data: { listing: view } });
});

const imageProblem = (files) => {
  if (files.length === 0) return 'Add at least one photo of the item.';
  if (files.length > MAX_LISTING_IMAGES) return `You can add up to ${MAX_LISTING_IMAGES} photos.`;
  if (files.some((f) => !detectImageType(f.buffer))) return 'One of the files is not a valid JPG or PNG image.';
  return '';
};

/** POST /api/listings   (multipart/form-data; verified students only - see the route) */
exports.createListing = asyncHandler(async (req, res) => {
  const files = req.files || [];

  // Collect the text-field errors AND the photo error, so the form can show everything at once.
  let data;
  let fieldErrors = {};
  try {
    data = parse(createListingSchema, req.body);
  } catch (err) {
    if (!err.fieldErrors) throw err;
    fieldErrors = { ...err.fieldErrors };
  }
  const photoError = imageProblem(files);
  if (photoError) fieldErrors.images = photoError;
  if (Object.keys(fieldErrors).length) {
    throw new AppError('Please fix the highlighted fields.', 400, { code: 'VALIDATION_ERROR', errors: fieldErrors });
  }

  const category = await Category.findById(data.category);
  if (!category || !category.isActive) {
    const message = 'Please choose an active category.';
    throw new AppError(message, 400, { code: 'VALIDATION_ERROR', errors: { category: message } });
  }

  // Files are written to disk only AFTER every check has passed, and removed again if saving fails.
  const saved = [];
  let created;
  try {
    for (const file of files) saved.push(await saveListingImage(file.buffer, detectImageType(file.buffer)));
    created = await Listing.create({ ...data, seller: req.user._id, images: saved });
  } catch (err) {
    await deleteListingImages(saved);
    throw err;
  }

  const listing = await withRelations(Listing.findById(created._id)).lean();
  res.status(201).json({ success: true, message: 'Your item is now listed.', data: { listing: present(listing, req.user) } });
});

/**
 * PATCH /api/listings/:id   (multipart, owner only) - edit an item.
 * The same text fields as posting, plus keepImages (JSON list of the current photo names to keep)
 * and up to 5 new photos in "images". Kept + new photos must be 1 to 5.
 */
exports.updateListing = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const files = req.files || [];
  const listing = await Listing.findOne({ _id: req.params.id, seller: req.user._id });
  if (!listing) throw notFound();

  let data;
  let keep = [];
  let fieldErrors = {};
  try {
    data = parse(createListingSchema, req.body);
  } catch (err) {
    if (!err.fieldErrors) throw err;
    fieldErrors = { ...err.fieldErrors };
  }
  try {
    keep = parse(keepImagesSchema, req.body.keepImages);
  } catch (err) {
    if (!err.fieldErrors) throw err;
    fieldErrors.images = 'Invalid photo list';
  }
  // only photos that really belong to this item can be kept (no borrowing other items' files)
  keep = [...new Set(keep)].filter((name) => listing.images.includes(name));
  const total = keep.length + files.length;
  if (!fieldErrors.images) {
    if (total === 0) fieldErrors.images = 'Keep or add at least one photo of the item.';
    else if (total > MAX_LISTING_IMAGES) fieldErrors.images = `You can have up to ${MAX_LISTING_IMAGES} photos.`;
    else if (files.some((f) => !detectImageType(f.buffer))) fieldErrors.images = 'One of the files is not a valid JPG or PNG image.';
  }
  if (Object.keys(fieldErrors).length) {
    throw new AppError('Please fix the highlighted fields.', 400, { code: 'VALIDATION_ERROR', errors: fieldErrors });
  }

  if (String(data.category) !== String(listing.category)) {
    const category = await Category.findById(data.category);
    if (!category || !category.isActive) {
      const message = 'Please choose an active category.';
      throw new AppError(message, 400, { code: 'VALIDATION_ERROR', errors: { category: message } });
    }
  }

  const saved = [];
  try {
    for (const file of files) saved.push(await saveListingImage(file.buffer, detectImageType(file.buffer)));
    // still the owner's (filter)
    const updated = await Listing.findOneAndUpdate(
      { _id: listing._id, seller: req.user._id },
      { $set: { ...data, images: [...keep, ...saved] } },
      { new: true, runValidators: true }
    );
    if (!updated) throw notFound();
  } catch (err) {
    await deleteListingImages(saved);
    throw err;
  }

  // photos that were removed are deleted from the disk
  await deleteListingImages(listing.images.filter((name) => !keep.includes(name)));
  // keep the chats' copy of the basics up to date
  const cover = keep[0] || saved[0] || '';
  await Conversation.updateMany(
    { listing: listing._id },
    { $set: { 'listingSnapshot.title': data.title, 'listingSnapshot.image': cover, 'listingSnapshot.listingType': data.listingType } }
  );

  const full = await withRelations(Listing.findById(listing._id)).lean();
  res.json({ success: true, message: 'Your item was updated.', data: { listing: present(full, req.user) } });
});

/** PATCH /api/listings/:id/status   { status: "available" | "closed" }  (owner only) */
exports.updateListingStatus = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const { status } = parse(listingStatusSchema, req.body);

  const listing = await withRelations(
    Listing.findOneAndUpdate({ _id: req.params.id, seller: req.user._id }, { $set: { status } }, { new: true })
  ).lean();
  if (!listing) throw notFound();

  res.json({
    success: true,
    message: status === 'closed' ? 'Marked as no longer available.' : 'Your item is available again.',
    data: { listing: present(listing, req.user) },
  });
});

/** DELETE /api/listings/:id   (owner only) */
exports.deleteListing = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const listing = await Listing.findOneAndDelete({ _id: req.params.id, seller: req.user._id });
  if (!listing) throw notFound();

  await deleteListingImages(listing.images);
  res.json({ success: true, message: 'Your item was deleted.' });
});

/** GET /api/listings/images/:filename - a product photo (any logged-in user) */
const IMAGE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$/;

exports.sendImage = (req, res, next) => {
  const { filename } = req.params;
  if (!IMAGE_NAME.test(filename)) return next(new AppError('Photo not found.', 404));

  return res.sendFile(
    filename,
    {
      root: LISTING_DIR,
      cacheControl: false,
      etag: false,
      lastModified: false,
      headers: {
        'Content-Type': filename.endsWith('.png') ? 'image/png' : 'image/jpeg',
        // The name is random and never reused, so the browser may keep it for a while. "private":
        // shared caches must not store it, because the photo is for logged-in students only.
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline',
      },
    },
    (err) => {
      if (err && !res.headersSent) next(new AppError('Photo not found.', 404));
    }
  );
};

// Used by the public profile page (a student's items)
exports.presentListing = present;
exports.listingWithRelations = withRelations;
