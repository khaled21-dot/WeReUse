const mongoose = require('mongoose');
const User = require('../models/User');
const Admin = require('../models/Admin');
const Notification = require('../models/Notification');
const AdminActionLog = require('../models/AdminActionLog');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const sendIdCard = require('../utils/sendIdCard');
const { toRegKey } = require('../utils/regKey');
const { emailInUse, regKeyInUse } = require('../utils/accountLookup');
const { saveIdCard, deleteIdCard } = require('../utils/fileStore');
const { detectImageType } = require('../utils/imageType');
const {
  parse,
  rejectSchema,
  verificationListSchema,
  createAdminSchema,
  promoteSchema,
} = require('../utils/validators');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const assertObjectId = (id) => {
  if (!mongoose.isValidObjectId(id)) throw new AppError('Student not found.', 404);
};

const idCardError = (message) =>
  new AppError(message, 400, { code: 'VALIDATION_ERROR', errors: { idCard: message } });

/** GET /api/admin/stats - counts for the dashboard cards (every document in `users` is a student) */
exports.getStats = asyncHandler(async (req, res) => {
  const [pending, verified, rejected] = await Promise.all([
    User.countDocuments({ verificationStatus: 'pending' }),
    User.countDocuments({ verificationStatus: 'verified' }),
    User.countDocuments({ verificationStatus: 'rejected' }),
  ]);
  res.json({
    success: true,
    data: { stats: { pending, verified, rejected, total: pending + verified + rejected } },
  });
});

/** GET /api/admin/verifications?status=&search=&page=&limit= - the verification queue */
exports.listVerifications = asyncHandler(async (req, res) => {
  const { status, search, page, limit } = parse(verificationListSchema, req.query);

  const filter = {};
  if (status !== 'all') filter.verificationStatus = status;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { universityRegNumber: rx }, { department: rx }];
  }

  let sort;
  if (status === 'pending') sort = { verificationSubmittedAt: 1 }; // oldest first (fair queue)
  else if (status === 'all') sort = { verificationSubmittedAt: -1 };
  else sort = { reviewedAt: -1 };

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('reviewedBy', 'name adminBadge'), // shows "Reviewed by <admin> [Admin badge]"
    User.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: {
      users,
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    },
  });
});

// Shared by approve / reject. The status filter makes the decision atomic, so two admins
// clicking at the same moment cannot both review the same student.
async function review(req, res, { nextStatus, reason, actionType, notifyMessage, successMessage }) {
  const { id } = req.params;
  assertObjectId(id);

  // updateOne is atomic: matchedCount is 1 only for the single request that actually
  // moved the student out of "pending".
  const result = await User.updateOne(
    { _id: id, verificationStatus: 'pending' },
    {
      $set: {
        verificationStatus: nextStatus,
        rejectionReason: reason || '',
        reviewedAt: new Date(),
        reviewedBy: req.user._id, // an admins._id
      },
    }
  );

  if (result.matchedCount === 0) {
    const exists = await User.exists({ _id: id });
    if (!exists) throw new AppError('Student not found.', 404);
    throw new AppError('This student has already been reviewed. Refresh the list.', 409, {
      code: 'ALREADY_REVIEWED',
    });
  }

  const user = await User.findById(id).populate('reviewedBy', 'name adminBadge');

  // The decision above is already saved; a failure here must not turn it into an error.
  try {
    await Promise.all([
      AdminActionLog.create({
        adminId: req.user._id,
        actionType,
        targetType: 'user',
        targetId: user._id,
        details: reason || '',
      }),
      Notification.create({
        userId: user._id,
        type: 'verification_status',
        relatedId: user._id,
        message: notifyMessage,
      }),
    ]);
  } catch (err) {
    console.error('Could not write audit log / notification:', err.message);
  }

  res.json({ success: true, message: successMessage, data: { user } });
}

/** PATCH /api/admin/verifications/:id/approve */
exports.approve = asyncHandler(async (req, res) =>
  review(req, res, {
    nextStatus: 'verified',
    actionType: 'approve_user',
    notifyMessage: 'Your student verification was approved. You now have full access to WeReUse.',
    successMessage: 'Student approved.',
  })
);

/** PATCH /api/admin/verifications/:id/reject   body: { reason } */
exports.reject = asyncHandler(async (req, res) => {
  const { reason } = parse(rejectSchema, req.body);
  return review(req, res, {
    nextStatus: 'rejected',
    reason,
    actionType: 'reject_user',
    notifyMessage: `Your student verification was rejected: ${reason}`.slice(0, 300),
    successMessage: 'Student rejected. They can resubmit a new ID card.',
  });
});

/**
 * POST /api/admin/admins   (multipart/form-data)
 * An existing admin creates another admin account. Admins can never be created through the
 * public sign-up form. Fields: name, email, phone, universityRegNumber, password, idCard.
 */
exports.createAdmin = asyncHandler(async (req, res) => {
  const data = parse(createAdminSchema, req.body);

  if (!req.file) throw idCardError('Please upload a photo of the admin\'s university ID card.');
  const ext = detectImageType(req.file.buffer);
  if (!ext) throw idCardError('That file is not a valid JPG or PNG image.');

  // the email is the login name and the registration number identifies one person:
  // both must be unused by students AND admins
  const [emailTaken, phoneTaken, regTaken] = await Promise.all([
    emailInUse(data.email),
    Admin.exists({ phone: data.phone }),
    regKeyInUse(toRegKey(data.universityRegNumber)),
  ]);
  const errors = {};
  if (emailTaken) errors.email = 'An account with this email already exists.';
  if (phoneTaken) errors.phone = 'This phone number is already registered.';
  if (regTaken) errors.universityRegNumber = 'This university registration number is already registered.';
  if (Object.keys(errors).length) {
    throw new AppError(Object.values(errors)[0], 409, { code: 'DUPLICATE', errors });
  }

  const passwordHash = await Admin.hashPassword(data.password);
  const filename = await saveIdCard(req.file.buffer, ext);

  let admin;
  try {
    admin = await Admin.create({
      name: data.name,
      email: data.email,
      phone: data.phone,
      universityRegNumber: data.universityRegNumber,
      idCardImageUrl: filename,
      passwordHash,
    });
  } catch (err) {
    await deleteIdCard(filename); // never leave an orphaned private file behind
    throw err;
  }

  try {
    await AdminActionLog.create({
      adminId: req.user._id,
      actionType: 'create_admin',
      targetType: 'admin',
      targetId: admin._id,
      details: admin.email,
    });
  } catch (err) {
    console.error('Could not write audit log for create_admin:', err.message);
  }

  res.status(201).json({ success: true, message: 'Admin account created.', data: { admin } });
});

/**
 * POST /api/admin/students/:id/promote   body: { phone }
 * Makes an existing student an admin. The person MOVES from `users` to `admins`:
 *  - the new admin keeps the student's _id, name, email, password hash, registration number and ID card
 *  - the phone number is supplied by the promoting admin (admins must have one)
 *  - the student record is removed, so nobody exists in both collections
 * MongoDB transactions need a replica set (not available on a plain local install), so the steps
 * are ordered to be safe: create the admin first, delete the student second, undo if that fails.
 */
exports.promoteStudent = asyncHandler(async (req, res) => {
  const { id } = req.params;
  assertObjectId(id);
  const { phone } = parse(promoteSchema, req.body);

  const student = await User.findById(id).select('+passwordHash');
  if (!student) throw new AppError('Student not found.', 404);

  if (student.status !== 'active') {
    throw new AppError(
      `This account is ${student.status}. Reactivate it before making the student an admin.`,
      409,
      { code: 'ACCOUNT_NOT_ACTIVE' }
    );
  }
  if (!student.idCardImageUrl) {
    throw new AppError('This student has no ID card on file, so they cannot be made an admin.', 409, {
      code: 'NO_ID_CARD',
    });
  }

  const [sameId, emailTaken, phoneTaken, regTaken] = await Promise.all([
    Admin.exists({ _id: student._id }),
    Admin.exists({ email: student.email }),
    Admin.exists({ phone }),
    Admin.exists({ regKey: toRegKey(student.universityRegNumber) }),
  ]);
  if (sameId) throw new AppError('This student has already been made an admin.', 409, { code: 'DUPLICATE' });
  if (emailTaken) throw new AppError('An admin account already uses this student\'s email.', 409, { code: 'DUPLICATE' });
  if (regTaken) {
    throw new AppError('An admin account already uses this student\'s registration number.', 409, { code: 'DUPLICATE' });
  }
  if (phoneTaken) {
    const message = 'This phone number is already registered.';
    throw new AppError(message, 409, { code: 'DUPLICATE', errors: { phone: message } });
  }

  // 1) create the admin (same _id) - if this fails nothing has changed
  const admin = await Admin.create({
    _id: student._id,
    name: student.name,
    email: student.email,
    phone,
    universityRegNumber: student.universityRegNumber,
    idCardImageUrl: student.idCardImageUrl, // the private file stays where it is
    emailVerifiedAt: student.emailVerifiedAt, // their e-mail was already verified
    passwordHash: student.passwordHash, // they keep their password
  });

  // 2) remove the student record; undo step 1 if that does not work
  try {
    const removed = await User.deleteOne({ _id: student._id });
    if (removed.deletedCount !== 1) {
      throw new AppError('This student changed while you were promoting them. Please refresh and try again.', 409, {
        code: 'CONFLICT',
      });
    }
  } catch (err) {
    await Admin.deleteOne({ _id: admin._id });
    throw err;
  }

  // 3) audit trail + tidy up. The promotion is already done, so a failure here must not undo it.
  try {
    await Promise.all([
      AdminActionLog.create({
        adminId: req.user._id,
        actionType: 'promote_to_admin',
        targetType: 'user',
        targetId: admin._id,
        details: admin.email,
      }),
      Notification.deleteMany({ userId: admin._id }), // admins do not receive in-app notifications
    ]);
  } catch (err) {
    console.error('Could not finish promotion bookkeeping (audit log / notifications):', err.message);
  }

  res.json({ success: true, message: `${admin.name} is now an admin.`, data: { admin } });
});

/** GET /api/admin/id-card/:adminId - an admin's own ID card photo (owner only) */
exports.getAdminIdCard = asyncHandler(async (req, res, next) => {
  const { adminId } = req.params;
  if (!mongoose.isValidObjectId(adminId)) throw new AppError('ID card not found.', 404);
  if (String(req.user._id) !== String(adminId)) {
    throw new AppError('You can only view your own ID card.', 403, { code: 'FORBIDDEN' });
  }

  const target = await Admin.findById(adminId).select('idCardImageUrl');
  if (!target || !target.idCardImageUrl) throw new AppError('ID card not found.', 404);
  sendIdCard(res, next, target.idCardImageUrl);
});
