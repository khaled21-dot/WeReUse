const PendingRegistration = require('../models/PendingRegistration');
const { deleteIdCard } = require('./fileStore');

/**
 * Deletes sign-ups whose time ran out together with their stored ID card file.
 * The database row is removed FIRST and atomically: if a student confirms their code at the very same
 * moment, exactly one of the two wins, so a file that now belongs to a real account is never deleted.
 */
async function purgeExpiredPendingRegistrations(now = new Date(), limit = 200) {
  const expired = await PendingRegistration.find({ expiresAt: { $lt: now } }).limit(limit);
  let removed = 0;
  for (const doc of expired) {
    const result = await PendingRegistration.deleteOne({ _id: doc._id, expiresAt: { $lt: now } });
    if (result.deletedCount === 1) {
      await deleteIdCard(doc.idCardImageUrl);
      removed += 1;
    }
  }
  return removed;
}

module.exports = { purgeExpiredPendingRegistrations };
