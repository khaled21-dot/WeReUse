const mongoose = require('mongoose');
const { MAX_RATING_COMMENT } = require('../utils/supportConstants');

const { Schema } = mongoose;

/**
 * One student's star rating of another student, given from the rated student's profile page.
 * One rating per pair, which can be changed or removed. All of them count towards the rated
 * student's average (users.rating / users.ratingCount).
 * Field names: `seller` = the student who is RATED, `buyer` = the student who rates.
 */
const ratingSchema = new Schema(
  {
    source: { type: String, enum: ['profile'], default: 'profile' },
    seller: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    buyer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    stars: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: MAX_RATING_COMMENT, default: '' },
  },
  { timestamps: true }
);

// one profile rating per (rater, rated student)
ratingSchema.index({ seller: 1, buyer: 1 }, { name: 'one_profile_rating_per_pair', unique: true, partialFilterExpression: { source: 'profile' } });
ratingSchema.index({ seller: 1, createdAt: -1 });

module.exports = mongoose.model('Rating', ratingSchema);
