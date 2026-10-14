const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_EXPIRES_DAYS, COOKIE_NAME, isProd } = require('../config/env');

const ALGORITHM = 'HS256';

// type is "student" (collection users) or "admin" (collection admins)
const signToken = (accountId, type) =>
  jwt.sign({ id: String(accountId), type }, JWT_SECRET, {
    algorithm: ALGORITHM,
    expiresIn: `${JWT_EXPIRES_DAYS}d`,
  });

const verifyToken = (token) => jwt.verify(token, JWT_SECRET, { algorithms: [ALGORITHM] });

// httpOnly => JavaScript in the browser can never read the token (protects against XSS theft)
// sameSite=lax => the cookie is not sent on cross-site POSTs (protects against CSRF)
const cookieOptions = () => ({
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
  path: '/',
});

const setAuthCookie = (res, token) =>
  res.cookie(COOKIE_NAME, token, {
    ...cookieOptions(),
    maxAge: JWT_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
  });

const clearAuthCookie = (res) => res.clearCookie(COOKIE_NAME, cookieOptions());

module.exports = { signToken, verifyToken, setAuthCookie, clearAuthCookie };
