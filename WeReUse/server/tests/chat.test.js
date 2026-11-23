/**
 * Integration tests for the chat about an item (conversations, messages, offers, unread counts),
 * and for editing an item (which keeps the chats' copy of the title up to date).
 * Run with:  npm test      (MongoDB must be running; uses its own "wereuse_chat_test" database)
 */
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_CHAT_TEST_URI || 'mongodb://127.0.0.1:27017/wereuse_chat_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret-1234';

const os = require('os');
const fs = require('fs');
const path = require('path');
process.env.STORAGE_DIR = path.join(os.tmpdir(), `wereuse-chat-test-storage-${process.pid}`);

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');

const app = require('../src/app');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const Admin = require('../src/models/Admin');
const Listing = require('../src/models/Listing');
const Conversation = require('../src/models/Conversation');
const Message = require('../src/models/Message');
const Notification = require('../src/models/Notification');
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
  await Promise.all([User, Admin, Listing, Conversation, Message, Notification].map((m) => m.init()));

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

describe('chatting about an item', () => {
  let listingId;
  let conversationId;

  it('a verified student opens a chat about an item; asking again reopens the same chat', async () => {
    listingId = await postItem(seller.agent, { title: 'Headphones', price: '500' });
    let res = await buyer.agent.post('/api/conversations').send({ listingId });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    conversationId = res.body.data.conversation.id;
    assert.equal(res.body.data.conversation.myRole, 'buyer');
    assert.equal(res.body.data.conversation.other.id, seller.id);
    assert.equal(res.body.data.conversation.other.email, undefined); // no contact details

    res = await buyer.agent.post('/api/conversations').send({ listingId });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.conversation.id, conversationId);
  });

  it('is closed to your own items, unverified students, admins and anonymous visitors', async () => {
    assert.equal((await seller.agent.post('/api/conversations').send({ listingId })).body.code, 'OWN_LISTING');
    assert.equal((await pending.agent.post('/api/conversations').send({ listingId })).status, 403);
    assert.equal((await admin.agent.post('/api/conversations').send({ listingId })).status, 403);
    assert.equal((await request(app).post('/api/conversations').send({ listingId })).status, 401);
  });

  it('sends messages, counts them as unread for the other side and notifies them', async () => {
    // an empty chat does not show up in the seller's inbox yet
    let inbox = await seller.agent.get('/api/conversations');
    assert.equal(inbox.body.data.conversations.length, 0);

    let res = await buyer.agent.post(`/api/conversations/${conversationId}/messages`).send({ text: 'Hi! Is it still available?' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.message.type, 'text');

    inbox = await seller.agent.get('/api/conversations');
    assert.equal(inbox.body.data.conversations.length, 1);
    assert.equal(inbox.body.data.unreadTotal, 1);
    assert.equal((await seller.agent.get('/api/conversations/unread-count')).body.data.count, 1);
    assert.ok(await Notification.exists({ userId: seller.id, type: 'message', relatedId: conversationId }));

    res = await seller.agent.post(`/api/conversations/${conversationId}/read`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.unread, 0);

    res = await buyer.agent.post(`/api/conversations/${conversationId}/messages`).send({ text: '   ' });
    assert.equal(res.status, 400);
  });

  it('only the two students can see the conversation', async () => {
    assert.equal((await other.agent.get(`/api/conversations/${conversationId}`)).status, 404);
    assert.equal((await other.agent.get(`/api/conversations/${conversationId}/messages`)).status, 404);
    const res = await seller.agent.get(`/api/conversations/${conversationId}/messages`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.messages.length, 1);
  });

  it('a price offer can be accepted once; then no new offers are possible', async () => {
    const offer = await buyer.agent.post(`/api/conversations/${conversationId}/messages`).send({ offer: { kind: 'price', amount: 380 } });
    assert.equal(offer.status, 201, JSON.stringify(offer.body));
    const offerId = offer.body.data.message.id;

    // you cannot answer your own offer
    assert.equal((await buyer.agent.patch(`/api/conversations/${conversationId}/messages/${offerId}/offer`).send({ action: 'accept' })).status, 403);

    const accepted = await seller.agent.patch(`/api/conversations/${conversationId}/messages/${offerId}/offer`).send({ action: 'accept' });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    assert.equal(accepted.body.data.agreedOffer, offerId);
    assert.match(accepted.body.data.systemMessage.text, /accepted the offer of ৳380/);

    const again = await buyer.agent.post(`/api/conversations/${conversationId}/messages`).send({ offer: { kind: 'price', amount: 300 } });
    assert.equal(again.body.code, 'DEAL_AGREED');
  });

  it('a deleted item leaves the chat read-only', async () => {
    const id = await postItem(seller.agent, { title: 'Desk fan', price: '700' });
    const conv = await other.agent.post('/api/conversations').send({ listingId: id });
    assert.equal((await seller.agent.delete(`/api/listings/${id}`)).status, 200);

    const view = await other.agent.get(`/api/conversations/${conv.body.data.conversation.id}`);
    assert.equal(view.body.data.conversation.listing.deleted, true);
    const res = await other.agent.post(`/api/conversations/${conv.body.data.conversation.id}/messages`).send({ text: 'Hello?' });
    assert.equal(res.body.code, 'LISTING_DELETED');
  });
});

describe('editing an item', () => {
  const edit = (agent, id, fields, { keep = [], photos = 0 } = {}) => {
    let req = agent.patch(`/api/listings/${id}`);
    const all = { title: 'Edited title', description: 'An edited description of the item.', category, listingType: 'sell', price: '250', condition: 'new', ...fields };
    for (const [k, v] of Object.entries(all)) req = req.field(k, v);
    req = req.field('keepImages', JSON.stringify(keep));
    for (let i = 0; i < photos; i += 1) req = req.attach('images', jpg(), { filename: `n${i}.jpg`, contentType: 'image/jpeg' });
    return req;
  };

  it('the owner changes text, price and photos', async () => {
    const id = await postItem(seller.agent, { title: 'Old title', price: '200' });
    const before = await Listing.findById(id).lean();

    const res = await edit(seller.agent, id, { price: '250' }, { keep: before.images, photos: 1 });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.listing.title, 'Edited title');
    assert.equal(res.body.data.listing.price, 250);
    assert.equal(res.body.data.listing.images.length, 2);
    assert.equal(res.body.data.listing.images[0], before.images[0]);

    // removing every photo is refused
    const none = await edit(seller.agent, id, {}, { keep: [] });
    assert.equal(none.status, 400);
    assert.ok(none.body.errors.images);
  });

  it('only the owner may edit, and the chats about the item show the new title', async () => {
    const id = await postItem(seller.agent, { title: 'Sold soon', price: '50' });
    const imgs = (await Listing.findById(id).lean()).images;
    assert.equal((await edit(buyer.agent, id, {}, { keep: imgs })).status, 404);

    const conv = await buyer.agent.post('/api/conversations').send({ listingId: id });
    assert.equal(conv.status, 201, JSON.stringify(conv.body));
    assert.equal((await edit(seller.agent, id, { title: 'Renamed item' }, { keep: imgs })).status, 200);
    const saved = await Conversation.findById(conv.body.data.conversation.id).lean();
    assert.equal(saved.listingSnapshot.title, 'Renamed item');
  });

  it('cannot keep photos that belong to another item', async () => {
    const mine = await postItem(seller.agent, { title: 'Mine' });
    const theirs = await postItem(other.agent, { title: 'Theirs' });
    const foreign = (await Listing.findById(theirs).lean()).images;
    const res = await edit(seller.agent, mine, {}, { keep: foreign });
    assert.equal(res.status, 400); // the foreign names are ignored, so no photos are left
  });
});
