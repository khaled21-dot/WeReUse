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
  // Private folder for ID card images. It is NOT served statically.
  STORAGE_DIR: process.env.STORAGE_DIR
    ? path.resolve(serverRoot, process.env.STORAGE_DIR)
    : path.join(serverRoot, 'storage'),
});
