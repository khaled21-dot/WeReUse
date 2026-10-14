const mongoose = require('mongoose');

const { Schema } = mongoose;

// Audit trail of every admin decision (NFR: auditability).
// One admin -> many log entries: adminId refers to admins._id (one-to-many).
const adminActionLogSchema = new Schema({
  adminId: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
  actionType: {
    type: String,
    enum: [
      'approve_user',
      'reject_user',
      'approve_listing',
      'reject_listing',
      'resolve_complaint',
      'warn_suspend_ban_user',
      'create_admin',
      'promote_to_admin',
      
    ],
    required: true,
  },
  targetType: { type: String, enum: ['user', 'listing', 'complaint', 'admin'], required: true },
  targetId: { type: Schema.Types.ObjectId, required: true },
  details: { type: String, default: '', maxlength: 500 }, // e.g. the rejection reason
  timestamp: { type: Date, default: Date.now },
});

adminActionLogSchema.index({ adminId: 1, timestamp: -1 });

module.exports = mongoose.model('AdminActionLog', adminActionLogSchema);
