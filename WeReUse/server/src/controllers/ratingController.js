'use strict';
/**
 * Star ratings between students: the average shown next to a student, and their latest reviews.
 * Ratings are given from a student's profile page (see userController.rateUser).
 */
const mongoose = require('mongoose');
const User = require('../models/User');
const Rating = require('../models/Rating');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

/** Recalculates a student's average and count (stored on the user for fast listing pages). */
async function refreshSellerRating(sellerId) {
  const [summary] = await Rating.aggregate([
    { $match: { seller: new mongoose.Types.ObjectId(String(sellerId)) } },
    { $group: { _id: '$seller', average: { $avg: '$stars' }, count: { $sum: 1 } } },
  ]);
  const average = summary ? Math.round(summary.average * 10) / 10 : 0;
  const count = summary ? summary.count : 0;
  await User.updateOne({ _id: sellerId }, { $set: { rating: average, ratingCount: count } });
  return { average, count };
}

/** GET /api/ratings/seller/:id   - a student's rating summary and latest reviews (any logged-in user) */
exports.sellerRatings = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('Seller not found.', 404);
  const seller = await User.findById(req.params.id).select('name rating ratingCount').lean();
  if (!seller) throw new AppError('Seller not found.', 404);

  const ratings = await Rating.find({ seller: seller._id }).sort({ updatedAt: -1 }).limit(20).populate('buyer', 'name avatar').lean();

  res.json({
    success: true,
    data: {
      summary: { average: seller.rating || 0, count: seller.ratingCount || 0 },
      ratings: ratings.map((r) => ({
        id: String(r._id),
        stars: r.stars,
        comment: r.comment || '',
        buyer: r.buyer ? { id: String(r.buyer._id), name: r.buyer.name, avatar: r.buyer.avatar || null } : { id: null, name: 'Deleted account', avatar: null },
        createdAt: r.createdAt,
      })),
    },
  });
});

exports.refreshSellerRating = refreshSellerRating;
