/**
 * Integration tests for automatic ID-card verification (needs MongoDB; uses its own
 * "wereuse_autoverify_test" database). The ID card reader is replaced by a fake, so no OCR is needed.
 * Run with:  npm test
 */
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_AUTOVERIFY_TEST_URI || 'mongodb://127.0.0.1:27017/wereuse_autoverify_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret-1234';
process.env.AUTO_VERIFY = 'true';
process.env.AUTO_VERIFY_MAX_ATTEMPTS = '2';
process.env.AUTO_VERIFY_ON_UNCERTAIN = 'review';

const os = require('os');
const path = require('path');
process.env.STORAGE_DIR = path.join(os.tmpdir(), `wereuse-autoverify-test-storage-${process.pid}`);

const fs = require('fs');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');

const app = require('../src/app');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const Admin = require('../src/models/Admin');
const PendingRegistration = require('../src/models/PendingRegistration');
const Notification = require('../src/models/Notification');
const AdminActionLog = require('../src/models/AdminActionLog');
const { saveIdCard } = require('../src/utils/fileStore');
const { createPlaceholderIdCard } = require('../src/utils/placeholderIdCard');
const { lastCodeFor } = require('../src/utils/mailer');
const { setReader } = require('../src/utils/autoVerify/idReader');
const { whenIdle } = require('../src/utils/autoVerify/service');

const jpg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]), Buffer.alloc(300, 7)]);

// What the fake reader "sees" on the card
const cardFor = (name, reg) => ({ text: `DAFFODIL INTERNATIONAL UNIVERSITY\nStudent ID Card\nName: ${name.toUpperCase()}\nID: ${reg}\nDepartment: CSE`, confidence: 85 });
let seen = () => ({ text: '', confidence: 0 });
let reads = 0;
setReader(async () => {
  reads += 1;
  return seen();
});

let admin;
let counter = 0;

async function signUp(name = 'Khaled Mahmud Nahid') {
  counter += 1;
  const agent = request.agent(app);
  const email = `student${counter}@example.com`;
  const reg = `241-35-${String(100 + counter)}`;
  const form = agent.post('/api/auth/register');
  const fields = { name, email, password: 'Passw0rdOK', confirmPassword: 'Passw0rdOK', universityRegNumber: reg, department: 'CSE', batch: '42' };
  for (const [k, v] of Object.entries(fields)) form.field(k, v);
  form.attach('idCard', jpg(), { filename: 'id.jpg', contentType: 'image/jpeg' });
  assert.equal((await form).status, 202);
  const res = await agent.post('/api/auth/verify-email').send({ email, code: lastCodeFor(email) });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { agent, email, reg, name, id: res.body.data.user.id };
}

const me = async (s) => (await s.agent.get('/api/auth/me')).body.data.user;
const resubmit = (s, reg) => {
  const req = s.agent.post('/api/verification/resubmit');
  if (reg) req.field('universityRegNumber', reg);
  return req.attach('idCard', jpg(), { filename: 'id2.jpg', contentType: 'image/jpeg' });
};

before(async () => {
  await connectDB();
  assert.ok(mongoose.connection.name.endsWith('_test'), 'Refusing to run tests on a non-test database');
  await mongoose.connection.dropDatabase();
  await Promise.all([User.init(), Admin.init(), PendingRegistration.init(), Notification.init(), AdminActionLog.init()]);

  const file = await saveIdCard(createPlaceholderIdCard(), 'png');
  const doc = await Admin.create({
    name: 'Test Admin',
    email: 'admin@example.com',
    phone: '01712345678',
    passwordHash: await Admin.hashPassword('Admin@12345'),
    universityRegNumber: 'ADMIN-0001',
    idCardImageUrl: file,
  });
  const agent = request.agent(app);
  assert.equal((await agent.post('/api/auth/login').send({ email: 'admin@example.com', password: 'Admin@12345' })).status, 200);
  admin = { agent, id: String(doc._id) };
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  fs.rmSync(process.env.STORAGE_DIR, { recursive: true, force: true });
});

describe('automatic verification', () => {
  it('approves a student whose card shows their name and number - no admin needed', async () => {
    const s = await signUp();
    seen = () => cardFor(s.name, s.reg);
    // sign-up itself already queued the check; wait for it to finish
    await whenIdle();

    const user = await me(s);
    assert.equal(user.verificationStatus, 'verified');
    assert.equal(user.autoVerification.decision, 'approved');
    assert.equal(user.autoVerification.attempts, 1);

    const note = await Notification.findOne({ userId: s.id });
    assert.match(note.message, /approved automatically/);
    const log = await AdminActionLog.findOne({ targetId: s.id });
    assert.equal(log.actionType, 'auto_approve_user');
    assert.equal(log.automatic, true);
    assert.equal(log.adminId, undefined);
  });

  it('rejects a card that is not theirs, tells them why, and lets them try again', async () => {
    seen = () => cardFor('Rahim Uddin Sarker', '999-99-999');
    const s = await signUp();
    await whenIdle();

    const rejected = await me(s);
    assert.equal(rejected.verificationStatus, 'rejected');
    assert.ok(rejected.rejectionReason.includes(s.reg));
    assert.equal(rejected.autoVerification.attempts, 1);

    // a better photo: the resubmission is checked again automatically
    seen = () => cardFor(s.name, s.reg);
    const again = await resubmit(s);
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.equal(again.body.data.user.verificationStatus, 'pending');
    await whenIdle();

    const after = await me(s);
    assert.equal(after.verificationStatus, 'verified');
    assert.equal(after.autoVerification.attempts, 2);
  });

  it('leaves an unclear photo for an admin, who can still approve it', async () => {
    seen = () => ({ text: 'blurry', confidence: 12 });
    const s = await signUp();
    await whenIdle();

    const pending = await me(s);
    assert.equal(pending.verificationStatus, 'pending');
    assert.equal(pending.autoVerification.decision, 'review');

    const queue = await admin.agent.get('/api/admin/verifications?status=pending&limit=50');
    const row = queue.body.data.users.find((u) => u.id === s.id);
    assert.ok(row, 'the student is in the admin queue');
    assert.match(row.autoVerification.summary, /could not decide/);

    assert.equal((await admin.agent.patch(`/api/admin/verifications/${s.id}/approve`)).status, 200);
    assert.equal((await me(s)).verificationStatus, 'verified');
  });

  it('after the maximum automatic tries an admin decides - the photo is not read again', async () => {
    seen = () => cardFor('Someone Else Entirely', '000-00-000');
    const s = await signUp();
    await whenIdle(); // automatic check 1 -> rejected
    assert.equal((await resubmit(s)).status, 200);
    await whenIdle(); // automatic check 2 -> rejected
    assert.equal((await me(s)).verificationStatus, 'rejected');

    const readsBefore = reads;
    assert.equal((await resubmit(s)).status, 200);
    await whenIdle(); // limit reached: not read, sent to an admin
    const user = await me(s);
    assert.equal(reads, readsBefore);
    assert.equal(user.verificationStatus, 'pending');
    assert.equal(user.autoVerification.decision, 'review');
    assert.equal(user.autoVerification.attempts, 2);
  });

  it('an admin decision is never overwritten by a late automatic result', async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    setReader(async () => {
      await gate; // the "OCR" is slow...
      return cardFor('Khaled Mahmud Nahid', '241-35-999');
    });
    const s = await signUp();
    // ...so the admin rejects while it is still reading
    assert.equal((await admin.agent.patch(`/api/admin/verifications/${s.id}/reject`).send({ reason: 'Photo is edited, please resubmit.' })).status, 200);
    release();
    await whenIdle();
    const user = await me(s);
    assert.equal(user.verificationStatus, 'rejected');
    assert.equal(user.rejectionReason, 'Photo is edited, please resubmit.');
    setReader(async () => {
      reads += 1;
      return seen();
    });
  });
});