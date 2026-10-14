const mongoose = require('mongoose');

const { Schema } = mongoose;

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: [
        'message',
        'offer',
        'listing_approved',
        'listing_rejected',
        'complaint_update',
        'verification_status',
      ],
      required: true,
    },
    relatedId: { type: Schema.Types.ObjectId, default: null }, // polymorphic reference
    message: { type: String, required: true, maxlength: 300 },
    isRead: { type: Boolean, default: false },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
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

notificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
