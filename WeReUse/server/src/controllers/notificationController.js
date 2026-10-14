const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

/** GET /api/notifications - latest 20 + unread count */
exports.list = asyncHandler(async (req, res) => {
  const [notifications, unreadCount] = await Promise.all([
    Notification.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(20),
    Notification.countDocuments({ userId: req.user._id, isRead: false }),
  ]);
  res.json({ success: true, data: { notifications, unreadCount } });
});

/** PATCH /api/notifications/read-all */
exports.markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ userId: req.user._id, isRead: false }, { $set: { isRead: true } });
  res.json({ success: true, message: 'All notifications marked as read.' });
});

/** PATCH /api/notifications/:id/read */
exports.markRead = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('Notification not found.', 404);
  // userId in the filter makes sure users can only touch their own notifications
  const doc = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { $set: { isRead: true } },
    { new: true }
  );
  if (!doc) throw new AppError('Notification not found.', 404);
  res.json({ success: true, data: { notification: doc } });
});
