/**
 * Integration tests for the listings module (post / browse / search / filter / manage).
 * Run with:  npm test      (MongoDB must be running; uses its own "wereuse_listings_test" database)
 */
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_LISTINGS_TEST_URI || 'mongodb://127.0.0.1:27017/wereuse_listings_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret-1234';

const os = require('os');
const fs = require('fs');
const path = require('path');
process.env.STORAGE_DIR = path.join(os.tmpdir(), `wereuse-listings-test-storage-${process.pid}`);

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');

const app = require('../src/app');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const Admin = require('../src/models/Admin');
const Category = require('../src/models/Category');
const Listing = require('../src/models/Listing');
const PendingRegistration = require('../src/models/PendingRegistration');
const Notification = require('../src/models/Notification');
const AdminActionLog = require('../src/models/AdminActionLog');
const { ID_DIR, LISTING_DIR, saveIdCard } = require('../src/utils/fileStore');
const { createPlaceholderIdCard } = require('../src/utils/placeholderIdCard');
const { lastCodeFor } = require('../src/utils/mailer');

// ---------- helpers ----------
const jpg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]), Buffer.alloc(300, 7)]);
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(300, 9)]);

let admin; // { agent, id }
const students = {};

async function makeStudent(key, n, { verified = true } = {}) {
  const agent = request.agent(app);
  const email = `${key}@example.com`;
  const form = agent.post('/api/auth/register');
  const fields = {
    name: `Student ${key.replace(/[0-9]/g, '')}`,
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
  students[key] = { agent, id, email };
  return students[key];
}

const addCategory = async (name, isActive = true) => {
  const res = await admin.agent.post('/api/admin/categories').send({ name, isActive });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.category.id;
};

/** POST /api/listings with text fields and N photos. */
function post(agent, fields, photos = [jpg()], { field = 'images', type = 'image/jpeg' } = {}) {
  let req = agent.post('/api/listings');
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) req = req.field(k, v);
  photos.forEach((buf, i) => {
    req = req.attach(field, buf, { filename: `photo${i}.jpg`, contentType: type });
  });
  return req;
}

const sale = (category, over = {}) => ({
  title: 'Calculus textbook',
  description: 'Thomas Calculus, 14th edition, no markings inside.',
  category,
  listingType: 'sell',
  price: '450',
  condition: 'good',
  usedValue: '6',
  usedUnit: 'months',
  ...over,
});

const photoFiles = () => fs.readdirSync(LISTING_DIR);

let books, gadgets, hidden; // category ids
let seller, buyer, pending; // students

before(async () => {
  await connectDB();
  assert.ok(mongoose.connection.name.endsWith('_test'), 'Refusing to run tests on a non-test database');
  await mongoose.connection.dropDatabase();
  await Promise.all([
    User.init(),
    Admin.init(),
    Category.init(),
    Listing.init(),
    PendingRegistration.init(),
    Notification.init(),
    AdminActionLog.init(),
  ]);

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

  books = await addCategory('Books');
  gadgets = await addCategory('Gadgets');
  hidden = await addCategory('Hidden stuff', false);

  seller = await makeStudent('seller', 1);
  buyer = await makeStudent('buyer', 2);
  pending = await makeStudent('pending', 3, { verified: false });
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  fs.rmSync(process.env.STORAGE_DIR, { recursive: true, force: true });
});

describe('who may post and who may browse', () => {
  it('needs a login for everything', async () => {
    for (const [method, url] of [['get', '/api/listings'], ['get', '/api/listings/mine'], ['post', '/api/listings'], ['get', '/api/listings/images/x.jpg']]) {
      assert.equal((await request(app)[method](url)).status, 401, `${method} ${url}`);
    }
  });

  it('blocks students who are not verified from posting, before any upload is read', async () => {
    const res = await post(pending.agent, sale(books));
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'NOT_VERIFIED');
    assert.equal(await Listing.countDocuments({}), 0);
  });

  it('blocks admins from posting (they are not sellers)', async () => {
    const res = await post(admin.agent, sale(books));
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'FORBIDDEN');
  });

  it('lets every logged-in user browse, including pending students and admins', async () => {
    assert.equal((await pending.agent.get('/api/listings')).status, 200);
    assert.equal((await admin.agent.get('/api/listings')).status, 200);
  });
});

describe('posting an item', () => {
  it('creates a listing with photos and shows the seller without any contact details', async () => {
    const res = await post(seller.agent, sale(books), [jpg(), png()]);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const l = res.body.data.listing;
    assert.equal(l.title, 'Calculus textbook');
    assert.equal(l.listingType, 'sell');
    assert.equal(l.price, 450);
    assert.equal(l.condition, 'good');
    assert.deepEqual(l.usedFor, { value: 6, unit: 'months' });
    assert.equal(l.images.length, 2);
    assert.equal(l.category.name, 'Books');
    assert.equal(l.isMine, true);
    assert.equal(l.seller.isVerified, true);
    assert.equal(l.seller.email, undefined);
    assert.equal(l.seller.phone, undefined);
    assert.equal(photoFiles().length >= 2, true);
  });

  it('keeps only what fits the type and condition', async () => {
    const donate = await post(seller.agent, sale(books, { title: 'Old notes bundle', listingType: 'donate', price: '999' }));
    assert.equal(donate.status, 201);
    assert.equal(donate.body.data.listing.price, null);

    const swap = await post(
      seller.agent,
      sale(gadgets, { title: 'Scientific calculator', listingType: 'exchange', price: undefined, exchangeFor: ' a USB hub ', condition: 'new', usedValue: '', usedUnit: '' })
    );
    assert.equal(swap.status, 201, JSON.stringify(swap.body));
    assert.equal(swap.body.data.listing.exchangeFor, 'a USB hub');
    assert.equal(swap.body.data.listing.usedFor, null);
  });

  it('reports text errors and the missing photo together', async () => {
    const res = await post(seller.agent, { title: 'a', listingType: 'trade' }, []);
    assert.equal(res.status, 400);
    for (const f of ['title', 'description', 'category', 'listingType', 'condition', 'images']) {
      assert.ok(res.body.errors[f], `expected an error for ${f}`);
    }
  });

  it('needs a price for items on sale and a used time for used items', async () => {
    const a = await post(seller.agent, sale(books, { price: '' }));
    assert.equal(a.status, 400);
    assert.ok(a.body.errors.price);
    const b = await post(seller.agent, sale(books, { usedValue: '', usedUnit: '' }));
    assert.equal(b.status, 400);
    assert.ok(b.body.errors.usedValue && b.body.errors.usedUnit);
  });

  it('refuses disabled or unknown categories', async () => {
    const disabled = await post(seller.agent, sale(hidden));
    assert.equal(disabled.status, 400);
    assert.ok(disabled.body.errors.category);
    const unknown = await post(seller.agent, sale('0'.repeat(24)));
    assert.equal(unknown.status, 400);
  });

  it('refuses fake images, wrong file types and more than 5 photos - and stores nothing', async () => {
    const before = photoFiles().length;
    const fake = await post(seller.agent, sale(books), [Buffer.from('this is not an image at all, just text')]);
    assert.equal(fake.status, 400);
    assert.ok(fake.body.errors.images);

    const wrongType = await post(seller.agent, sale(books), [jpg()], { type: 'application/pdf' });
    assert.equal(wrongType.status, 400);
    assert.ok(wrongType.body.errors.images);

    const tooMany = await post(seller.agent, sale(books), [jpg(), jpg(), jpg(), jpg(), jpg(), jpg()]);
    assert.equal(tooMany.status, 400);
    assert.ok(tooMany.body.errors.images);

    const wrongField = await post(seller.agent, sale(books), [jpg()], { field: 'photo' });
    assert.equal(wrongField.status, 400);

    assert.equal(photoFiles().length, before);
  });
});

describe('browsing, searching and filtering', () => {
  before(async () => {
    await post(buyer.agent, sale(books, { title: 'Physics lab manual', description: 'Clean copy for PHY-101.', price: '120', condition: 'like_new', usedValue: '1', usedUnit: 'months' }));
    await post(buyer.agent, sale(gadgets, { title: 'Wireless mouse', description: 'Works perfectly, battery included.', price: '300', condition: 'fair', usedValue: '2', usedUnit: 'years' }));
    await post(buyer.agent, sale(gadgets, { title: 'Phone charger', description: 'Fast charger, 20W.', listingType: 'donate', price: undefined, condition: 'poor', usedValue: '3', usedUnit: 'years' }));
  });

  const browse = async (qs = '') => {
    const res = await buyer.agent.get(`/api/listings${qs}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body.data;
  };
  const titles = (data) => data.listings.map((l) => l.title);

  it('lists the newest first and paginates', async () => {
    const all = await browse('?limit=100');
    assert.equal(titles(all)[0], 'Phone charger');
    assert.equal(all.pagination.total, all.listings.length);

    const page1 = await browse('?limit=2&page=1');
    const page2 = await browse('?limit=2&page=2');
    assert.equal(page1.listings.length, 2);
    assert.equal(page1.pagination.pages, Math.ceil(all.pagination.total / 2));
    assert.notEqual(page1.listings[0].id, page2.listings[0].id);
  });

  it('searches the title and the description, ignoring capital letters', async () => {
    assert.deepEqual(titles(await browse('?search=MOUSE')), ['Wireless mouse']);
    assert.deepEqual(titles(await browse('?search=phy-101')), ['Physics lab manual']);
    assert.deepEqual((await browse('?search=nothing-matches-this')).listings, []);
    // special characters are searched literally, never as a pattern
    assert.deepEqual((await browse('?search=.*')).listings, []);
  });

  it('filters by category', async () => {
    const data = await browse(`?category=${gadgets}&limit=100`);
    assert.ok(data.listings.length >= 3);
    assert.ok(data.listings.every((l) => l.category.name === 'Gadgets'));
  });

  it('filters by one or several conditions', async () => {
    assert.ok((await browse('?condition=like_new&limit=100')).listings.every((l) => l.condition === 'like_new'));
    const several = await browse('?condition=fair,poor&limit=100');
    assert.ok(several.listings.length >= 2);
    assert.ok(several.listings.every((l) => ['fair', 'poor'].includes(l.condition)));
  });

  it('filters by type and by price range (a range only matches items that have a price)', async () => {
    assert.ok((await browse('?type=donate&limit=100')).listings.every((l) => l.listingType === 'donate'));
    const ranged = await browse('?minPrice=100&maxPrice=350&limit=100');
    assert.ok(ranged.listings.length >= 2);
    assert.ok(ranged.listings.every((l) => l.listingType === 'sell' && l.price >= 100 && l.price <= 350));
  });

  it('sorts by price', async () => {
    const asc = (await browse('?type=sell&sort=price_asc&limit=100')).listings.map((l) => l.price);
    assert.deepEqual(asc, [...asc].sort((a, b) => a - b));
    const desc = (await browse('?type=sell&sort=price_desc&limit=100')).listings.map((l) => l.price);
    assert.deepEqual(desc, [...desc].sort((a, b) => b - a));
  });

  it('combines filters', async () => {
    const data = await browse(`?category=${gadgets}&condition=fair&type=sell&maxPrice=500`);
    assert.deepEqual(titles(data), ['Wireless mouse']);
  });

  it('rejects nonsense filters with a clear error', async () => {
    const res = await buyer.agent.get('/api/listings?condition=shiny&minPrice=9&maxPrice=1');
    assert.equal(res.status, 400);
    assert.ok(res.body.errors);
  });

  it('hides items of a disabled category, closed items and items of suspended students', async () => {
    const mine = await post(seller.agent, sale(books, { title: 'Hide me soon' }));
    const id = mine.body.data.listing.id;
    assert.ok(titles(await browse('?limit=100')).includes('Hide me soon'));

    // closed
    assert.equal((await seller.agent.patch(`/api/listings/${id}/status`).send({ status: 'closed' })).status, 200);
    assert.ok(!titles(await browse('?limit=100')).includes('Hide me soon'));
    assert.equal((await seller.agent.patch(`/api/listings/${id}/status`).send({ status: 'available' })).status, 200);
    assert.ok(titles(await browse('?limit=100')).includes('Hide me soon'));

    // category disabled by the admin
    const tmp = await addCategory('Temporary');
    await post(seller.agent, sale(tmp, { title: 'In a temporary category' }));
    assert.ok(titles(await browse('?limit=100')).includes('In a temporary category'));
    assert.equal((await admin.agent.patch(`/api/admin/categories/${tmp}`).send({ isActive: false })).status, 200);
    assert.ok(!titles(await browse('?limit=100')).includes('In a temporary category'));
    assert.equal((await browse(`?category=${tmp}`)).listings.length, 0);

    // suspended seller
    await User.updateOne({ _id: seller.id }, { $set: { status: 'suspended' } });
    const afterSuspend = await buyer.agent.get('/api/listings?limit=100');
    assert.ok(afterSuspend.body.data.listings.every((l) => l.seller.id !== seller.id));
    await User.updateOne({ _id: seller.id }, { $set: { status: 'active' } });
  });
});

describe('one item, its photos, and managing your own items', () => {
  let item; // a listing owned by `seller`

  before(async () => {
    const res = await post(seller.agent, sale(books, { title: 'Manage me' }), [jpg(), png()]);
    item = res.body.data.listing;
  });

  it('shows the details to other students, with isMine false', async () => {
    const res = await buyer.agent.get(`/api/listings/${item.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.listing.title, 'Manage me');
    assert.equal(res.body.data.listing.isMine, false);
  });

  it('answers 404 for unknown or malformed ids', async () => {
    assert.equal((await buyer.agent.get('/api/listings/not-an-id')).status, 404);
    assert.equal((await buyer.agent.get(`/api/listings/${'0'.repeat(24)}`)).status, 404);
  });

  it('serves photos to logged-in users only, and only well-formed names', async () => {
    const url = `/api/listings/images/${item.images[0]}`;
    assert.equal((await request(app).get(url)).status, 401);
    const ok = await buyer.agent.get(url);
    assert.equal(ok.status, 200);
    assert.match(ok.headers['content-type'], /^image\//);
    assert.equal(ok.headers['x-content-type-options'], 'nosniff');
    assert.equal((await buyer.agent.get('/api/listings/images/..%2F..%2F.env')).status, 404);
    assert.equal((await buyer.agent.get('/api/listings/images/not-a-uuid.jpg')).status, 404);
    // an ID card must never be reachable through this route
    const idCard = fs.readdirSync(ID_DIR)[0];
    assert.equal((await buyer.agent.get(`/api/listings/images/${idCard}`)).status, 404);
  });

  it('lists only my own items under /mine', async () => {
    const mine = await seller.agent.get('/api/listings/mine');
    assert.equal(mine.status, 200);
    assert.ok(mine.body.data.listings.length > 0);
    assert.ok(mine.body.data.listings.every((l) => l.isMine));
    assert.equal((await admin.agent.get('/api/listings/mine')).status, 403);
  });

  it('lets only the owner close, reopen and delete - and closed items vanish for others', async () => {
    assert.equal((await buyer.agent.patch(`/api/listings/${item.id}/status`).send({ status: 'closed' })).status, 404);
    assert.equal((await buyer.agent.delete(`/api/listings/${item.id}`)).status, 404);
    assert.equal((await seller.agent.patch(`/api/listings/${item.id}/status`).send({ status: 'sold' })).status, 400);

    assert.equal((await seller.agent.patch(`/api/listings/${item.id}/status`).send({ status: 'closed' })).status, 200);
    assert.equal((await buyer.agent.get(`/api/listings/${item.id}`)).status, 404); // gone for others
    assert.equal((await seller.agent.get(`/api/listings/${item.id}`)).status, 200); // owner still sees it
    assert.equal((await admin.agent.get(`/api/listings/${item.id}`)).status, 200); // admin can moderate
    const closedMine = await seller.agent.get('/api/listings/mine?status=closed');
    assert.ok(closedMine.body.data.listings.some((l) => l.id === item.id));
  });

  it('blocks deleting a category that is in use, until its items are deleted', async () => {
    const blocked = await admin.agent.delete(`/api/admin/categories/${books}`);
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.code, 'CATEGORY_IN_USE');

    const used = await addCategory('Short lived');
    const made = await post(seller.agent, sale(used, { title: 'Only one in here' }), [jpg()]);
    const file = made.body.data.listing.images[0];
    assert.equal((await admin.agent.delete(`/api/admin/categories/${used}`)).status, 409);

    assert.equal((await seller.agent.delete(`/api/listings/${made.body.data.listing.id}`)).status, 200);
    assert.ok(!photoFiles().includes(file), 'the photo file is removed with the listing');
    assert.equal((await admin.agent.delete(`/api/admin/categories/${used}`)).status, 200);
  });
});