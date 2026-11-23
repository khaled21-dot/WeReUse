const mongoose = require('mongoose');
const {
  LISTING_TYPES,
  CONDITIONS,
  USED_UNITS,
  LISTING_STATUSES,
  MAX_LISTING_IMAGES,
  MAX_PRICE,
} = require('../utils/listingConstants');

const { Schema } = mongoose;

// NOTE: the model is called "Listing" and holds the category's _id in "category". The category
// controller looks for exactly this to stop an admin deleting a category that is still in use.
const listingSchema = new Schema(
  {
    seller: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: [true, 'Title is required'], trim: true, minlength: 3, maxlength: 100 },
    description: { type: String, required: [true, 'Description is required'], trim: true, minlength: 10, maxlength: 2000 },
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    listingType: { type: String, enum: LISTING_TYPES, required: true },

    // sell -> price in taka. exchange / donate -> null
    price: { type: Number, min: 1, max: MAX_PRICE, default: null },
    // exchange -> what the seller would like in return (optional)
    exchangeFor: { type: String, trim: true, maxlength: 200, default: '' },

    condition: { type: String, enum: CONDITIONS, required: true },
    // How long the item has been used, e.g. { value: 6, unit: 'months' }. null for brand-new items.
    usedFor: {
      type: new Schema({ value: { type: Number, min: 1, max: 99 }, unit: { type: String, enum: USED_UNITS } }, { _id: false }),
      default: null,
    },

    // Random file names inside server/storage/listings (never the original names)
    images: {
      type: [String],
      validate: [
        { validator: (v) => v.length >= 1, message: 'Add at least one photo' },
        { validator: (v) => v.length <= MAX_LISTING_IMAGES, message: `You can add up to ${MAX_LISTING_IMAGES} photos` },
      ],
    },

    status: { type: String, enum: LISTING_STATUSES, default: 'available', index: true },
  },
  { timestamps: true }
);

// the browse page: newest first, only available items
listingSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Listing', listingSchema);