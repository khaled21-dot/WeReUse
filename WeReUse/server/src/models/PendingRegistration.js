const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * A registration that is waiting for its e-mail code. The real student account (`users`) is only
 * created once the code is confirmed, so unverified sign-ups can never occupy an e-mail address
 * or a university registration number. Expired entries (and their ID card file) are deleted
 * automatically - see utils/pendingRegistrations.js.
 */
const pendingRegistrationSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    passwordHash: { type: String, required: true }, // bcrypt hash, never the password
    department: { type: String, default: '' },
    batch: { type: String, default: '' },
    universityRegNumber: { type: String, required: true },
    regKey: { type: String, required: true },
    idCardImageUrl: { type: String, required: true }, // private file, already stored
    codeHash: { type: String, required: true }, //       keyed hash of the 6-digit code
    codeExpiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 }, //           wrong-code guesses so far
    lastSentAt: { type: Date, required: true },
    resendCount: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true }, //        when the whole pending registration is discarded
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

pendingRegistrationSchema.index({ expiresAt: 1 });

module.exports = mongoose.model('PendingRegistration', pendingRegistrationSchema);
