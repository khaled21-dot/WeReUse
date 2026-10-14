const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { BCRYPT_ROUNDS } = require('../config/env');
const { toRegKey } = require('../utils/regKey');

const { Schema } = mongoose;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const userSchema = new Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, minlength: 2, maxlength: 80 },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      match: [EMAIL_RE, 'Enter a valid email address'],
    },
    passwordHash: { type: String, required: true, select: false }, // bcrypt hash, never the password
    department: { type: String, trim: true, maxlength: 80, default: '' },
    batch: { type: String, trim: true, maxlength: 20, default: '' },

    // ---- University verification ----
    universityRegNumber: {
      type: String,
      required: [true, 'University registration number is required'],
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: 25,
    },
    // Letters+digits only (241-35-032 == 24135032). UNIQUE: this is what guarantees one account per number.
    regKey: { type: String, required: true, unique: true },
    // Reference to the PRIVATE file (local file name now; a Cloudinary/S3 key later).
    // It is stripped from every JSON response - see toJSON below.
    idCardImageUrl: { type: String, default: null },
    verificationStatus: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending',
    },
    rejectionReason: { type: String, default: '', maxlength: 500 },
    verificationSubmittedAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null }, // the admin who decided

    // ---- Account ----
    rating: { type: Number, default: 0, min: 0, max: 5 },
    status: { type: String, enum: ['active', 'suspended', 'banned'], default: 'active' },
    lastLoginAt: { type: Date, default: null },

    // A pending e-mail change: the new address only becomes the login e-mail after its code is confirmed
    emailChange: {
      newEmail: { type: String, lowercase: true, trim: true, default: null },
      codeHash: { type: String, default: null },
      expiresAt: { type: Date, default: null },
      attempts: { type: Number, default: 0 },
      sentAt: { type: Date, default: null },
    },
    emailVerifiedAt: { type: Date, default: null }, // null for accounts created before e-mail verification existed
    passwordChangedAt: { type: Date, default: null }, // logins issued before this moment stop working
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform(doc, ret) {
        // Never leak secrets or the private file reference.
        ret.hasIdCard = Boolean(ret.idCardImageUrl);
        ret.pendingEmail = (ret.emailChange && ret.emailChange.newEmail) || null;
        delete ret.emailChange;
        delete ret.regKey;
        delete ret.passwordChangedAt;
        delete ret.idCardImageUrl;
        delete ret.passwordHash;
        delete ret._id;
        return ret;
      },
    },
  }
);

userSchema.pre('validate', function setRegKey() {
  if (this.universityRegNumber) this.regKey = toRegKey(this.universityRegNumber);
});

// Every document in `users` is a student. (Administrators are stored in the separate `admins` collection.)
userSchema.virtual('role').get(() => 'student');

// "Verified Student" badge is derived from the verification status (FR6).
userSchema.virtual('isVerifiedBadge').get(function isVerifiedBadge() {
  return this.verificationStatus === 'verified';
});

// Admin verification queue: filter by status, oldest submissions first.
userSchema.index({ verificationStatus: 1, verificationSubmittedAt: 1 });

userSchema.statics.hashPassword = function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
};

// Needs the document to be loaded with .select('+passwordHash')
userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

module.exports = mongoose.model('User', userSchema);
