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

// Posting products: stops one account flooding the marketplace with listings and uploads
exports.listingCreateLimiter = make(
  60 * 60 * 1000,
  30,
  'You are posting too quickly. Please try again in a little while.'
);

// Chat. Limited per logged-in student (not per network address), so a whole campus on one Wi-Fi is not affected.
const perStudent = (req) => (req.user ? String(req.user._id) : req.ip);

// Sending messages and offers
exports.messageLimiter = make(60 * 1000, 40, 'You are sending messages too quickly. Please wait a moment.', { keyGenerator: perStudent });

// Opening chats with many different sellers (stops mass-messaging)
exports.startChatLimiter = make(60 * 60 * 1000, 40, 'You have opened many chats recently. Please try again in a little while.', { keyGenerator: perStudent });

// The complaint box: enough for real problems, not for flooding the admins
exports.complaintLimiter = make(24 * 60 * 60 * 1000, 10, 'You have sent many complaints today. Please wait for the admins to respond.', { keyGenerator: perStudent });

// Reporting other students, and rating from profiles
exports.reportLimiter = make(24 * 60 * 60 * 1000, 20, 'You have sent many reports today. Please wait for the admins to review them.', { keyGenerator: perStudent });
exports.ratingLimiter = make(60 * 60 * 1000, 60, 'You are rating too quickly. Please try again in a little while.', { keyGenerator: perStudent });
