'use strict';
/**
 * Public student profiles, rating a student from their profile, reporting a student,
 * and the admin side: the report box and blocking / removing accounts.
 */
const mongoose = require('mongoose');
const User = require('../models/User');
const Listing = require('../models/Listing');
const Category = require('../models/Category');
const Rating = require('../models/Rating');
const UserReport = require('../models/UserReport');
const AdminActionLog = require('../models/AdminActionLog');
const Notification = require('../models/Notification');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { emitToUser, disconnectUser } = require('../utils/realtime');
const { refreshSuspension } = require('../utils/moderation');
const { REPORT_STATUSES } = require('../utils/supportConstants');
const {
  parse,
  ratingSchema,
  reportUserSchema,
  reportListSchema,
  reportUpdateSchema,
  moderateUserSchema,
} = require('../utils/validators');
const { refreshSellerRating } = require('./ratingController');
const { presentListing, listingWithRelations } = require('./listingController');

const notFound = () => new AppError('This profile is not available.', 404, { code: 'NOT_FOUND' });
const sameId = (a, b) => String(a) === String(b);
const REPORT_STATUS_WORDS = { open: 'open', reviewing: 'being reviewed', action_taken: 'handled - action was taken', dismissed: 'closed without action' };

async function notify(userId, type, relatedId, message) {
  try {
    await Notification.create({ userId, type, relatedId, message: String(message).slice(0, 300) });
    emitToUser(userId, 'notification:new', {});
  } catch (err) {
    console.error('Could not create the notification:', err.message);
  }
}

async function loadStudent(id) {
  if (!mongoose.isValidObjectId(id)) throw notFound();
  const user = await User.findById(id);
  if (!user) throw notFound();
  await refreshSuspension(user);
  return user;
}

const presentReview = (r) => ({
  id: String(r._id),
  stars: r.stars,
  comment: r.comment || '',
  source: r.source || 'profile',
  rater: r.buyer && r.buyer._id ? { id: String(r.buyer._id), name: r.buyer.name, avatar: r.buyer.avatar || null } : { id: null, name: 'Deleted account', avatar: null },
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

const moderationView = (u) => ({
  status: u.status,
  suspendedUntil: u.suspendedUntil || null,
  moderationReason: u.moderationReason || '',
});

// ---------- profiles ----------

/** GET /api/users/:id   - a student's public profile (any logged-in user; admins also see blocked accounts) */
exports.getProfile = asyncHandler(async (req, res) => {
  const target = await loadStudent(req.params.id);
  const viewer = req.user;
  const isAdmin = viewer.role === 'admin';
  const isMe = !isAdmin && sameId(viewer._id, target._id);
  // Blocked and removed accounts are hidden from other students
  if (target.status !== 'active' && !isAdmin && !isMe) throw notFound();

  const activeCategories = await Category.find({ isActive: true }).distinct('_id');
  const [listings, reviews, myRating, openReport, reportCount] = await Promise.all([
    listingWithRelations(
      Listing.find({ seller: target._id, status: 'available', category: { $in: activeCategories } }).sort({ createdAt: -1 }).limit(12)
    ).lean(),
    Rating.find({ seller: target._id }).sort({ updatedAt: -1 }).limit(20).populate('buyer', 'name avatar').lean(),
    isAdmin || isMe ? null : Rating.findOne({ seller: target._id, buyer: viewer._id, source: 'profile' }).lean(),
    isAdmin || isMe ? null : UserReport.exists({ reporter: viewer._id, reported: target._id, status: { $in: ['open', 'reviewing'] } }),
    isAdmin ? UserReport.countDocuments({ reported: target._id }) : null,
  ]);

  const canAct = !isAdmin && !isMe && viewer.verificationStatus === 'verified';
  res.json({
    success: true,
    data: {
      profile: {
        id: String(target._id),
        name: target.name,
        avatar: target.avatar || null,
        department: target.department || '',
        batch: target.batch || '',
        studentId: target.universityRegNumber, // the university ID number, shown on every profile
        memberSince: target.createdAt,
        isVerified: target.verificationStatus === 'verified',
        rating: target.rating || 0,
        ratingCount: target.ratingCount || 0,
        stats: { activeListings: listings.length },
        isMe,
        ...(isAdmin || isMe ? moderationView(target) : {}),
        ...(isAdmin
          ? {
              email: target.email,
              universityRegNumber: target.universityRegNumber,
              verificationStatus: target.verificationStatus,
              reportCount,
            }
          : {}),
      },
      listings: listings.map((l) => presentListing(l, viewer)),
      reviews: reviews.map(presentReview),
      viewer: {
        canRate: canAct,
        canReport: !isAdmin && !isMe, // any student may report (also while waiting for verification)
        myRating: myRating ? { stars: myRating.stars, comment: myRating.comment || '' } : null,
        hasOpenReport: Boolean(openReport),
      },
    },
  });
});

/** PUT /api/users/:id/rating   { stars, comment? }   - rate a student from their profile (one rating, can be changed) */
exports.rateUser = asyncHandler(async (req, res) => {
  const { stars, comment } = parse(ratingSchema, req.body);
  const target = await loadStudent(req.params.id);
  if (sameId(target._id, req.user._id)) throw new AppError('You cannot rate yourself.', 400, { code: 'SELF_RATING' });
  if (target.status !== 'active') throw notFound();

  const existing = await Rating.findOne({ seller: target._id, buyer: req.user._id, source: 'profile' }).select('_id').lean();
  await Rating.findOneAndUpdate(
    { seller: target._id, buyer: req.user._id, source: 'profile' },
    { $set: { stars, comment } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const summary = await refreshSellerRating(target._id);

  await notify(
    target._id,
    'rating',
    req.user._id,
    `${req.user.name} ${existing ? 'updated their rating of you to' : 'rated you'} ${stars} star${stars === 1 ? '' : 's'}.`
  );
  res.status(existing ? 200 : 201).json({
    success: true,
    message: existing ? 'Your rating was updated.' : 'Thanks for your rating!',
    data: { rating: { stars, comment }, summary },
  });
});

/** DELETE /api/users/:id/rating   - take back my profile rating */
exports.removeRating = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound();
  const removed = await Rating.findOneAndDelete({ seller: req.params.id, buyer: req.user._id, source: 'profile' });
  if (!removed) throw new AppError('You have not rated this student.', 404);
  const summary = await refreshSellerRating(req.params.id);
  res.json({ success: true, message: 'Your rating was removed.', data: { summary } });
});

// ---------- reports ----------

/** POST /api/users/:id/report   { reason, details }   - goes to the admins' report box */
exports.reportUser = asyncHandler(async (req, res) => {
  const { reason, details } = parse(reportUserSchema, req.body);
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound();
  const target = await User.findById(req.params.id).select('_id name status').lean();
  if (!target || target.status === 'banned') throw notFound();
  if (sameId(target._id, req.user._id)) throw new AppError('You cannot report yourself.', 400, { code: 'SELF_REPORT' });

  const waiting = await UserReport.exists({ reporter: req.user._id, reported: target._id, status: { $in: ['open', 'reviewing'] } });
  if (waiting) {
    throw new AppError('You already reported this student. The admins are looking into it.', 409, { code: 'ALREADY_REPORTED' });
  }

  const report = await UserReport.create({ reporter: req.user._id, reported: target._id, reason, details });
  res.status(201).json({
    success: true,
    message: 'Thank you. Your report was sent to the admins - only they can see it.',
    data: { report: { id: String(report._id), reason, details, status: report.status, createdAt: report.createdAt } },
  });
});

/** GET /api/users/reports/mine   - reports I sent, with the admins' answers */
exports.myReports = asyncHandler(async (req, res) => {
  const reports = await UserReport.find({ reporter: req.user._id }).sort({ createdAt: -1 }).limit(100).populate('reported', 'name avatar').lean();
  res.json({
    success: true,
    data: {
      reports: reports.map((r) => ({
        id: String(r._id),
        reported: r.reported ? { id: String(r.reported._id), name: r.reported.name, avatar: r.reported.avatar || null } : null,
        reason: r.reason,
        details: r.details,
        status: r.status,
        adminNote: r.adminNote || '',
        createdAt: r.createdAt,
        handledAt: r.handledAt || null,
      })),
    },
  });
});

// ---------- admins: the report box ----------

const ACCOUNT_FIELDS = 'name email universityRegNumber avatar status suspendedUntil moderationReason rating ratingCount';
const presentAccount = (u) =>
  u && u._id
    ? {
        id: String(u._id),
        name: u.name,
        email: u.email,
        universityRegNumber: u.universityRegNumber,
        avatar: u.avatar || null,
        rating: u.rating || 0,
        ratingCount: u.ratingCount || 0,
        ...moderationView(u),
      }
    : null;

/** GET /api/admin/reports?status=&page=&limit= */
exports.adminListReports = asyncHandler(async (req, res) => {
  const { status, page, limit } = parse(reportListSchema, req.query);
  const filter = status === 'all' ? {} : { status };

  const [total, reports, grouped] = await Promise.all([
    UserReport.countDocuments(filter),
    UserReport.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('reporter', ACCOUNT_FIELDS)
      .populate('reported', ACCOUNT_FIELDS)
      .lean(),
    UserReport.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);

  // how often each reported student has been reported in total (repeat offenders stand out)
  const reportedIds = [...new Set(reports.filter((r) => r.reported).map((r) => String(r.reported._id)))];
  const totals = await UserReport.aggregate([
    { $match: { reported: { $in: reportedIds.map((id) => new mongoose.Types.ObjectId(id)) } } },
    { $group: { _id: '$reported', n: { $sum: 1 } } },
  ]);
  const totalFor = new Map(totals.map((t) => [String(t._id), t.n]));

  const counts = Object.fromEntries(REPORT_STATUSES.map((s) => [s, 0]));
  grouped.forEach((g) => {
    counts[g._id] = g.n;
  });
  counts.all = Object.values(counts).reduce((a, b) => a + b, 0);

  res.json({
    success: true,
    data: {
      reports: reports.map((r) => ({
        id: String(r._id),
        reason: r.reason,
        details: r.details,
        status: r.status,
        adminNote: r.adminNote || '',
        handledAt: r.handledAt || null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        reporter: presentAccount(r.reporter),
        reported: r.reported ? { ...presentAccount(r.reported), timesReported: totalFor.get(String(r.reported._id)) || 1 } : null,
      })),
      counts,
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    },
  });
});

async function closeReport(report, admin, status, adminNote) {
  report.status = status;
  if (adminNote) report.adminNote = adminNote;
  report.handledBy = admin._id;
  report.handledAt = new Date();
  await report.save();
  await AdminActionLog.create({
    adminId: admin._id,
    actionType: 'handle_report',
    targetType: 'report',
    targetId: report._id,
    details: `Status: ${status}${adminNote ? ` - ${adminNote}` : ''}`.slice(0, 500),
  });
  await notify(
    report.reporter,
    'report_update',
    report._id,
    `Your report is now ${REPORT_STATUS_WORDS[status]}.${adminNote ? ` Admin: ${adminNote}` : ''}`
  );
}

/** PATCH /api/admin/reports/:id   { status, adminNote? } */
exports.adminUpdateReport = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('Report not found.', 404);
  const { status, adminNote } = parse(reportUpdateSchema, req.body);
  const report = await UserReport.findById(req.params.id);
  if (!report) throw new AppError('Report not found.', 404);
  await closeReport(report, req.user, status, adminNote);
  res.json({ success: true, message: 'Report updated. The student who reported it was notified.' });
});

// ---------- admins: block / remove / restore a student ----------

/** POST /api/admin/users/:id/moderate   { action: suspend|ban|restore, days?, reason?, reportId? } */
exports.adminModerateUser = asyncHandler(async (req, res) => {
  const { action, days, reason, reportId } = parse(moderateUserSchema, req.body);
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('Student not found.', 404);
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError('Student not found.', 404);

  let message;
  let change;
  if (action === 'suspend') {
    change = { status: 'suspended', suspendedUntil: new Date(Date.now() + days * 24 * 60 * 60 * 1000), moderationReason: reason };
    message = `${user.name} is blocked for ${days} day${days === 1 ? '' : 's'}.`;
  } else if (action === 'ban') {
    change = { status: 'banned', suspendedUntil: null, moderationReason: reason };
    message = `${user.name} was removed. They can no longer log in and their items are hidden.`;
  } else {
    if (user.status === 'active') throw new AppError(`${user.name}'s account is already active.`, 409, { code: 'ALREADY_ACTIVE' });
    change = { status: 'active', suspendedUntil: null, moderationReason: '' };
    message = `${user.name}'s account is active again.`;
  }
  // a targeted update: older accounts may not pass today's full validation
  await User.updateOne({ _id: user._id }, { $set: change });
  Object.assign(user, change);

  await AdminActionLog.create({
    adminId: req.user._id,
    actionType: { suspend: 'suspend_user', ban: 'ban_user', restore: 'restore_user' }[action],
    targetType: 'user',
    targetId: user._id,
    details: `${action}${days ? ` ${days}d` : ''}${reason ? ` - ${reason}` : ''}`.slice(0, 500),
  });
  // Blocked students are logged out everywhere right away (every request re-checks the account; sockets are closed)
  if (action !== 'restore') disconnectUser(user._id);

  // Acting on a report marks it as handled
  if (reportId && action !== 'restore') {
    const report = await UserReport.findOne({ _id: reportId, reported: user._id });
    if (report && ['open', 'reviewing'].includes(report.status)) {
      await closeReport(report, req.user, 'action_taken', action === 'ban' ? 'The account was removed.' : `The account was blocked for ${days} day${days === 1 ? '' : 's'}.`);
    }
  }

  res.json({ success: true, message, data: { user: { id: String(user._id), ...moderationView(user) } } });
});
