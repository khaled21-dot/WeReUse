const multer = require('multer');
const { MAX_UPLOAD_MB } = require('../config/env');

const DUPLICATE_MESSAGES = {
  email: 'An account with this email already exists.',
  universityRegNumber: 'This university registration number is already registered.',
  regKey: 'This university registration number is already registered.',
  phone: 'This phone number is already registered.',
  _id: 'This student has already been made an admin.',
  nameKey: 'A category with this name already exists.',
};

const notFound = (req, res, next) => {
  const err = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  err.statusCode = 404;
  err.isOperational = true;
  next(err);
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  let status = err.statusCode || 500;
  let message = err.message || 'Something went wrong.';
  let code = err.appCode;
  let errors = err.fieldErrors;

  if (err instanceof multer.MulterError) {
    const forListing = String(req.originalUrl || '').includes('/listings');
    const field = forListing ? 'images' : 'idCard';
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    code = err.code;
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = `${forListing ? 'A photo is' : 'The image is'} too large. Maximum size is ${MAX_UPLOAD_MB} MB.`;
      errors = { [field]: message };
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      message = 'You can add up to 5 photos.';
      errors = { [field]: message };
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      message = forListing
        ? 'Unexpected file field. Upload photos as "images" (5 at most).'
        : 'Unexpected file field. Upload the ID card as "idCard".';
      errors = { [field]: message };
    } else {
      message = 'The upload could not be processed. Please try again.';
    }
  } else if (err.name === 'ValidationError' && err.errors) {
    // Mongoose schema validation
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Please fix the highlighted fields.';
    errors = Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v.message]));
  } else if (err.name === 'CastError') {
    status = 400;
    message = 'Invalid identifier.';
  } else if (err.code === 11000) {
    // Unique index violation (race condition safety net)
    status = 409;
    code = 'DUPLICATE';
    const fields = Object.keys(err.keyPattern || err.keyValue || {});
    errors = {};
    fields.forEach((f) => {
      errors[f] = DUPLICATE_MESSAGES[f] || 'This value is already in use.';
    });
    message = errors[fields[0]] || 'This value is already in use.';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'The request body is not valid JSON.';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'The request is too large.';
  } else if (!err.isOperational) {
    console.error('Unexpected error:', err);
    status = 500;
    message = 'Something went wrong on our side. Please try again.';
    code = undefined;
    errors = undefined;
  }

  const body = { success: false, message };
  if (code) body.code = code;
  if (errors) body.errors = errors;
  return res.status(status).json(body);
};

module.exports = { notFound, errorHandler };