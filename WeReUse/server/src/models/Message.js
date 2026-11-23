const mongoose = require('mongoose');
const { MAX_MESSAGE_LENGTH, MAX_EXCHANGE_ITEM_LENGTH, MESSAGE_TYPES, OFFER_KINDS, OFFER_STATUSES } = require('../utils/chatConstants');
const { MAX_PRICE } = require('../utils/listingConstants');

const { Schema } = mongoose;

const messageSchema = new Schema(
  {
    conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', default: null }, // null = system message
    type: { type: String, enum: MESSAGE_TYPES, default: 'text' },
    text: { type: String, trim: true, maxlength: MAX_MESSAGE_LENGTH, default: '' },

    // Only for type "offer": a price offer (taka) for an item on sale, or an exchange offer (what they would give)
    offer: {
      type: new Schema(
        {
          kind: { type: String, enum: OFFER_KINDS, required: true },
          amount: { type: Number, min: 1, max: MAX_PRICE },
          item: { type: String, trim: true, maxlength: MAX_EXCHANGE_ITEM_LENGTH, default: '' },
          status: { type: String, enum: OFFER_STATUSES, default: 'pending' },
          respondedAt: { type: Date, default: null },
          respondedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        },
        { _id: false }
      ),
      default: undefined,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// the thread, oldest to newest, loaded in pages
messageSchema.index({ conversation: 1, _id: -1 });
// "is there a pending offer in this conversation?"
messageSchema.index({ conversation: 1, type: 1, 'offer.status': 1 });

module.exports = mongoose.model('Message', messageSchema);