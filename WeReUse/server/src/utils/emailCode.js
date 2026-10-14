/** 6-digit e-mail verification codes: generation, hashing, expiry and attempt limits. */
const crypto = require('crypto');
const { JWT_SECRET, EMAIL_CODE_TTL_MINUTES } = require('../config/env');

const CODE_TTL_MINUTES = EMAIL_CODE_TTL_MINUTES;
const CODE_TTL_MS = CODE_TTL_MINUTES * 60 * 1000;
const MAX_ATTEMPTS = 5; //            wrong guesses allowed per code
const RESEND_COOLDOWN_SECONDS = 60; // minimum time between two e-mails to the same address
const MAX_RESENDS = 5; //             new codes allowed per registration

// Only a keyed hash of the code is stored, never the code itself.
const hashCode = (code) => crypto.createHmac('sha256', JWT_SECRET).update(String(code)).digest('hex');

/** { code, codeHash, expiresAt, sentAt } - `code` is e-mailed and then forgotten */
function newCode(now = Date.now()) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  return { code, codeHash: hashCode(code), expiresAt: new Date(now + CODE_TTL_MS), sentAt: new Date(now) };
}

function codeMatches(code, storedHash) {
  if (!storedHash) return false;
  const a = Buffer.from(hashCode(code), 'hex');
  const b = Buffer.from(String(storedHash), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Seconds left before another code may be sent (0 = allowed now). */
function cooldownRemainingSeconds(sentAt, now = Date.now()) {
  if (!sentAt) return 0;
  const left = RESEND_COOLDOWN_SECONDS - (now - new Date(sentAt).getTime()) / 1000;
  return left > 0 ? Math.ceil(left) : 0;
}

/** "rahim.uddin@example.com" -> "ra***@example.com" */
function maskEmail(email) {
  const [local, domain] = String(email).split('@');
  if (!domain) return email;
  return `${local.slice(0, Math.min(2, local.length))}***@${domain}`;
}

module.exports = {
  CODE_TTL_MINUTES,
  MAX_ATTEMPTS,
  MAX_RESENDS,
  RESEND_COOLDOWN_SECONDS,
  newCode,
  codeMatches,
  cooldownRemainingSeconds,
  maskEmail,
};
