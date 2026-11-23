/**
 * Integration tests for the complaint box: students send complaints, admins answer them.
 * Run with:  npm test      (MongoDB must be running; uses its own "wereuse_complaints_test" database)
 */
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_COMPLAINTS_TEST_URI || 'mongodb://127.0.0.1:27017/wereuse_complaints_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret-1234';

const os = require('os');
const fs = require('fs');
const path = require('path');
process.env.STORAGE_DIR = path.join(os.tmpdir(), `wereuse-complaints-test-storage-${process.pid}`);

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');

const app = require('../src/app');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const Admin = require('../src/models/Admin');
const Complaint = require('../src/models/Complaint');
const Notification = require('../src/models/Notification');
const { saveIdCard } = require('../src/utils/fileStore');
const { createPlaceholderIdCard } = require('../src/utils/placeholderIdCard');
const { lastCodeFor } = require('../src/utils/mailer');

const jpg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]), Buffer.alloc(300, 7)]);

let admin;
let seller, buyer, other, pending;

async function makeStudent(key, n, { verified = true } = {}) {
  const agent = request.agent(app);
  const email = `${key}@example.com`;
  const form = agent.post('/api/auth/register');
  const fields = {
    name: `Student ${key}`,
    email,
    password: 'Passw0rdOK',
    confirmPassword: 'Passw0rdOK',
    universityRegNumber: `241-35-${String(n).padStart(3, '0')}`,
    department: 'CSE',
    batch: '42',
  };
  for (const [k, v] of Object.entries(fields)) form.field(k, v);
  form.attach('idCard', jpg(), { filename: 'id.jpg', contentType: 'image/jpeg' });
  assert.equal((await form).status, 202);
  const res = await agent.post('/api/auth/verify-email').send({ email, code: lastCodeFor(email) });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const id = res.body.data.user.id;
  if (verified) assert.equal((await admin.agent.patch(`/api/admin/verifications/${id}/approve`)).status, 200);
  return { agent, id, email };
}

before(async () => {
  await connectDB();
  assert.ok(mongoose.connection.name.endsWith('_test'), 'Refusing to run tests on a non-test database');
  await mongoose.connection.dropDatabase();
  await Promise.all([User, Admin, Complaint, Notification].map((m) => m.init()));

  const adminFile = await saveIdCard(createPlaceholderIdCard(), 'png');
  const doc = await Admin.create({
    name: 'Test Admin',
    email: 'admin@example.com',
    phone: '01712345678',
    passwordHash: await Admin.hashPassword('Admin@12345'),
    universityRegNumber: 'ADMIN-0001',
    idCardImageUrl: adminFile,
  });
  const agent = request.agent(app);
  assert.equal((await agent.post('/api/auth/login').send({ email: 'admin@example.com', password: 'Admin@12345' })).status, 200);
  admin = { agent, id: String(doc._id) };

  seller = await makeStudent('seller', 1);
  buyer = await makeStudent('buyer', 2);
  other = await makeStudent('other', 3);
  pending = await makeStudent('pending', 4, { verified: false });
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  fs.rmSync(process.env.STORAGE_DIR, { recursive: true, force: true });
});

describe('complaint box', () => {
  let complaintId;

  it('a student (even unverified) can send a complaint', async () => {
    let res = await buyer.agent.post('/api/complaints').send({
      category: 'scam',
      subject: 'Item not as described',
      description: 'The seller never showed up at the meeting place and stopped replying.',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    complaintId = res.body.data.complaint.id;

    res = await pending.agent.post('/api/complaints').send({
      category: 'technical',
      subject: 'Cannot upload ID',
      description: 'The upload button does nothing when I choose my ID photo.',
    });
    assert.equal(res.status, 201);
  });

  it('checks the category and the text; admins cannot use the student complaint box', async () => {
    let res = await buyer.agent.post('/api/complaints').send({ category: 'nonsense', subject: 'Something else', description: 'This is a long enough description of the problem.' });
    assert.equal(res.status, 400);
    assert.ok(res.body.errors.category);
    assert.equal((await admin.agent.post('/api/complaints').send({ category: 'other', subject: 'From an admin', description: 'Admins answer complaints, they do not send them.' })).status, 403);
    res = await buyer.agent.post('/api/complaints').send({ category: 'scam', subject: 'Hi', description: 'short' });
    assert.equal(res.status, 400);
    assert.ok(res.body.errors.subject && res.body.errors.description);
  });

  it('admins see complaints and respond; the student sees the answer', async () => {
    let res = await admin.agent.get('/api/admin/complaints').query({ status: 'open' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.counts.open, 2);

    res = await admin.agent.patch(`/api/admin/complaints/${complaintId}`).send({ status: 'resolved', adminResponse: 'We warned the seller.' });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const mine = await buyer.agent.get('/api/complaints/mine');
    assert.equal(mine.body.data.complaints[0].status, 'resolved');
    assert.equal(mine.body.data.complaints[0].adminResponse, 'We warned the seller.');
    assert.equal((await buyer.agent.get('/api/admin/complaints')).status, 403);
  });

  it('the student gets a notification about the answer', async () => {
    const res = await buyer.agent.get('/api/notifications');
    assert.equal(res.status, 200);
    assert.ok(res.body.data.notifications.some((n) => n.type === 'complaint_update' && /resolved/.test(n.message)));
  });
});
