const mongoose = require('mongoose');
const { COMPLAINT_CATEGORIES, COMPLAINT_STATUSES } = require('../utils/supportConstants');

const { Schema } = mongoose;

// The complaint box: a student reports a scam or a system problem straight to the admins.
const complaintSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, enum: COMPLAINT_CATEGORIES, required: true },
    subject: { type: String, required: true, trim: true, minlength: 5, maxlength: 120 },
    description: { type: String, required: true, trim: true, minlength: 20, maxlength: 3000 },

    status: { type: String, enum: COMPLAINT_STATUSES, default: 'open' },
    adminResponse: { type: String, trim: true, maxlength: 1000, default: '' },
    handledBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
    handledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

complaintSchema.index({ status: 1, createdAt: -1 });
complaintSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Complaint', complaintSchema);
