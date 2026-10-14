/**
 * Accounts created before "one account per registration number" have no `regKey`. This fills it in
 * (once, at start-up, BEFORE the unique index is built). If two old accounts turn out to share a number
 * (for example "241-35-032" and "24135032"), the later one gets a marked key so the index can still be
 * built, and a warning lists them so they can be sorted out by hand.
 */
const { toRegKey } = require('./regKey');

async function backfillRegKeys(collections) {
  const duplicates = [];
  for (const { name, collection } of collections) {
    const missing = await collection.find({ regKey: { $exists: false } }).toArray();
    if (missing.length === 0) continue;

    const withKey = await collection.find({ regKey: { $exists: true } }).toArray();
    const taken = new Set(withKey.map((d) => d.regKey));

    for (const doc of missing) {
      let key = toRegKey(doc.universityRegNumber);
      if (!key || taken.has(key)) {
        duplicates.push({ collection: name, id: String(doc._id), universityRegNumber: doc.universityRegNumber });
        key = `${key || 'MISSING'}__DUPLICATE__${String(doc._id)}`;
      }
      taken.add(key);
      await collection.updateOne({ _id: doc._id }, { $set: { regKey: key } });
    }
  }
  return { duplicates };
}

module.exports = { backfillRegKeys };
