/**
 * Integration tests for public profiles, rating a student, reporting a student, and admins
 * blocking / removing accounts.
 * Run with:  npm test      (MongoDB must be running; uses its own "wereuse_moderation_test" database)
 */
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_MODERATION_TEST_URI || 'mongodb://127.0.0.1:27017/wereuse_moderation_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret-1234';

const os = require('os');
const fs = require('fs');
const path = require('path');
process.env.STORAGE_DIR = path.join(os.tmpdir(), `wereuse-moderation-test-storage-${process.pid}`);

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');

const app = require('../src/app');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const Admin = require('../src/models/Admin');
const Listing = require('../src/models/Listing');
const Rating = require('../src/models/Rating');
const Complaint = require('../src/models/Complaint');
const UserReport = require('../src/models/UserReport');
const Conversation = require('../src/models/Conversation');
const Message = require('../src/models/Message');
const { saveIdCard } = require('../src/utils/fileStore');
const { createPlaceholderIdCard } = require('../src/utils/placeholderIdCard');
const { lastCodeFor } = require('../src/utils/mailer');

const jpg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]), Buffer.alloc(300, 7)]);

let admin;
let category;
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

async function postItem(agent, over = {}) {
  const fields = {
    title: 'Calculus textbook',
    description: 'Thomas Calculus, 14th edition, no markings inside.',
    category,
    listingType: 'sell',
    price: '450',
    condition: 'new',
    ...over,
  };
  let req = agent.post('/api/listings');
  for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
  const res = await req.attach('images', jpg(), { filename: 'p.jpg', contentType: 'image/jpeg' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.listing.id;
}

before(async () => {
  await connectDB();
  assert.ok(mongoose.connection.name.endsWith('_test'), 'Refusing to run tests on a non-test database');
  await mongoose.connection.dropDatabase();
  await Promise.all([User, Admin, Listing, Rating, Complaint, Conversation, Message, UserReport].map((m) => m.init()));

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

  const cat = await admin.agent.post('/api/admin/categories').send({ name: 'Books', isActive: true });
  category = cat.body.data.category.id;

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


describe('public profiles', () => {
  it('any logged-in user can open a student profile, with their items and rating', async () => {
    await postItem(seller.agent, { title: 'Scientific calculator', price: '600' });
    const res = await buyer.agent.get(`/api/users/${seller.id}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const { profile, listings, viewer } = res.body.data;
    assert.equal(profile.name, 'Student seller');
    assert.equal(profile.email, undefined); // private details stay private
    assert.equal(listings.length, 1);
    assert.equal(viewer.canRate, true);
    assert.equal(viewer.canReport, true);

    const admin_ = await admin.agent.get(`/api/users/${seller.id}`);
    assert.equal(admin_.body.data.profile.email, 'seller@example.com');
    assert.equal(admin_.body.data.viewer.canRate, false);
  });

  it('my own profile has no rate / report options; unknown ids are 404', async () => {
    const me = await seller.agent.get(`/api/users/${seller.id}`);
    assert.equal(me.body.data.profile.isMe, true);
    assert.equal(me.body.data.viewer.canReport, false);
    assert.equal((await buyer.agent.get(`/api/users/${new mongoose.Types.ObjectId()}`)).status, 404);
    assert.equal((await buyer.agent.get('/api/users/nonsense')).status, 404);
    assert.equal((await request(app).get(`/api/users/${seller.id}`)).status, 401);
  });
});

describe('rating a student from their profile', () => {
  it('one rating per student, which can be changed or removed; the average updates', async () => {
    let res = await buyer.agent.put(`/api/users/${seller.id}/rating`).send({ stars: 4, comment: 'Friendly' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    res = await other.agent.put(`/api/users/${seller.id}/rating`).send({ stars: 2 });
    assert.equal(res.body.data.summary.average, 3);

    res = await buyer.agent.put(`/api/users/${seller.id}/rating`).send({ stars: 5 });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.summary.average, 3.5);
    assert.equal(res.body.data.summary.count, 2);

    const view = await buyer.agent.get(`/api/users/${seller.id}`);
    assert.deepEqual(view.body.data.viewer.myRating, { stars: 5, comment: '' });
    assert.equal(view.body.data.reviews.length, 2);

    res = await other.agent.delete(`/api/users/${seller.id}/rating`);
    assert.equal(res.body.data.summary.average, 5);
  });

  it('the rating shows next to the student’s items and in their reviews', async () => {
    const reviews = await other.agent.get(`/api/ratings/seller/${seller.id}`);
    assert.equal(reviews.status, 200);
    assert.equal(reviews.body.data.summary.average, 5);
    assert.equal(reviews.body.data.summary.count, 1);
    assert.equal(reviews.body.data.ratings[0].buyer.id, buyer.id);

    const items = await other.agent.get('/api/listings');
    const item = items.body.data.listings.find((l) => l.seller && l.seller.id === seller.id);
    assert.equal(item.seller.rating, 5);
    assert.equal(item.seller.ratingCount, 1);
    assert.equal(await Rating.countDocuments({ seller: seller.id }), 1);
  });

  it('cannot rate yourself, needs 1-5 stars, and only verified students rate', async () => {
    assert.equal((await seller.agent.put(`/api/users/${seller.id}/rating`).send({ stars: 5 })).body.code, 'SELF_RATING');
    assert.equal((await buyer.agent.put(`/api/users/${seller.id}/rating`).send({ stars: 0 })).status, 400);
    assert.equal((await pending.agent.put(`/api/users/${seller.id}/rating`).send({ stars: 5 })).status, 403);
    assert.equal((await admin.agent.put(`/api/users/${seller.id}/rating`).send({ stars: 5 })).status, 403);
  });
});

describe('reporting a student', () => {
  let reportId;

  it('a student reports another student; a second open report is refused', async () => {
    let res = await buyer.agent.post(`/api/users/${other.id}/report`).send({ reason: 'scam', details: 'Took my money and never showed up.' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    reportId = res.body.data.report.id;

    res = await buyer.agent.post(`/api/users/${other.id}/report`).send({ reason: 'spam', details: 'Keeps sending me the same message.' });
    assert.equal(res.body.code, 'ALREADY_REPORTED');

    // also students waiting for verification may report
    res = await pending.agent.post(`/api/users/${other.id}/report`).send({ reason: 'harassment', details: 'Sent rude messages to me.' });
    assert.equal(res.status, 201);

    assert.equal((await buyer.agent.post(`/api/users/${buyer.id}/report`).send({ reason: 'other', details: 'Reporting myself here.' })).body.code, 'SELF_REPORT');
    assert.equal((await buyer.agent.post(`/api/users/${seller.id}/report`).send({ reason: 'nonsense', details: 'x' })).status, 400);
  });

  it('reports arrive in the admin report box, with the repeat count', async () => {
    const res = await admin.agent.get('/api/admin/reports').query({ status: 'open' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.counts.open, 2);
    assert.equal(res.body.data.reports[0].reported.timesReported, 2);
    assert.equal(res.body.data.reports[0].reporter.email !== undefined, true);
    assert.equal((await buyer.agent.get('/api/admin/reports')).status, 403);
  });

  it('dismissing a report notifies the reporter', async () => {
    const pendingReport = await UserReport.findOne({ reason: 'harassment' });
    const res = await admin.agent.patch(`/api/admin/reports/${pendingReport._id}`).send({ status: 'dismissed', adminNote: 'Not enough evidence.' });
    assert.equal(res.status, 200);
    const mine = await pending.agent.get('/api/users/reports/mine');
    assert.equal(mine.body.data.reports[0].status, 'dismissed');
    assert.equal(mine.body.data.reports[0].adminNote, 'Not enough evidence.');
  });

  describe('blocking and removing accounts', () => {
    it('a temporary block logs the student out, hides them and closes the report', async () => {
      const res = await admin.agent.post(`/api/admin/users/${other.id}/moderate`).send({ action: 'suspend', days: 3, reason: 'Scam report', reportId });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.data.user.status, 'suspended');

      const blocked = await other.agent.get('/api/conversations');
      assert.equal(blocked.status, 403);
      assert.equal(blocked.body.code, 'ACCOUNT_SUSPENDED');
      assert.match(blocked.body.message, /temporarily blocked until .*Scam report/);

      const login = await request(app).post('/api/auth/login').send({ email: 'other@example.com', password: 'Passw0rdOK' });
      assert.equal(login.status, 403);

      assert.equal((await buyer.agent.get(`/api/users/${other.id}`)).status, 404); // hidden from students
      assert.equal((await admin.agent.get(`/api/users/${other.id}`)).body.data.profile.status, 'suspended');
      assert.equal((await UserReport.findById(reportId)).status, 'action_taken');
    });

    it('the block ends by itself when its time is up', async () => {
      await User.updateOne({ _id: other.id }, { $set: { suspendedUntil: new Date(Date.now() - 1000) } });
      const res = await other.agent.get('/api/conversations');
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal((await User.findById(other.id)).status, 'active');
    });

    it('removing (ban) is permanent until an admin restores the account', async () => {
      let res = await admin.agent.post(`/api/admin/users/${other.id}/moderate`).send({ action: 'ban', reason: 'Repeated scams' });
      assert.equal(res.status, 200);
      res = await request(app).post('/api/auth/login').send({ email: 'other@example.com', password: 'Passw0rdOK' });
      assert.equal(res.body.code, 'ACCOUNT_BANNED');

      res = await admin.agent.post(`/api/admin/users/${other.id}/moderate`).send({ action: 'restore' });
      assert.equal(res.status, 200);
      assert.equal((await other.agent.get('/api/conversations')).status, 200);
    });

    it('needs a reason and a number of days; admin only', async () => {
      let res = await admin.agent.post(`/api/admin/users/${other.id}/moderate`).send({ action: 'suspend' });
      assert.equal(res.status, 400);
      assert.ok(res.body.errors.days && res.body.errors.reason);
      res = await admin.agent.post(`/api/admin/users/${other.id}/moderate`).send({ action: 'restore' });
      assert.equal(res.body.code, 'ALREADY_ACTIVE');
      assert.equal((await buyer.agent.post(`/api/admin/users/${other.id}/moderate`).send({ action: 'ban', reason: 'nope' })).status, 403);
    });
  });
});
