/**
 * Profile editing for VERIFIED students and for admins (the routes use protect + requireVerified).
 * Editable: name, department/batch (students), phone (admins), password, and the e-mail address
 * (which needs a code sent to the NEW address).
 * NOT editable by anybody: the university registration number and the ID card photo.
 */
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Admin = require('../models/Admin');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { signToken, setAuthCookie } = require('../utils/token');
const { sendVerificationEmail } = require('../utils/mailer');
const { emailInUse } = require('../utils/accountLookup');
const { AVATAR_DIR, saveAvatar, deleteAvatar } = require('../utils/fileStore');
const { detectImageType } = require('../utils/imageType');
const {
  CODE_TTL_MINUTES,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_SECONDS,
  newCode,
  codeMatches,
  cooldownRemainingSeconds,
  maskEmail,
} = require('../utils/emailCode');
const {
  parse,
  updateStudentProfileSchema,
  updateAdminProfileSchema,
  changePasswordSchema,
  requestEmailChangeSchema,
  confirmEmailChangeSchema,
} = require('../utils/validators');

const modelFor = (account) => (account.role === 'admin' ? Admin : User);
const typeFor = (account) => (account.role === 'admin' ? 'admin' : 'student');

// Fields that must never be changed here - the server refuses them instead of silently ignoring them.
const LOCKED_FIELDS = {
  universityRegNumber: 'The university registration number cannot be changed.',
  regKey: 'The university registration number cannot be changed.',
  idCard: 'The ID card photo cannot be changed.',
  idCardImageUrl: 'The ID card photo cannot be changed.',
  email: 'Change your email address with the verification code form.',
};

const NO_PENDING_CHANGE = { newEmail: null, codeHash: null, expiresAt: null, attempts: 0, sentAt: null };

/** PATCH /api/profile */
exports.updateProfile = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const blocked = Object.keys(LOCKED_FIELDS).filter((key) => key in body);
  if (blocked.length > 0) {
    const errors = {};
    blocked.forEach((key) => {
      errors[key] = LOCKED_FIELDS[key];
    });
    throw new AppError(errors[blocked[0]], 400, { code: 'FIELD_LOCKED', errors });
  }

  const isAdmin = req.user.role === 'admin';
  const updates = parse(isAdmin ? updateAdminProfileSchema : updateStudentProfileSchema, body);
  if (Object.keys(updates).length === 0) {
    throw new AppError('There is nothing to update.', 400, { code: 'NOTHING_TO_UPDATE' });
  }

  if (isAdmin && updates.phone) {
    const taken = await Admin.exists({ phone: updates.phone, _id: { $ne: req.user._id } });
    if (taken) {
      const message = 'This phone number is already registered.';
      throw new AppError(message, 409, { code: 'DUPLICATE', errors: { phone: message } });
    }
  }

  const Model = modelFor(req.user);
  await Model.updateOne({ _id: req.user._id }, { $set: updates }, { runValidators: true });
  const user = await Model.findById(req.user._id);
  res.json({ success: true, message: 'Profile updated.', data: { user } });
});

/** POST /api/profile/password   { currentPassword, newPassword, confirmPassword } */
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = parse(changePasswordSchema, req.body);
  const Model = modelFor(req.user);

  const account = await Model.findById(req.user._id).select('+passwordHash');
  if (!(await bcrypt.compare(currentPassword, account.passwordHash))) {
    const message = 'Your current password is not correct.';
    throw new AppError(message, 400, { code: 'WRONG_PASSWORD', errors: { currentPassword: message } });
  }

  const passwordHash = await Model.hashPassword(newPassword);
  await Model.updateOne({ _id: account._id }, { $set: { passwordHash, passwordChangedAt: new Date() } });

  // Every older login (other devices) stops working; this one gets a fresh token and stays logged in.
  setAuthCookie(res, signToken(account._id, typeFor(req.user)));
  res.json({ success: true, message: 'Password changed. Other devices have been logged out.' });
});

async function mailChangeCode(Model, account, newEmail, code) {
  try {
    await sendVerificationEmail({ to: newEmail, name: account.name, code, purpose: 'change-email' });
  } catch (err) {
    console.error('Could not send the verification e-mail:', err.message);
    await Model.updateOne({ _id: account._id }, { $set: { emailChange: NO_PENDING_CHANGE } });
    if (err.appCode === 'EMAIL_NOT_CONFIGURED') throw err;
    throw new AppError(
      'We could not send the verification email. Check the address and try again in a moment.',
      502,
      { code: 'EMAIL_SEND_FAILED' }
    );
  }
}

/** POST /api/profile/email/request   { newEmail, password } - sends a code to the NEW address */
exports.requestEmailChange = asyncHandler(async (req, res) => {
  const { newEmail, password } = parse(requestEmailChangeSchema, req.body);
  const Model = modelFor(req.user);

  const account = await Model.findById(req.user._id).select('+passwordHash');
  if (!(await bcrypt.compare(password, account.passwordHash))) {
    const message = 'Your password is not correct.';
    throw new AppError(message, 400, { code: 'WRONG_PASSWORD', errors: { password: message } });
  }
  if (newEmail === account.email) {
    const message = 'That is already your email address.';
    throw new AppError(message, 400, { code: 'SAME_EMAIL', errors: { newEmail: message } });
  }
  if (await emailInUse(newEmail)) {
    const message = 'An account with this email already exists.';
    throw new AppError(message, 409, { code: 'DUPLICATE', errors: { newEmail: message } });
  }

  const current = account.emailChange;
  if (current && current.newEmail === newEmail) {
    const wait = cooldownRemainingSeconds(current.sentAt);
    if (wait > 0) {
      throw new AppError(`Please wait ${wait} seconds before asking for another code.`, 429, { code: 'RESEND_COOLDOWN' });
    }
  }

  const { code, codeHash, expiresAt, sentAt } = newCode();
  await Model.updateOne(
    { _id: account._id },
    { $set: { emailChange: { newEmail, codeHash, expiresAt, attempts: 0, sentAt } } }
  );
  await mailChangeCode(Model, account, newEmail, code);

  res.json({
    success: true,
    message: `We sent a 6-digit code to ${maskEmail(newEmail)}.`,
    data: { pendingEmail: newEmail, expiresInMinutes: CODE_TTL_MINUTES, resendAfterSeconds: RESEND_COOLDOWN_SECONDS },
  });
});

/** POST /api/profile/email/confirm   { code } - the new address replaces the old one */
exports.confirmEmailChange = asyncHandler(async (req, res) => {
  const { code } = parse(confirmEmailChangeSchema, req.body);
  const Model = modelFor(req.user);

  let account = await Model.findById(req.user._id);
  if (!account.emailChange || !account.emailChange.newEmail) {
    throw new AppError('There is no email change waiting for a code.', 400, { code: 'NO_PENDING_CHANGE' });
  }

  // Count the attempt first and atomically, so parallel guesses cannot get past the limit
  const counted = await Model.updateOne(
    { _id: account._id, 'emailChange.attempts': { $lt: MAX_ATTEMPTS } },
    { $inc: { 'emailChange.attempts': 1 } }
  );
  account = await Model.findById(req.user._id);
  const change = account.emailChange;

  if (!change || !change.newEmail) {
    throw new AppError('There is no email change waiting for a code.', 400, { code: 'NO_PENDING_CHANGE' });
  }
  if (counted.matchedCount === 0) {
    throw new AppError('Too many wrong codes. Please request a new code.', 429, { code: 'TOO_MANY_ATTEMPTS' });
  }
  if (!change.expiresAt || change.expiresAt.getTime() < Date.now()) {
    throw new AppError('This code has expired. Please request a new one.', 400, {
      code: 'CODE_EXPIRED',
      errors: { code: 'This code has expired. Request a new one.' },
    });
  }
  if (!codeMatches(code, change.codeHash)) {
    const left = Math.max(0, MAX_ATTEMPTS - change.attempts);
    const message =
      left > 0
        ? `That code is not correct. ${left} attempt${left === 1 ? '' : 's'} left.`
        : 'That code is not correct. Please request a new code.';
    throw new AppError(message, 400, { code: 'INVALID_CODE', errors: { code: message } });
  }

  // Someone else may have taken that address in the meantime
  if (await emailInUse(change.newEmail)) {
    await Model.updateOne({ _id: account._id }, { $set: { emailChange: NO_PENDING_CHANGE } });
    const message = 'An account with this email already exists.';
    throw new AppError(message, 409, { code: 'DUPLICATE', errors: { newEmail: message } });
  }

  await Model.updateOne(
    { _id: account._id },
    { $set: { email: change.newEmail, emailVerifiedAt: new Date(), emailChange: NO_PENDING_CHANGE } }
  );
  const user = await Model.findById(account._id);
  res.json({ success: true, message: 'Your email address has been updated.', data: { user } });
});

/** POST /api/profile/email/resend - a fresh code for the change that is waiting */
exports.resendEmailChange = asyncHandler(async (req, res) => {
  const Model = modelFor(req.user);
  const account = await Model.findById(req.user._id);
  const current = account.emailChange;
  if (!current || !current.newEmail) {
    throw new AppError('There is no email change waiting for a code.', 400, { code: 'NO_PENDING_CHANGE' });
  }
  const wait = cooldownRemainingSeconds(current.sentAt);
  if (wait > 0) {
    throw new AppError(`Please wait ${wait} seconds before asking for another code.`, 429, { code: 'RESEND_COOLDOWN' });
  }

  const { code, codeHash, expiresAt, sentAt } = newCode();
  await Model.updateOne(
    { _id: account._id },
    { $set: { emailChange: { newEmail: current.newEmail, codeHash, expiresAt, attempts: 0, sentAt } } }
  );
  await mailChangeCode(Model, account, current.newEmail, code);

  res.json({
    success: true,
    message: `We sent a new 6-digit code to ${maskEmail(current.newEmail)}.`,
    data: { pendingEmail: current.newEmail, expiresInMinutes: CODE_TTL_MINUTES, resendAfterSeconds: RESEND_COOLDOWN_SECONDS },
  });
});

/** DELETE /api/profile/email - forget the email change that was waiting for a code */
exports.cancelEmailChange = asyncHandler(async (req, res) => {
  const Model = modelFor(req.user);
  await Model.updateOne({ _id: req.user._id }, { $set: { emailChange: NO_PENDING_CHANGE } });
  const user = await Model.findById(req.user._id);
  res.json({ success: true, message: 'Email change cancelled.', data: { user } });
});


// ---------- profile photo (every logged-in account: students, verified or not, and admins) ----------
const AVATAR_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$/;

/** POST /api/profile/avatar   multipart, field "avatar" (JPG or PNG) - add or replace the profile photo */
exports.uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) {
    const message = 'Choose a photo to upload.';
    throw new AppError(message, 400, { code: 'NO_FILE', errors: { avatar: message } });
  }
  // trust the bytes, not the file name or the Content-Type the browser sent
  const ext = detectImageType(req.file.buffer);
  if (!ext) {
    const message = 'This file is not a valid JPG or PNG image.';
    throw new AppError(message, 400, { code: 'INVALID_FILE_TYPE', errors: { avatar: message } });
  }

  const Model = modelFor(req.user);
  const filename = await saveAvatar(req.file.buffer, ext);
  const previous = req.user.avatar;
  try {
    await Model.updateOne({ _id: req.user._id }, { $set: { avatar: filename } });
  } catch (err) {
    await deleteAvatar(filename);
    throw err;
  }
  if (previous && previous !== filename) await deleteAvatar(previous);

  const user = await Model.findById(req.user._id);
  res.json({ success: true, message: 'Profile photo updated.', data: { user } });
});

/** DELETE /api/profile/avatar - back to the initials */
exports.removeAvatar = asyncHandler(async (req, res) => {
  const Model = modelFor(req.user);
  const previous = req.user.avatar;
  await Model.updateOne({ _id: req.user._id }, { $set: { avatar: null } });
  if (previous) await deleteAvatar(previous);
  const user = await Model.findById(req.user._id);
  res.json({ success: true, message: 'Profile photo removed.', data: { user } });
});

/** GET /api/profile/avatars/:filename - any logged-in user may see profile photos (chat, listings) */
exports.sendAvatar = (req, res, next) => {
  const { filename } = req.params;
  if (!AVATAR_NAME.test(filename)) return next(new AppError('Photo not found.', 404));
  return res.sendFile(
    filename,
    {
      root: AVATAR_DIR,
      cacheControl: false,
      etag: false,
      lastModified: false,
      headers: {
        'Content-Type': filename.endsWith('.png') ? 'image/png' : 'image/jpeg',
        // a new photo always gets a new random name, so the old one may be cached
        'Cache-Control': 'private, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline',
      },
    },
    (err) => {
      if (err && !res.headersSent) next(new AppError('Photo not found.', 404));
    }
  );
};
