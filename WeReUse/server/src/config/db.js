const mongoose = require('mongoose');
const { MONGODB_URI } = require('./env');

mongoose.set('strictQuery', true);

// Hide credentials if the URI contains them (mongodb://user:pass@host)
const redact = (uri) => uri.replace(/\/\/([^@/]+)@/, '//***@');

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    const { host, port, name } = mongoose.connection;
    console.log(`MongoDB connected -> ${host}:${port}/${name}`);
  } catch (err) {
    console.error(`\nCould not connect to MongoDB at ${redact(MONGODB_URI)}`);
    console.error('  - Is MongoDB running?  Try:  brew services start mongodb-community@7.0');
    console.error('  - Check MONGODB_URI in server/.env (use 127.0.0.1 instead of localhost)\n');
    throw err;
  }
}

/**
 * Builds the indexes (unique email / registration number). If an old "users" collection
 * with incompatible test data exists (e.g. documents added by hand in Compass), MongoDB
 * refuses to build the unique index - explain how to fix it instead of a cryptic error.
 */
async function initIndexes(models) {
  try {
    await Promise.all(models.map((m) => m.init()));
  } catch (err) {
    if (err.code === 11000 || /index/i.test(err.message)) {
      console.error('\nCould not create the database indexes: ' + err.message);
      console.error('  This usually means the "' + mongoose.connection.name + '" database already has a "users"');
      console.error('  collection with test documents (for example ones you added by hand in Compass).');
      console.error('  Fix: open Compass, delete those test documents (or drop the "users" collection), then start again.\n');
    }
    throw err;
  }
}

module.exports = connectDB;
module.exports.initIndexes = initIndexes;
