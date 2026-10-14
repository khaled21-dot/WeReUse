/**
 * An error we expect and can safely show to the client.
 * extra.code   -> machine readable code (e.g. "NOT_VERIFIED")
 * extra.errors -> field level messages   (e.g. { email: "Already used" })
 */
class AppError extends Error {
  constructor(message, statusCode = 500, extra = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.isOperational = true;
    this.appCode = extra.code;
    this.fieldErrors = extra.errors;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

module.exports = AppError;
