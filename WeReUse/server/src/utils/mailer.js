/**
 * Sends the verification e-mails.
 *  - SMTP_HOST set      -> a real e-mail is sent (Gmail, Brevo, Mailtrap ... any SMTP server)
 *  - SMTP_HOST empty    -> development mode: the e-mail is PRINTED in the server terminal
 *  - NODE_ENV=test      -> messages are collected in `outbox` so tests can read the code
 */
const nodemailer = require('nodemailer');
const AppError = require('./AppError');
const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, MAIL_FROM, EMAIL_CODE_TTL_MINUTES, isTest, isProd } = require('../config/env');

const outbox = []; // test-only: every message "sent" while NODE_ENV=test

let transport = null;
const getTransport = () => {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });
  }
  return transport;
};

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function buildMessage({ name, code, purpose }) {
  const change = purpose === 'change-email';
  const subject = change ? 'Confirm your new WeReUse email address' : 'Your WeReUse verification code';
  const intro = change
    ? 'Use this code to confirm your new email address on WeReUse:'
    : 'Welcome to WeReUse! Use this code to verify your email address:';
  const text =
    `Hi ${name},\n\n${intro}\n\n    ${code}\n\n` +
    `The code expires in ${EMAIL_CODE_TTL_MINUTES} minutes. If you did not ask for it, you can ignore this email: ` +
    'nobody can use your account without the code.\n\n- WeReUse';
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:auto;color:#10283A">` +
    `<h2 style="margin:0 0 12px">WeReUse</h2><p>Hi ${escapeHtml(name)},</p><p>${intro}</p>` +
    `<p style="font-size:32px;font-weight:700;letter-spacing:8px;background:#EAF5FC;padding:14px 18px;border-radius:10px;text-align:center">${code}</p>` +
    `<p style="color:#41596B">The code expires in ${EMAIL_CODE_TTL_MINUTES} minutes. If you did not ask for it, you can ignore this email: ` +
    `nobody can use your account without the code.</p></div>`;
  return { subject, text, html };
}

async function sendVerificationEmail({ to, name, code, purpose = 'register' }) {
  const message = { to, ...buildMessage({ name, code, purpose }) };

  if (isTest) {
    // tests can simulate an address that cannot be delivered to
    if (to.startsWith('bounce@')) throw new Error('Mailbox unavailable (simulated)');
    outbox.push(message);
    return;
  }

  if (!SMTP_HOST) {
    if (isProd) {
      throw new AppError('E-mail is not configured on the server (SMTP_HOST is empty).', 500, { code: 'EMAIL_NOT_CONFIGURED' });
    }
    // Development mode: show the code in the terminal so the flow can still be tried
    console.log('\n+---------------- DEV MODE: e-mail NOT sent (SMTP_HOST is empty) ----------------');
    console.log(`| To:      ${to}`);
    console.log(`| Subject: ${message.subject}`);
    console.log(`| CODE:    ${code}`);
    console.log('+----------------------------------------------------------------------------------\n');
    return;
  }

  await getTransport().sendMail({ from: MAIL_FROM, ...message });
}

/** Test helper: the newest 6-digit code sent to this address. */
function lastCodeFor(email) {
  for (let i = outbox.length - 1; i >= 0; i -= 1) {
    if (outbox[i].to === email) return outbox[i].text.match(/\b(\d{6})\b/)[1];
  }
  return null;
}

module.exports = { sendVerificationEmail, outbox, lastCodeFor };
