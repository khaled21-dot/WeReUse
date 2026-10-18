/**
 * Sends ONE real test e-mail using the SMTP settings in server/.env.
 *
 *   npm run test:mail -- your.address@gmail.com
 *
 * It prints the exact SMTP error if something is wrong (wrong app password, blocked port, ...).
 */
const nodemailer = require('nodemailer');
const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, MAIL_FROM } = require('../config/env');

(async () => {
  const to = process.argv[2] || SMTP_USER;
  if (!SMTP_HOST) {
    console.error('SMTP_HOST is empty in server/.env - nothing to test. See the SMTP_* lines in .env.example.');
    process.exit(1);
  }
  if (!to) {
    console.error('Usage: npm run test:mail -- someone@example.com');
    process.exit(1);
  }
  console.log(`Connecting to ${SMTP_HOST}:${SMTP_PORT} (secure=${SMTP_SECURE}) as ${SMTP_USER || '(no login)'} ...`);
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
  try {
    await transport.verify();
    console.log('SMTP login OK. Sending test message ...');
    const info = await transport.sendMail({
      from: MAIL_FROM,
      to,
      subject: 'WeReUse SMTP test',
      text: 'If you can read this, WeReUse can send verification codes.',
    });
    console.log(`Sent to ${to}  (id ${info.messageId}). Check the inbox AND the spam folder.`);
  } catch (err) {
    console.error('FAILED:', err.code || '', err.message);
    if (err.code === 'EAUTH') console.error('-> Wrong username or password. For Gmail you need a 16-letter APP PASSWORD, not your normal password.');
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNECTION') console.error('-> Cannot reach the SMTP server. Check SMTP_HOST/SMTP_PORT, your internet, or try port 465 with SMTP_SECURE=true.');
    process.exit(1);
  }
})();