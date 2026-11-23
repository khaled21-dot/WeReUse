'use strict';
/**
 * Automatic ID-card verification.
 *
 *   register / resubmit  ->  enqueue(userId)  ->  one card at a time:
 *       read the photo -> decide() -> approve / reject the student, or leave "pending" for an admin
 *
 * It runs in the background, so signing up is never slowed down; the dashboard already refreshes
 * itself while a student is pending. A student is only ever changed while still "pending" and with
 * the same ID photo, so it can never overwrite an admin's decision or a newer upload.
 */
const fs = require('fs');
const path = require('path');
const User = require('../../models/User');
const Notification = require('../../models/Notification');
const AdminActionLog = require('../../models/AdminActionLog');
const env = require('../../config/env');
const { ID_DIR } = require('../fileStore');
const { readIdCard, orientationsFor } = require('./idReader');
const { decide, checkFormat } = require('./decide');

const decideOptions = () => ({
  minNameScore: env.AUTO_VERIFY_MIN_NAME_SCORE,
  keywords: env.UNIVERSITY_KEYWORDS,
  regPattern: env.UNIVERSITY_REG_PATTERN,
  onUncertain: env.AUTO_VERIFY_ON_UNCERTAIN,
  requireUniversity: env.AUTO_VERIFY_REQUIRE_UNIVERSITY,
});

const REG_POINTS = { exact: 2, near: 1, none: 0 };
/** How good a (not approved) reading was: the clearest one decides what the admin / student is told. */
const quality = (outcome, reading) => {
  const c = outcome.checks || {};
  return (REG_POINTS[c.regNumber] || 0) * 100 + (c.nameScore || 0) * 50 + (c.readable ? 20 : 0) + (Number(reading.confidence) || 0) / 10;
};

/**
 * Reads the card the way it was uploaded and, if that is not a clear approval, turned sideways and
 * upside down as well (phone photos are often rotated). Stops at the first approval; otherwise the
 * clearest reading decides.
 */
async function checkCard(buffer, student, options) {
  let best = null;
  for (const orientation of orientationsFor(buffer)) {
    const reading = await readIdCard(buffer, { orientation });
    const outcome = decide(reading, student, options);
    if (outcome.decision === 'approved') return outcome;
    const score = quality(outcome, reading);
    if (!best || score > best.score) best = { outcome, score };
  }
  return best.outcome;
}

const enabled = () => env.AUTO_VERIFY;

// ---------- the decision for one student ----------
async function processUser(userId) {
  // Claim it: only a pending student whose check is waiting. Two workers can never take the same one.
  const user = await User.findOneAndUpdate(
    { _id: userId, verificationStatus: 'pending', 'autoVerification.state': { $in: ['queued', null] } },
    { $set: { 'autoVerification.state': 'processing' } },
    { new: true }
  );
  if (!user) return null;

  const student = { name: user.name, regNumber: user.universityRegNumber };
  const options = decideOptions();
  let outcome;
  let counted = true;

  const attemptsSoFar = (user.autoVerification && user.autoVerification.attempts) || 0;
  if (attemptsSoFar >= env.AUTO_VERIFY_MAX_ATTEMPTS) {
    // too many automatic tries: an admin decides
    counted = false;
    outcome = {
      decision: 'review',
      code: 'too_many_attempts',
      reason: '',
      summary: `Auto-check skipped: this student already had ${attemptsSoFar} automatic checks.`,
      checks: {},
    };
  } else {
    outcome = checkFormat(student.regNumber, options); // an impossible number needs no photo
    if (!outcome) {
      const file = path.join(ID_DIR, path.basename(user.idCardImageUrl || ''));
      outcome = await checkCard(await fs.promises.readFile(file), student, options);
    }
  }
  return applyOutcome(user, outcome, counted);
}

async function applyOutcome(user, outcome, counted) {
  const now = new Date();
  const set = {
    'autoVerification.state': 'done',
    'autoVerification.decision': outcome.decision,
    'autoVerification.summary': String(outcome.summary || '').slice(0, 300),
    'autoVerification.processedAt': now,
    'autoVerification.checks.readable': outcome.checks.readable ?? null,
    'autoVerification.checks.regNumber': outcome.checks.regNumber ?? null,
    'autoVerification.checks.nameScore': outcome.checks.nameScore ?? null,
    'autoVerification.checks.university': outcome.checks.university ?? null,
  };
  if (outcome.decision === 'approved') {
    Object.assign(set, { verificationStatus: 'verified', rejectionReason: '', reviewedAt: now, reviewedBy: null });
  } else if (outcome.decision === 'rejected') {
    Object.assign(set, { verificationStatus: 'rejected', rejectionReason: outcome.reason.slice(0, 500), reviewedAt: now, reviewedBy: null });
  }

  // the filter keeps this safe: still pending, still the same photo
  const result = await User.updateOne(
    { _id: user._id, verificationStatus: 'pending', idCardImageUrl: user.idCardImageUrl },
    { $set: set, ...(counted ? { $inc: { 'autoVerification.attempts': 1 } } : {}) }
  );
  if (result.matchedCount === 0) return null; // an admin or a newer upload got there first

  if (outcome.decision !== 'review') {
    const approved = outcome.decision === 'approved';
    try {
      await Promise.all([
        AdminActionLog.create({
          automatic: true,
          actionType: approved ? 'auto_approve_user' : 'auto_reject_user',
          targetType: 'user',
          targetId: user._id,
          details: (approved ? outcome.summary : outcome.reason).slice(0, 500),
        }),
        Notification.create({
          userId: user._id,
          type: 'verification_status',
          relatedId: user._id,
          message: approved
            ? 'Your student verification was approved automatically. You now have full access to WeReUse.'
            : `Your student verification could not be approved: ${outcome.reason}`.slice(0, 300),
        }),
      ]);
    } catch (err) {
      console.error('Could not write audit log / notification:', err.message); // the decision itself is already saved
    }
  }
  return outcome.decision;
}

/** The check could not run (no OCR package, unreadable file, ...): leave the student to an admin. */
async function markFailed(userId, err) {
  const why = err.appCode === 'OCR_NOT_INSTALLED' ? 'the OCR package is not installed' : String(err.message || 'unknown error').slice(0, 120);
  await User.updateOne(
    { _id: userId, verificationStatus: 'pending', 'autoVerification.state': 'processing' },
    {
      $set: {
        'autoVerification.state': 'failed',
        'autoVerification.decision': 'review',
        'autoVerification.summary': `Auto-check could not run (${why}). An admin needs to review this ID card.`,
        'autoVerification.processedAt': new Date(),
      },
    }
  );
}

// ---------- a simple one-at-a-time queue ----------
const waiting = [];
const inQueue = new Set();
let draining = null;

async function drain() {
  while (waiting.length) {
    const id = waiting.shift();
    try {
      await processUser(id);
    } catch (err) {
      console.error(`Automatic ID check failed for ${id}: ${err.message}`);
      await markFailed(id, err).catch(() => {});
    } finally {
      inQueue.delete(id);
    }
  }
}

function kick() {
  if (draining) return;
  draining = drain().finally(() => {
    draining = null;
    if (waiting.length) kick();
  });
}

/** Adds a student to the queue. Does nothing when automatic verification is off. */
function enqueue(userId) {
  if (!enabled()) return;
  const id = String(userId);
  if (inQueue.has(id)) return;
  inQueue.add(id);
  waiting.push(id);
  kick();
}

/** Resolves when nothing is waiting or running (used by tests). */
async function whenIdle() {
  while (draining) await draining;
}

/**
 * At start-up: pick up pending students that were never checked (sign-ups made while the server was
 * off, accounts from before this feature, or a crash in the middle of a check).
 */
async function resumePending() {
  if (!enabled()) return 0;
  await User.updateMany(
    { verificationStatus: 'pending', 'autoVerification.state': 'processing' },
    { $set: { 'autoVerification.state': 'queued' } }
  );
  const users = await User.find({
    verificationStatus: 'pending',
    idCardImageUrl: { $ne: null },
    'autoVerification.state': { $in: ['queued', null] },
  })
    .sort({ verificationSubmittedAt: 1 })
    .limit(500)
    .select('_id')
    .lean();
  users.forEach((u) => enqueue(u._id));
  return users.length;
}

module.exports = { enabled, enqueue, whenIdle, resumePending, processUser };