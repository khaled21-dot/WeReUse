const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { BCRYPT_ROUNDS } = require('../config/env');
const { toRegKey } = require('../utils/regKey');

const { Schema } = mongoose;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^01[3-9]\d{8}$/; // Bangladeshi mobile number, stored as 01XXXXXXXXX

/**
 * Administrators live in their own collection, completely separate from students (users).
 * One admin -> many adminactionlogs (adminactionlogs.adminId refers to admins._id).
 */
const adminSchema = new Schema(
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
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      unique: true,
      trim: true,
      match: [PHONE_RE, 'Enter a valid mobile number, for example 01712345678'],
    },
    universityRegNumber: {
      type: String,
      required: [true, 'University registration number is required'],
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: 25,
    },
    // Letters+digits only (ADMIN-0001 == ADMIN0001). UNIQUE: one account per university registration number.
    regKey: { type: String, required: true, unique: true },
    // Reference to the PRIVATE ID card photo. Removed from every JSON response (see toJSON).
    idCardImageUrl: { type: String, required: [true, 'University ID card photo is required'] },
    passwordHash: { type: String, required: true, select: false }, // bcrypt hash, never the password

    // The golden "Admin" badge shown next to the admin's name in the interface
    adminBadge: {
      label: { type: String, default: 'Admin', trim: true, maxlength: 20 },
      color: { type: String, default: '#FFD700', match: [/^#[0-9A-Fa-f]{6}$/, 'Badge colour must look like #FFD700'] },
    },

    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
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

adminSchema.pre('validate', function setRegKey() {
  if (this.universityRegNumber) this.regKey = toRegKey(this.universityRegNumber);
});

// Lets the frontend and the middleware treat both account types the same way.
adminSchema.virtual('role').get(() => 'admin');

adminSchema.statics.hashPassword = function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
};

// Needs the document to be loaded with .select('+passwordHash')
adminSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

module.exports = mongoose.model('Admin', adminSchema);
