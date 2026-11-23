'use strict';
/**
 * The complaint box: students report a scam or a system problem, admins answer.
 */
const mongoose = require('mongoose');
const Complaint = require('../models/Complaint');
const AdminActionLog = require('../models/AdminActionLog');
const Notification = require('../models/Notification');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { emitToUser } = require('../utils/realtime');
const { COMPLAINT_STATUSES } = require('../utils/supportConstants');
const { parse, createComplaintSchema, complaintListSchema, complaintUpdateSchema } = require('../utils/validators');

const STATUS_WORDS = { open: 'open', in_review: 'being reviewed', resolved: 'resolved', dismissed: 'closed without action' };

async function notify(userId, type, relatedId, message) {
  try {
    await Notification.create({ userId, type, relatedId, message: String(message).slice(0, 300) });
    emitToUser(userId, 'notification:new', {});
  } catch (err) {
    console.error('Could not create the notification:', err.message);
  }
}

function presentComplaint(c, { forAdmin = false } = {}) {
  const user = c.user && c.user._id ? c.user : null;
  return {
    id: String(c._id),
    category: c.category,
    subject: c.subject,
    description: c.description,
    status: c.status,
    adminResponse: c.adminResponse || '',
    handledAt: c.handledAt || null,
    ...(forAdmin
      ? {
          user: user
            ? { id: String(user._id), name: user.name, email: user.email, universityRegNumber: user.universityRegNumber, status: user.status }
            : null,
        }
      : {}),
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

// ---------- students ----------

/** POST /api/complaints   { category, subject, description } */
exports.createComplaint = asyncHandler(async (req, res) => {
  const { category, subject, description } = parse(createComplaintSchema, req.body);

  const created = await Complaint.create({ user: req.user._id, category, subject, description });
  const complaint = await Complaint.findById(created._id).lean();
  res.status(201).json({
    success: true,
    message: 'Your complaint was sent to the admins. You will get a notification when they respond.',
    data: { complaint: presentComplaint(complaint) },
  });
});

/** GET /api/complaints/mine */
exports.myComplaints = asyncHandler(async (req, res) => {
  const complaints = await Complaint.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ success: true, data: { complaints: complaints.map((c) => presentComplaint(c)) } });
});

// ---------- admins: complaints ----------

/** GET /api/admin/complaints?status=&page=&limit= */
exports.adminListComplaints = asyncHandler(async (req, res) => {
  const { status, page, limit } = parse(complaintListSchema, req.query);
  const filter = status === 'all' ? {} : { status };

  const [total, complaints, grouped] = await Promise.all([
    Complaint.countDocuments(filter),
    Complaint.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'name email universityRegNumber status')
      .lean(),
    Complaint.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);

  const counts = Object.fromEntries(COMPLAINT_STATUSES.map((s) => [s, 0]));
  grouped.forEach((g) => {
    counts[g._id] = g.n;
  });
  counts.all = Object.values(counts).reduce((a, b) => a + b, 0);

  res.json({
    success: true,
    data: {
      complaints: complaints.map((c) => presentComplaint(c, { forAdmin: true })),
      counts,
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    },
  });
});

/** PATCH /api/admin/complaints/:id   { status, adminResponse? } */
exports.adminUpdateComplaint = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('Complaint not found.', 404);
  const { status, adminResponse } = parse(complaintUpdateSchema, req.body);

  const complaint = await Complaint.findById(req.params.id);
  if (!complaint) throw new AppError('Complaint not found.', 404);

  complaint.status = status;
  if (adminResponse) complaint.adminResponse = adminResponse;
  complaint.handledBy = req.user._id;
  complaint.handledAt = new Date();
  await complaint.save();

  await AdminActionLog.create({
    adminId: req.user._id,
    actionType: 'resolve_complaint',
    targetType: 'complaint',
    targetId: complaint._id,
    details: `Status: ${status}${adminResponse ? ` - ${adminResponse}` : ''}`.slice(0, 500),
  });
  await notify(
    complaint.user,
    'complaint_update',
    complaint._id,
    `Your complaint "${complaint.subject}" is now ${STATUS_WORDS[status]}.${adminResponse ? ` Admin: ${adminResponse}` : ''}`
  );

  const full = await Complaint.findById(complaint._id).populate('user', 'name email universityRegNumber status').lean();
  res.json({ success: true, message: 'Complaint updated.', data: { complaint: presentComplaint(full, { forAdmin: true }) } });
});
