const { PORT, SMTP_HOST, AUTO_VERIFY, AUTO_VERIFY_ON_UNCERTAIN } = require('./config/env');
const connectDB = require('./config/db');
const { initIndexes } = connectDB;
const app = require('./app');
const User = require('./models/User');
const Admin = require('./models/Admin');
const PendingRegistration = require('./models/PendingRegistration');
const { backfillRegKeys } = require('./utils/backfillRegKeys');
const { purgeExpiredPendingRegistrations } = require('./utils/pendingRegistrations');
const Notification = require('./models/Notification');
const Category = require('./models/Category');
const AdminActionLog = require('./models/AdminActionLog');
const { resumePending } = require('./utils/autoVerify/service');
const { ocrInstalled, shutdownReader } = require('./utils/autoVerify/idReader');
const Listing = require('./models/Listing');
const Conversation = require('./models/Conversation');
const Message = require('./models/Message');
const Rating = require('./models/Rating');
const Complaint = require('./models/Complaint');
const UserReport = require('./models/UserReport');
const { liftExpiredSuspensions } = require('./utils/moderation');
const realtime = require('./utils/realtime');

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

  await initIndexes([User, Admin, PendingRegistration, Category, Notification, AdminActionLog, Listing, Conversation, Message, Complaint, UserReport]);
  // Ratings changed shape over time: syncIndexes drops indexes the model no longer declares and builds the current ones
  await Rating.syncIndexes();

  // Temporary blocks end by themselves: reactivate expired ones now and every minute
  const unblock = () => liftExpiredSuspensions().catch((err) => console.error('Lifting expired blocks failed:', err.message));
  unblock();
  setInterval(unblock, 60 * 1000).unref();
  if (!SMTP_HOST) {
    console.warn('E-mail: SMTP is not configured, so verification codes are PRINTED in this terminal instead of being e-mailed.');
    console.warn('        To send real e-mails, set SMTP_HOST / SMTP_USER / SMTP_PASS in server/.env (see README).\n');
  }

  if (AUTO_VERIFY) {
    if (!ocrInstalled()) {
      console.warn('Automatic ID verification is ON, but the OCR package is missing. Run  npm install tesseract.js  in the server folder.');
      console.warn('Until then, new students stay "pending" for an admin to review.\n');
    }
    const waiting = await resumePending();
    console.log(
      `Automatic ID verification is ON (unsure cards: ${AUTO_VERIFY_ON_UNCERTAIN === 'reject' ? 'rejected' : 'sent to an admin'}). ${waiting} waiting student(s) queued.`
    );
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

  // Real-time chat (Socket.IO). Chat still works without it - messages then appear when the page refreshes.
  if (realtime.init(server)) {
    console.log('Real-time chat is ON (Socket.IO).');
  } else {
    console.warn('Real-time chat: the "socket.io" package is not installed, so messages will not appear instantly.');
    console.warn('               Run  npm install socket.io  in the server folder, then restart.\n');
  }

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
    shutdownReader().catch(() => {});
    realtime.shutdown().catch(() => {});
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