'use strict';
/**
 * Temporary blocks ("suspended" until a date) and removals ("banned") of student accounts.
 * A block ends by itself: expired blocks are lifted when the student next logs in / makes a request,
 * and by a sweep every minute (so their items show up in the browse page again).
 */

const isExpiredSuspension = (account, now = new Date()) =>
  Boolean(account && account.status === 'suspended' && account.suspendedUntil && account.suspendedUntil <= now);

/** Lifts an expired block on this loaded account (students only). Returns the account. */
async function refreshSuspension(account) {
  if (!isExpiredSuspension(account)) return account;
  const User = require('../models/User');
  await User.updateOne(
    { _id: account._id, status: 'suspended', suspendedUntil: { $lte: new Date() } },
    { $set: { status: 'active', suspendedUntil: null, moderationReason: '' } }
  );
  account.status = 'active';
  account.suspendedUntil = null;
  account.moderationReason = '';
  return account;
}

/** Lifts every expired block. Returns how many accounts were reactivated. */
async function liftExpiredSuspensions() {
  const User = require('../models/User');
  const res = await User.updateMany(
    { status: 'suspended', suspendedUntil: { $lte: new Date() } },
    { $set: { status: 'active', suspendedUntil: null, moderationReason: '' } }
  );
  return res.modifiedCount || 0;
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** The message a blocked / removed / disabled account sees, and its error code. */
function blockedProblem(account) {
  const reason = account.moderationReason ? ` Reason: ${account.moderationReason}` : '';
  if (account.status === 'suspended') {
    const until = account.suspendedUntil ? ` until ${dateFmt.format(account.suspendedUntil)}` : '';
    return { message: `Your account is temporarily blocked${until}.${reason}`, code: 'ACCOUNT_SUSPENDED' };
  }
  if (account.status === 'banned') {
    return { message: `Your account has been removed by an admin.${reason} Please contact the admin if you think this is a mistake.`, code: 'ACCOUNT_BANNED' };
  }
  return { message: `Your account has been ${account.status}. Please contact the admin.`, code: `ACCOUNT_${String(account.status).toUpperCase()}` };
}

module.exports = { isExpiredSuspension, refreshSuspension, liftExpiredSuspensions, blockedProblem };
