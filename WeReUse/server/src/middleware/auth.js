const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken } = require('../utils/token');
const { COOKIE_NAME } = require('../config/env');
const User = require('../models/User');
const Admin = require('../models/Admin');

// The token says which collection the account lives in.
const MODEL_BY_TYPE = { student: User, admin: Admin };

function readToken(req) {
  if (req.cookies && req.cookies[COOKIE_NAME]) return req.cookies[COOKIE_NAME];
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim(); // handy for Postman
  return null;
}

/** Requires a valid login. Loads the CURRENT account (student or admin) from the database on
 *  every request, so a suspension or a verification decision takes effect immediately.
 *  req.user is either a User document (role "student") or an Admin document (role "admin"). */
const protect = asyncHandler(async (req, res, next) => {
  const token = readToken(req);
  if (!token) throw new AppError('Please log in to continue.', 401, { code: 'NOT_AUTHENTICATED' });

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    throw new AppError('Your session has expired. Please log in again.', 401, { code: 'SESSION_EXPIRED' });
  }

  const Model = MODEL_BY_TYPE[payload.type];
  if (!Model) {
    // e.g. a token issued before admins got their own collection
    throw new AppError('Your session is out of date. Please log in again.', 401, { code: 'SESSION_EXPIRED' });
  }

  const account = await Model.findById(payload.id);
  if (!account) throw new AppError('Your session is no longer valid. Please log in again.', 401, { code: 'NOT_AUTHENTICATED' });

  if (account.status !== 'active') {
    throw new AppError(`Your account has been ${account.status}. Please contact the admin.`, 403, {
      code: `ACCOUNT_${account.status.toUpperCase()}`,
    });
  }

  // Changing the password logs out every older session (the token's issue time must not be older)
  if (account.passwordChangedAt && payload.iat < Math.floor(account.passwordChangedAt.getTime() / 1000)) {
    throw new AppError('Your password was changed. Please log in again.', 401, { code: 'SESSION_EXPIRED' });
  }

  req.user = account;
  next();
});

/** Allows only the listed roles, e.g. requireRole('admin'). Use after protect. */
const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to do this.', 403, { code: 'FORBIDDEN' }));
    }
    return next();
  };

/** Blocks students who are not verified yet. Use on listing / chat routes in the next modules. */
const requireVerified = (req, res, next) => {
  if (req.user.role === 'admin' || req.user.verificationStatus === 'verified') return next();
  return next(
    new AppError('Your student verification is not approved yet.', 403, { code: 'NOT_VERIFIED' })
  );
};

module.exports = { protect, requireRole, requireVerified };
