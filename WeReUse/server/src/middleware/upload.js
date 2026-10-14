const multer = require('multer');
const AppError = require('../utils/AppError');
const { MAX_UPLOAD_MB } = require('../config/env');

const ALLOWED_MIME = ['image/jpeg', 'image/png'];

// Memory storage: the file is only written to disk AFTER every check has passed.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 20, fieldSize: 10 * 1024 },
  fileFilter(req, file, cb) {
    if (ALLOWED_MIME.includes(file.mimetype)) return cb(null, true);
    return cb(
      new AppError('Only JPG or PNG images are allowed.', 400, {
        code: 'INVALID_FILE_TYPE',
        errors: { idCard: 'Only JPG or PNG images are allowed.' },
      })
    );
  },
});

// Expects the form field to be named "idCard"
exports.uploadIdCard = upload.single('idCard');
