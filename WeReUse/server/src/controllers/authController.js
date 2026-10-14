const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Admin = require('../models/Admin');
const PendingRegistration = require('../models/PendingRegistration');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { parse, registerSchema, loginSchema, verifyEmailSchema, emailOnlySchema } = require('../utils/validators');
const { signToken, setAuthCookie, clearAuthCookie } = require('../utils/token');
const { saveIdCard, deleteIdCard } = require('../utils/fileStore');
const { detectImageType } = require('../utils/imageType');
const { toRegKey } = require('../utils/regKey');
const { emailInUse, regKeyInUse } = require('../utils/accountLookup');
const { purgeExpiredPendingRegistrations } = require('../utils/pendingRegistrations');
const { sendVerificationEmail } = require('../utils/mailer');
const {
  CODE_TTL_MINUTES,
  MAX_ATTEMPTS,
  MAX_RESENDS,
  RESEND_COOLDOWN_SECONDS,
  newCode,
  codeMatches,
  cooldownRemainingSeconds,
  maskEmail,
} = require('../utils/emailCode');
const { BCRYPT_ROUNDS, PENDING_REGISTRATION_TTL_MINUTES } = require('../config/env');

// Compared against when the email does not exist, so a login for an unknown email
// takes the same time as a wrong password (prevents account enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync('wereuse-dummy-password-1', BCRYPT_ROUNDS);

const EMAIL_TAKEN = 'An account with this email already exists.';
const REG_TAKEN = 'This university registration number is already registered.';

const idCardError = (message) =>
  new AppError(message, 400, { code: 'VALIDATION_ERROR', errors: { idCard: message } });

const pendingDeadline = () => new Date(Date.now() + PENDING_REGISTRATION_TTL_MINUTES * 60 * 1000);

/** Sends the code; if that fails the half-finished registration is removed again. */
async function sendCodeOrRollback({ to, name, code, rollback }) {
  try {
    await sendVerificationEmail({ to, name, code, purpose: 'register' });
  } catch (err) {
    console.error('Could not send the verification e-mail:', err.message);
    await rollback();
    if (err.appCode === 'EMAIL_NOT_CONFIGURED') throw err;
    throw new AppError(
      'We could not send the verification email. Check the address and try again in a moment.',
      502,
      { code: 'EMAIL_SEND_FAILED' }
    );
  }
}

/**
 * POST /api/auth/register   (multipart/form-data)   STEP 1 of 2
 * Validates everything and e-mails a 6-digit code. NO account exists yet: the details wait in
 * `pendingregistrations` until the code is confirmed (POST /api/auth/verify-email).
 */
exports.register = asyncHandler(async (req, res) => {
  const data = parse(registerSchema, req.body);

  // University registration number and ID card photo are both REQUIRED
  if (!req.file) throw idCardError('Please upload a photo of your university ID card.');
  const ext = detectImageType(req.file.buffer);
  if (!ext) throw idCardError('That file is not a valid JPG or PNG image.');

  // One account per registration number: compared in a normalised form, against students AND admins
  const regKey = toRegKey(data.universityRegNumber);
  const [emailTaken, regTaken] = await Promise.all([emailInUse(data.email), regKeyInUse(regKey)]);
  if (emailTaken || regTaken) {
    const errors = {};
    if (emailTaken) errors.email = EMAIL_TAKEN;
    if (regTaken) errors.universityRegNumber = REG_TAKEN;
    throw new AppError(Object.values(errors)[0], 409, { code: 'DUPLICATE', errors });
  }

  await purgeExpiredPendingRegistrations().catch(() => {}); // housekeeping must never block a sign-up

  // The same address may start over, but not faster than one e-mail per minute
  const existing = await PendingRegistration.findOne({ email: data.email });
  if (existing) {
    const wait = cooldownRemainingSeconds(existing.lastSentAt);
    if (wait > 0) {
      throw new AppError(`Please wait ${wait} seconds before asking for another code.`, 429, {
        code: 'RESEND_COOLDOWN',
      });
    }
  }

  const passwordHash = await User.hashPassword(data.password);
  const filename = await saveIdCard(req.file.buffer, ext);
  const { code, codeHash, expiresAt: codeExpiresAt, sentAt } = newCode();

  if (existing) {
    await PendingRegistration.deleteOne({ _id: existing._id });
    await deleteIdCard(existing.idCardImageUrl); // the new details replace the old ones
  }

  let pending;
  try {
    pending = await PendingRegistration.create({
      email: data.email,
      name: data.name,
      passwordHash,
      department: data.department,
      batch: data.batch,
      universityRegNumber: data.universityRegNumber,
      regKey,
      idCardImageUrl: filename,
      codeHash,
      codeExpiresAt,
      lastSentAt: sentAt,
      expiresAt: pendingDeadline(),
    });
  } catch (err) {
    await deleteIdCard(filename);
    throw err;
  }

  await sendCodeOrRollback({
    to: pending.email,
    name: pending.name,
    code,
    rollback: async () => {
      await PendingRegistration.deleteOne({ _id: pending._id });
      await deleteIdCard(filename);
    },
  });

  res.status(202).json({
    success: true,
    message: `We sent a 6-digit code to ${maskEmail(pending.email)}.`,
    data: { email: pending.email, expiresInMinutes: CODE_TTL_MINUTES, resendAfterSeconds: RESEND_COOLDOWN_SECONDS },
  });
});

/**
 * POST /api/auth/verify-email   { email, code }   STEP 2 of 2
 * A correct code creates the student account (status "pending" ID review) and logs the student in.
 */
exports.verifyEmail = asyncHandler(async (req, res) => {
  const { email, code } = parse(verifyEmailSchema, req.body);

  // Count this attempt FIRST and atomically, so parallel guesses cannot get past the limit
  const counted = await PendingRegistration.updateOne(
    { email, attempts: { $lt: MAX_ATTEMPTS } },
    { $inc: { attempts: 1 } }
  );
  const pending = await PendingRegistration.findOne({ email });

  if (!pending) {
    throw new AppError('We could not find a registration waiting for this email. Please register again.', 400, {
      code: 'NO_PENDING_REGISTRATION',
    });
  }
  if (counted.matchedCount === 0) {
    throw new AppError('Too many wrong codes. Please request a new code.', 429, { code: 'TOO_MANY_ATTEMPTS' });
  }
  if (pending.codeExpiresAt.getTime() < Date.now()) {
    throw new AppError('This code has expired. Please request a new one.', 400, {
      code: 'CODE_EXPIRED',
      errors: { code: 'This code has expired. Request a new one.' },
    });
  }
  if (!codeMatches(code, pending.codeHash)) {
    const left = Math.max(0, MAX_ATTEMPTS - pending.attempts);
    const message =
      left > 0
        ? `That code is not correct. ${left} attempt${left === 1 ? '' : 's'} left.`
        : 'That code is not correct. Please request a new code.';
    throw new AppError(message, 400, { code: 'INVALID_CODE', errors: { code: message } });
  }

  // The e-mail or the registration number may have been taken while the code was on its way
  const [emailTaken, regTaken] = await Promise.all([emailInUse(email), regKeyInUse(pending.regKey)]);
  if (emailTaken || regTaken) {
    const removed = await PendingRegistration.deleteOne({ _id: pending._id });
    if (removed.deletedCount === 1) await deleteIdCard(pending.idCardImageUrl);
    const message = regTaken ? REG_TAKEN : EMAIL_TAKEN;
    throw new AppError(message, 409, {
      code: 'DUPLICATE',
      errors: regTaken ? { universityRegNumber: message } : { email: message },
    });
  }

  // Use the pending entry up: only one request can ever turn it into an account
  const consumed = await PendingRegistration.deleteOne({ _id: pending._id });
  if (consumed.deletedCount !== 1) {
    throw new AppError('This code has already been used. Please log in.', 409, { code: 'ALREADY_USED' });
  }

  let user;
  try {
    user = await User.create({
      name: pending.name,
      email: pending.email,
      passwordHash: pending.passwordHash,
      department: pending.department,
      batch: pending.batch,
      universityRegNumber: pending.universityRegNumber,
      idCardImageUrl: pending.idCardImageUrl,
      verificationStatus: 'pending',
      verificationSubmittedAt: new Date(),
      emailVerifiedAt: new Date(),
    });
  } catch (err) {
    await deleteIdCard(pending.idCardImageUrl);
    throw err;
  }

  setAuthCookie(res, signToken(user._id, 'student'));
  res.status(201).json({
    success: true,
    message: 'Email verified. Your ID card is now waiting for admin review.',
    data: { user },
  });
});

/** POST /api/auth/resend-code   { email } - a fresh code for a registration that is still waiting */
exports.resendCode = asyncHandler(async (req, res) => {
  const { email } = parse(emailOnlySchema, req.body);
  const generic = {
    success: true,
    message: 'If a registration is waiting for this email, we sent a new code.',
    data: { resendAfterSeconds: RESEND_COOLDOWN_SECONDS },
  };

  const pending = await PendingRegistration.findOne({ email });
  if (!pending || pending.expiresAt.getTime() < Date.now()) return res.json(generic);

  const wait = cooldownRemainingSeconds(pending.lastSentAt);
  if (wait > 0) {
    throw new AppError(`Please wait ${wait} seconds before asking for another code.`, 429, {
      code: 'RESEND_COOLDOWN',
    });
  }
  if (pending.resendCount >= MAX_RESENDS) {
    throw new AppError('Too many codes were requested. Please start the registration again.', 429, {
      code: 'TOO_MANY_RESENDS',
    });
  }

  const { code, codeHash, expiresAt: codeExpiresAt, sentAt } = newCode();
  await PendingRegistration.updateOne(
    { _id: pending._id },
    {
      $set: { codeHash, codeExpiresAt, attempts: 0, lastSentAt: sentAt, expiresAt: pendingDeadline() },
      $inc: { resendCount: 1 },
    }
  );
  await sendCodeOrRollback({
    to: pending.email,
    name: pending.name,
    code,
    rollback: async () => {}, // keep the registration; the student can simply try again
  });

  res.json(generic);
});

/**
 * POST /api/auth/login
 * One login form for everybody: the email is looked up in `admins` and in `users`
 * (emails are unique across both collections, so there is never any doubt who it is).
 */
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = parse(loginSchema, req.body);

  const [admin, student] = await Promise.all([
    Admin.findOne({ email }).select('+passwordHash'),
    User.findOne({ email }).select('+passwordHash'),
  ]);
  const account = admin || student;
  const type = admin ? 'admin' : 'student';

  const passwordOk = await bcrypt.compare(password, account ? account.passwordHash : DUMMY_HASH);
  if (!account || !passwordOk) {
    throw new AppError('Invalid email or password.', 401, { code: 'INVALID_CREDENTIALS' });
  }

  if (account.status !== 'active') {
    throw new AppError(`Your account has been ${account.status}. Please contact the admin.`, 403, {
      code: `ACCOUNT_${account.status.toUpperCase()}`,
    });
  }

  // Pending and rejected students may log in - they need to see their verification
  // status (and resubmit). Features are locked by requireVerified instead.
  const Model = admin ? Admin : User;
  await Model.updateOne({ _id: account._id }, { $set: { lastLoginAt: new Date() } }, { timestamps: false });

  setAuthCookie(res, signToken(account._id, type));
  res.json({ success: true, message: 'Logged in successfully.', data: { user: account } });
});

/** POST /api/auth/logout */
exports.logout = (req, res) => {
  clearAuthCookie(res);
  res.json({ success: true, message: 'Logged out.' });
};

/** GET /api/auth/me - the current user (used by the frontend on every page load) */
exports.me = (req, res) => {
  res.json({ success: true, data: { user: req.user } });
};
