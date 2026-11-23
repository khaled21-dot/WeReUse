const mongoose = require('mongoose');

const { Schema } = mongoose;

// One conversation per (item, buyer): the buyer asks about an item, and the item's seller answers.
const conversationSchema = new Schema(
  {
    listing: { type: Schema.Types.ObjectId, ref: 'Listing', required: true },
    seller: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    buyer: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    // A copy of the basics, so the inbox still makes sense if the seller later deletes the item
    listingSnapshot: {
      title: { type: String, default: '' },
      image: { type: String, default: '' },
      listingType: { type: String, default: 'sell' },
    },

    // Shown in the inbox. senderId is null for system messages ("Aisha accepted the offer").
    lastMessage: {
      text: { type: String, default: '' },
      type: { type: String, default: 'text' },
      senderId: { type: Schema.Types.ObjectId, default: null },
      createdAt: { type: Date, default: null },
    },
    lastMessageAt: { type: Date, default: Date.now },
    // false until someone writes: an empty chat the buyer opened does not clutter the seller's inbox
    hasMessages: { type: Boolean, default: false },

    // Unread messages for each side, and when each side last opened the chat ("Seen")
    unread: {
      buyer: { type: Number, default: 0, min: 0 },
      seller: { type: Number, default: 0, min: 0 },
    },
    readAt: {
      buyer: { type: Date, default: null },
      seller: { type: Date, default: null },
    },

    // The accepted offer, once a deal is agreed (no new offers after that)
    agreedOffer: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform(doc, ret) {
        delete ret._id;
        return ret;
      },
    },
  }
);

// asking twice about the same item reopens the same conversation
conversationSchema.index({ listing: 1, buyer: 1 }, { unique: true });
conversationSchema.index({ buyer: 1, lastMessageAt: -1 });
conversationSchema.index({ seller: 1, lastMessageAt: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);