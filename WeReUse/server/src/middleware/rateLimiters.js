const rateLimit = require('express-rate-limit');
const { isTest } = require('../config/env');

const make = (windowMs, limit, message, extra = {}) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => isTest,
    message: { success: false, code: 'RATE_LIMITED', message },
    ...extra,
  });

// General protection for the whole API
exports.apiLimiter = make(
  15 * 60 * 1000,
  1000,
  'Too many requests. Please slow down and try again in a few minutes.'
);

// Only FAILED logins count, so normal users are never locked out (brute-force protection)
exports.loginLimiter = make(
  15 * 60 * 1000,
  30,
  'Too many failed login attempts. Please wait 15 minutes and try again.',
  { skipSuccessfulRequests: true }
);

// Slows down mass fake-account creation
exports.registerLimiter = make(
  60 * 60 * 1000,
  30,
  'Too many sign-ups from this network. Please try again in an hour.'
);

// Sending e-mails: stops people using us to flood somebody's inbox with codes
exports.codeRequestLimiter = make(
  60 * 60 * 1000,
  20,
  'Too many verification e-mails were requested from this network. Please try again in an hour.'
);

// Guessing codes (each code also locks itself after 5 wrong attempts)
exports.codeVerifyLimiter = make(
  15 * 60 * 1000,
  40,
  'Too many code attempts. Please wait a few minutes and try again.'
);

// Only FAILED password changes count (someone trying passwords on a logged-in session)
exports.passwordChangeLimiter = make(
  15 * 60 * 1000,
  10,
  'Too many failed attempts. Please wait 15 minutes and try again.',
  { skipSuccessfulRequests: true }
);
