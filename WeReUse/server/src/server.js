const { PORT, SMTP_HOST } = require('./config/env');
const connectDB = require('./config/db');
const { initIndexes } = connectDB;
const app = require('./app');
const User = require('./models/User');
const Admin = require('./models/Admin');
const PendingRegistration = require('./models/PendingRegistration');
const { backfillRegKeys } = require('./utils/backfillRegKeys');
const { purgeExpiredPendingRegistrations } = require('./utils/pendingRegistrations');
const Notification = require('./models/Notification');
const AdminActionLog = require('./models/AdminActionLog');

async function start() {
  await connectDB();
  // Make sure the unique indexes (email, universityRegNumber) exist before accepting traffic.
  // Older accounts get their registration-number key BEFORE the unique index is built
  const { duplicates } = await backfillRegKeys([
    { name: 'users', collection: User.collection },
    { name: 'admins', collection: Admin.collection },
  ]);
  if (duplicates.length > 0) {
    console.warn('\nWarning: these old accounts share a registration number with another account. Please review them in Compass:');
    duplicates.forEach((d) => console.warn(`  - ${d.collection}: ${d.universityRegNumber} (id ${d.id})`));
    console.warn('');
  }

  await initIndexes([User, Admin, PendingRegistration, Notification, AdminActionLog]);

  if (!SMTP_HOST) {
    console.warn('E-mail: SMTP is not configured, so verification codes are PRINTED in this terminal instead of being e-mailed.');
    console.warn('        To send real e-mails, set SMTP_HOST / SMTP_USER / SMTP_PASS in server/.env (see README).\n');
  }

  // Remove expired sign-ups (and their stored ID card) now and every 10 minutes
  const sweep = () =>
    purgeExpiredPendingRegistrations().catch((err) => console.error('Clean-up of expired sign-ups failed:', err.message));
  sweep();
  setInterval(sweep, 10 * 60 * 1000).unref();

  // Admins used to be stored inside `users`. Point out anything left over from that version.
  try {
    const legacy = await User.collection.countDocuments({ role: 'admin' });
    if (legacy > 0) {
      console.warn(`\nNote: ${legacy} old admin account(s) are still stored in "users".`);
      console.warn('Run  npm run seed:admin  once to move your admin into the new "admins" collection.\n');
    }
  } catch (err) {
    console.error('Could not check for old admin accounts:', err.message);
  }

  const server = app.listen(PORT, () => {
    console.log(`WeReUse API running on http://localhost:${PORT}  (health: /api/health)`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\nPort ${PORT} is already in use. Change PORT in server/.env (and the proxy in client/vite.config.js).\n`);
    } else {
      console.error(err);
    }
    process.exit(1);
  });

  const shutdown = (signal) => {
    console.log(`\n${signal} received - shutting down...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason));

start().catch((err) => {
  console.error('Failed to start the server:', err.message);
  process.exit(1);
});
