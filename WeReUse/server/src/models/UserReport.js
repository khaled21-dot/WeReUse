const mongoose = require('mongoose');
const { REPORT_REASONS, REPORT_STATUSES } = require('../utils/supportConstants');

const { Schema } = mongoose;

// A student reports another student. Arrives in the admins' report box (/admin/reports).
const userReportSchema = new Schema(
  {
    reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reported: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    details: { type: String, required: true, trim: true, minlength: 10, maxlength: 2000 },

    status: { type: String, enum: REPORT_STATUSES, default: 'open' },
    adminNote: { type: String, trim: true, maxlength: 1000, default: '' }, // shown to the reporter
    handledBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
    handledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userReportSchema.index({ status: 1, createdAt: -1 });
userReportSchema.index({ reported: 1, createdAt: -1 });
userReportSchema.index({ reporter: 1, reported: 1, status: 1 });

module.exports = mongoose.model('UserReport', userReportSchema);
