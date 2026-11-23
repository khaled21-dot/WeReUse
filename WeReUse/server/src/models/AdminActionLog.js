const mongoose = require('mongoose');

const { Schema } = mongoose;

// Audit trail of every admin decision (NFR: auditability).
// One admin -> many log entries: adminId refers to admins._id (one-to-many).
const adminActionLogSchema = new Schema({
  // No admin for automatic decisions (automatic: true); every other action must name its admin
  adminId: {
    type: Schema.Types.ObjectId,
    ref: 'Admin',
    required() {
      return !this.automatic;
    },
  },
  automatic: { type: Boolean, default: false },
  actionType: {
    type: String,
    enum: [
      'approve_user',
      'reject_user',
      'auto_approve_user',
      'auto_reject_user',
      'approve_listing',
      'reject_listing',
      'resolve_complaint',
      'warn_suspend_ban_user',
      'create_admin',
      'promote_to_admin',
      'suspend_user',
      'ban_user',
      'restore_user',
      'handle_report',
    ],
    required: true,
  },
  targetType: { type: String, enum: ['user', 'listing', 'complaint', 'admin', 'report'], required: true },
  targetId: { type: Schema.Types.ObjectId, required: true },
  details: { type: String, default: '', maxlength: 500 }, // e.g. the rejection reason
  timestamp: { type: Date, default: Date.now },
});

adminActionLogSchema.index({ adminId: 1, timestamp: -1 });

module.exports = mongoose.model('AdminActionLog', adminActionLogSchema);