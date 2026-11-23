const path = require('path');

// Loads server/.env (dotenv never overrides variables that are already set,
// which is what lets the test-suite point at a separate database).
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';
const isTest = NODE_ENV === 'test';

const int = (name, fallback) => {
  const n = parseInt(process.env[name], 10);
  return Number.isFinite(n) ? n : fallback;
};

const bool = (name, fallback = false) => {
  const v = String(process.env[name] ?? '').trim().toLowerCase();
  return v ? ['1', 'true', 'yes', 'on'].includes(v) : fallback;
};
const decimal = (name, fallback, min, max) => {
  const n = parseFloat(process.env[name]);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const list = (name) =>
  String(process.env[name] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
// Optional: a regular expression the registration number (letters and digits only, e.g. 24135032) must match
const regPattern = (() => {
  const raw = String(process.env.UNIVERSITY_REG_PATTERN || '').trim();
  if (!raw) return null;
  try {
    return new RegExp(raw);
  } catch {
    throw new Error('UNIVERSITY_REG_PATTERN in server/.env is not a valid regular expression.');
  }
})();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 16) {
  throw new Error(
    'JWT_SECRET is missing or too short (min 16 characters). ' +
      'Copy server/.env.example to server/.env and set a long random JWT_SECRET.'
  );
}
if (isProd && JWT_SECRET.toLowerCase().includes('change-me')) {
  throw new Error('Refusing to start in production with the placeholder JWT_SECRET.');
}

const serverRoot = path.resolve(__dirname, '../..');

module.exports = Object.freeze({
  NODE_ENV,
  isProd,
  isTest,
  PORT: int('PORT', 5050),
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/wereuse',
  JWT_SECRET,
  JWT_EXPIRES_DAYS: int('JWT_EXPIRES_DAYS', 7),
  COOKIE_NAME: process.env.COOKIE_NAME || 'wereuse_token',
  CLIENT_URLS: (process.env.CLIENT_URL || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  BCRYPT_ROUNDS: isTest ? 4 : int('BCRYPT_ROUNDS', 12),
  // E-mail (verification codes). Leave SMTP_HOST empty in development: the code is then printed in this
  // terminal instead of being e-mailed.
  SMTP_HOST: (process.env.SMTP_HOST || '').trim(),
  SMTP_PORT: int('SMTP_PORT', 587),
  SMTP_SECURE: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true', // true for port 465
  SMTP_USER: (process.env.SMTP_USER || '').trim(),
  // Gmail shows app passwords in groups of four letters with spaces; the spaces are not part of it
  SMTP_PASS: /gmail/i.test(process.env.SMTP_HOST || '') ? (process.env.SMTP_PASS || '').replace(/\s+/g, '') : process.env.SMTP_PASS || '',
  MAIL_FROM: (process.env.MAIL_FROM || 'WeReUse <no-reply@wereuse.local>').trim(),
  EMAIL_CODE_TTL_MINUTES: int('EMAIL_CODE_TTL_MINUTES', 10),
  PENDING_REGISTRATION_TTL_MINUTES: int('PENDING_REGISTRATION_TTL_MINUTES', 60),
  MAX_UPLOAD_MB: int('MAX_UPLOAD_MB', 5),
  // ---- Automatic ID-card verification (replaces the manual admin check) ----
  AUTO_VERIFY: bool('AUTO_VERIFY', false),
  // What to do when the card is not clearly right or wrong: "review" = an admin decides, "reject" = ask the student to try again
  AUTO_VERIFY_ON_UNCERTAIN: String(process.env.AUTO_VERIFY_ON_UNCERTAIN || 'review').trim().toLowerCase() === 'reject' ? 'reject' : 'review',
  AUTO_VERIFY_MIN_NAME_SCORE: decimal('AUTO_VERIFY_MIN_NAME_SCORE', 0.75, 0.3, 1),
  // After this many automatic checks of the same student, an admin decides (stops people trying again and again)
  AUTO_VERIFY_MAX_ATTEMPTS: Math.max(1, int('AUTO_VERIFY_MAX_ATTEMPTS', 3)),
  AUTO_VERIFY_OCR_TIMEOUT_SECONDS: Math.max(10, int('AUTO_VERIFY_OCR_TIMEOUT_SECONDS', 90)),
  UNIVERSITY_KEYWORDS: list('UNIVERSITY_KEYWORDS'), // words that identify the university on the card, e.g. daffodil
  // true = the keyword must be read for an automatic approval (strict). Default false: OCR often cannot read
  // the stylised logo, which used to send every correct card to an admin.
  AUTO_VERIFY_REQUIRE_UNIVERSITY: bool('AUTO_VERIFY_REQUIRE_UNIVERSITY', false),
  UNIVERSITY_REG_PATTERN: regPattern,
  // Private folder for ID card images. It is NOT served statically.
  STORAGE_DIR: process.env.STORAGE_DIR
    ? path.resolve(serverRoot, process.env.STORAGE_DIR)
    : path.join(serverRoot, 'storage'),
});