/**
 * Integration tests for the auth + verification module.
 * Run with:  npm test      (MongoDB must be running; uses the separate "wereuse_test" database)
 */
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27017/wereuse_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret-1234';

const os = require('os');
const fs = require('fs');
const path = require('path');
process.env.STORAGE_DIR = path.join(os.tmpdir(), `wereuse-test-storage-${process.pid}`);

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const app = require('../src/app');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const Admin = require('../src/models/Admin');
const Notification = require('../src/models/Notification');
const PendingRegistration = require('../src/models/PendingRegistration');
const AdminActionLog = require('../src/models/AdminActionLog');
const { ID_DIR, saveIdCard } = require('../src/utils/fileStore');
const { createPlaceholderIdCard } = require('../src/utils/placeholderIdCard');
const { detectImageType } = require('../src/utils/imageType');
const { seedAdmin } = require('../src/scripts/seedAdmin');
const { outbox, lastCodeFor } = require('../src/utils/mailer');
const { backfillRegKeys } = require('../src/utils/backfillRegKeys');
const { purgeExpiredPendingRegistrations } = require('../src/utils/pendingRegistrations');
const { toRegKey } = require('../src/utils/regKey');
const { requireVerified } = require('../src/middleware/auth');

// ---------- helpers ----------
const jpg = () =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]), Buffer.alloc(300, 7)]);
const png = () =>
  Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(300, 9)]);
const JPG = () => ({ buf: jpg(), name: 'id.jpg', type: 'image/jpeg' });

function register(agent, overrides = {}, file = JPG()) {
  const fields = {
    name: 'Test Student',
    email: 'student1@example.com',
    password: 'Passw0rdOK',
    confirmPassword: 'Passw0rdOK',
    universityRegNumber: '241-35-001',
    department: 'CSE',
    batch: '42',
    ...overrides,
  };
  let req = agent.post('/api/auth/register');
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) req = req.field(k, v);
  if (file) req = req.attach('idCard', file.buf, { filename: file.name, contentType: file.type });
  return req;
}

/** Both steps of registration: send the form, read the code from the (captured) e-mail, confirm it. */
async function signUp(agent, overrides = {}, file = JPG()) {
  const res = await register(agent, overrides, file);
  if (res.status !== 202) return res; // let the caller see why it failed
  const email = (overrides.email ?? 'student1@example.com').toLowerCase();
  return agent.post('/api/auth/verify-email').send({ email, code: lastCodeFor(email) });
}

const storedFiles = () => fs.readdirSync(ID_DIR);
const hasCookie = (res) => (res.headers['set-cookie'] || []).some((c) => c.startsWith('wereuse_token='));

let admin; // { agent, id }
const students = {}; // name -> { agent, id, email }

async function makeStudent(key, n) {
  const agent = request.agent(app);
  const res = await signUp(agent, {
    name: `Student ${key.replace(/[0-9]/g, '')}`, // names may not contain digits
    email: `${key}@example.com`,
    universityRegNumber: `241-35-${String(n).padStart(3, '0')}`,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  students[key] = { agent, id: res.body.data.user.id, email: `${key}@example.com` };
  return students[key];
}

before(async () => {
  await connectDB();
  assert.ok(mongoose.connection.name.endsWith('_test'), 'Refusing to run tests on a non-test database');
  await mongoose.connection.dropDatabase();
  await Promise.all([User.init(), Admin.init(), PendingRegistration.init(), Notification.init(), AdminActionLog.init()]);

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
  const res = await agent.post('/api/auth/login').send({ email: 'admin@example.com', password: 'Admin@12345' });
  assert.equal(res.status, 200);
  admin = { agent, id: String(doc._id) };
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  fs.rmSync(process.env.STORAGE_DIR, { recursive: true, force: true });
});

// ---------- tests ----------
describe('health', () => {
  it('reports ok', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.database, 'connected');
  });

  it('returns JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/api/nope');
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
  });
});

describe('registration', () => {
  it('requires the ID card photo', async () => {
    const res = await register(request(app), {}, null);
    assert.equal(res.status, 400);
    assert.ok(res.body.errors.idCard);
  });

  it('validates every text field', async () => {
    const res = await register(request(app), {
      name: 'A',
      email: 'not-an-email',
      password: 'short',
      confirmPassword: 'different',
      universityRegNumber: '!!',
    });
    assert.equal(res.status, 400);
    for (const f of ['name', 'email', 'password', 'confirmPassword', 'universityRegNumber']) {
      assert.ok(res.body.errors[f], `expected an error for ${f}`);
    }
  });

  it('rejects passwords without a number, and mismatching confirmation', async () => {
    const a = await register(request(app), { password: 'onlyletters', confirmPassword: 'onlyletters' });
    assert.match(a.body.errors.password, /letter and one number/);
    const b = await register(request(app), { confirmPassword: 'Passw0rdXX' });
    assert.equal(b.body.errors.confirmPassword, 'Passwords do not match');
  });

  it('rejects a non-image content type', async () => {
    const res = await register(request(app), {}, { buf: Buffer.from('hello'), name: 'a.txt', type: 'text/plain' });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_FILE_TYPE');
  });

  it('rejects a fake image (text pretending to be PNG) by checking the real bytes', async () => {
    const res = await register(request(app), {}, {
      buf: Buffer.from('this is definitely not a png file at all'),
      name: 'fake.png',
      type: 'image/png',
    });
    assert.equal(res.status, 400);
    assert.match(res.body.errors.idCard, /not a valid JPG or PNG/);
  });

  it('rejects images larger than 5 MB', async () => {
    const big = Buffer.concat([jpg(), Buffer.alloc(5 * 1024 * 1024 + 10, 1)]);
    const res = await register(request(app), {}, { buf: big, name: 'big.jpg', type: 'image/jpeg' });
    assert.equal(res.status, 413);
    assert.match(res.body.message, /too large/i);
  });

  it('step 1 e-mails a code and creates NO account yet', async () => {
    const before = storedFiles().length;
    outbox.length = 0;
    const res = await register(request(app));
    assert.equal(res.status, 202, JSON.stringify(res.body));
    assert.equal(hasCookie(res), false, 'not logged in before the code is confirmed');
    assert.equal(res.body.data.email, 'student1@example.com');
    assert.equal(res.body.data.expiresInMinutes, 10);
    assert.match(res.body.message, /st\*\*\*@example\.com/);
    assert.equal(await User.countDocuments({ email: 'student1@example.com' }), 0, 'no student account yet');

    const pending = await PendingRegistration.findOne({ email: 'student1@example.com' });
    assert.ok(pending);
    assert.equal(pending.universityRegNumber, '241-35-001');
    assert.equal(storedFiles().length, before + 1, 'the ID card is stored privately while waiting');

    // the e-mail carries a 6-digit code; only a keyed hash of it is stored
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0].to, 'student1@example.com');
    const code = lastCodeFor('student1@example.com');
    assert.match(code, /^\d{6}$/);
    assert.notEqual(pending.codeHash, code);
    assert.match(pending.passwordHash, /^\$2[aby]\$/);

    // nobody can log in with it yet
    const login = await request(app).post('/api/auth/login').send({ email: 'student1@example.com', password: 'Passw0rdOK' });
    assert.equal(login.status, 401);
  });

  it('a wrong code is refused and counted', async () => {
    const code = lastCodeFor('student1@example.com');
    const wrong = code === '000000' ? '111111' : '000000';
    const res = await request(app).post('/api/auth/verify-email').send({ email: 'student1@example.com', code: wrong });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_CODE');
    assert.match(res.body.errors.code, /4 attempts left/);
    assert.equal(hasCookie(res), false);
    assert.equal((await PendingRegistration.findOne({ email: 'student1@example.com' })).attempts, 1);
  });

  it('step 2: the right code creates the student, sets an httpOnly cookie and never leaks secrets', async () => {
    const before = storedFiles().length;
    const agent = request.agent(app);
    const code = lastCodeFor('student1@example.com');
    const res = await agent.post('/api/auth/verify-email').send({ email: 'STUDENT1@example.com', code });
    assert.equal(res.status, 201, JSON.stringify(res.body));

    const cookie = res.headers['set-cookie'].find((c) => c.startsWith('wereuse_token='));
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);

    const user = res.body.data.user;
    assert.equal(user.verificationStatus, 'pending');
    assert.equal(user.role, 'student');
    assert.equal(user.isVerifiedBadge, false);
    assert.equal(user.hasIdCard, true);
    assert.equal(user.universityRegNumber, '241-35-001');
    assert.ok(user.emailVerifiedAt, 'the verification moment is recorded');
    for (const secret of ['passwordHash', 'idCardImageUrl', '_id', '__v', 'regKey', 'emailChange', 'passwordChangedAt']) {
      assert.equal(secret in user, false, `${secret} must not be in the response`);
    }

    // stored hashed, ID stored privately, waiting entry used up, no file duplicated
    const dbUser = await User.findById(user.id).select('+passwordHash');
    assert.match(dbUser.passwordHash, /^\$2[aby]\$/);
    assert.notEqual(dbUser.passwordHash, 'Passw0rdOK');
    assert.equal(dbUser.regKey, '24135001');
    assert.equal(storedFiles().length, before);
    assert.ok(fs.existsSync(path.join(ID_DIR, dbUser.idCardImageUrl)));
    assert.equal(await PendingRegistration.countDocuments({ email: 'student1@example.com' }), 0);

    // logged in straight away
    const me = await agent.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.data.user.email, 'student1@example.com');
    students.first = { agent, id: user.id, email: 'student1@example.com' };
  });

  it('blocks duplicate email (case-insensitive) and duplicate registration number', async () => {
    const files = storedFiles().length;
    const e = await register(request(app), { email: 'STUDENT1@example.com', universityRegNumber: '241-35-777' });
    assert.equal(e.status, 409);
    assert.ok(e.body.errors.email);

    const r = await register(request(app), { email: 'other@example.com', universityRegNumber: '241-35-001' });
    assert.equal(r.status, 409);
    assert.ok(r.body.errors.universityRegNumber);
    assert.equal(storedFiles().length, files, 'no orphan files after rejected sign-ups');
  });

  it('ignores attempts to self-assign role or verification status (mass assignment)', async () => {
    const res = await signUp(request(app), {
      email: 'sneaky@example.com',
      universityRegNumber: '241-35-555',
      role: 'admin',
      verificationStatus: 'verified',
      status: 'active',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.user.role, 'student');
    assert.equal(res.body.data.user.verificationStatus, 'pending');
  });

  it('rejects NoSQL operator objects in form fields', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .field('name', 'Hacker')
      .field('email[$ne]', 'x')
      .field('password', 'Passw0rdOK')
      .field('confirmPassword', 'Passw0rdOK')
      .field('universityRegNumber', '241-35-999')
      .attach('idCard', jpg(), { filename: 'id.jpg', contentType: 'image/jpeg' });
    assert.equal(res.status, 400);
    assert.ok(res.body.errors.email);
  });
});

describe('login / session', () => {
  it('logs in with correct credentials (pending students are allowed in)', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').send({ email: 'Student1@Example.com', password: 'Passw0rdOK' });
    assert.equal(res.status, 200);
    assert.ok(hasCookie(res));
    assert.equal(res.body.data.user.verificationStatus, 'pending');
    assert.equal('passwordHash' in res.body.data.user, false);
    const dbUser = await User.findOne({ email: 'student1@example.com' });
    assert.ok(dbUser.lastLoginAt);
  });

  it('gives the same generic error for a wrong password and an unknown email', async () => {
    const wrong = await request(app).post('/api/auth/login').send({ email: 'student1@example.com', password: 'WrongPass1' });
    const unknown = await request(app).post('/api/auth/login').send({ email: 'ghost@example.com', password: 'WrongPass1' });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.body.message, unknown.body.message);
    assert.equal(hasCookie(wrong), false);
  });

  it('validates the login body and blocks NoSQL operator injection', async () => {
    const empty = await request(app).post('/api/auth/login').send({});
    assert.equal(empty.status, 400);
    const inj = await request(app)
      .post('/api/auth/login')
      .send({ email: { $ne: null }, password: { $ne: null } });
    assert.equal(inj.status, 400);
    assert.equal(hasCookie(inj), false);
  });

  it('refuses suspended and banned accounts', async () => {
    await signUp(request(app), { email: 'sus@example.com', universityRegNumber: '241-35-321' });
    await User.updateOne({ email: 'sus@example.com' }, { $set: { status: 'suspended' } });
    const res = await request(app).post('/api/auth/login').send({ email: 'sus@example.com', password: 'Passw0rdOK' });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'ACCOUNT_SUSPENDED');
  });

  it('a suspension takes effect immediately for an already logged-in user', async () => {
    const agent = request.agent(app);
    await signUp(agent, { email: 'live@example.com', universityRegNumber: '241-35-322' });
    assert.equal((await agent.get('/api/auth/me')).status, 200);
    await User.updateOne({ email: 'live@example.com' }, { $set: { status: 'banned' } });
    const res = await agent.get('/api/auth/me');
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'ACCOUNT_BANNED');
  });

  it('/me needs a valid token', async () => {
    assert.equal((await request(app).get('/api/auth/me')).status, 401);

    const tampered = jwt.sign({ id: students.first.id }, 'a-different-secret-entirely-1234567890');
    assert.equal((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tampered}`)).status, 401);

    const expired = jwt.sign({ id: students.first.id }, process.env.JWT_SECRET, { expiresIn: -10 });
    const exp = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expired}`);
    assert.equal(exp.status, 401);
    assert.equal(exp.body.code, 'SESSION_EXPIRED');

    const noneAlg = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(
      JSON.stringify({ id: students.first.id })
    ).toString('base64url')}.`;
    assert.equal((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${noneAlg}`)).status, 401);
  });

  it('accepts a Bearer token too (for Postman) and logout clears the cookie', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'student1@example.com', password: 'Passw0rdOK' });
    const token = login.headers['set-cookie'][0].split(';')[0].split('=')[1];
    assert.equal((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)).status, 200);

    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'student1@example.com', password: 'Passw0rdOK' });
    assert.equal((await agent.get('/api/auth/me')).status, 200);
    const out = await agent.post('/api/auth/logout');
    assert.equal(out.status, 200);
    assert.equal((await agent.get('/api/auth/me')).status, 401);
  });
});

describe('ID card privacy', () => {
  it('lets the owner and an admin view it, with no-store caching', async () => {
    const own = await students.first.agent.get(`/api/verification/id-card/${students.first.id}`).buffer(true).parse(binary);
    assert.equal(own.status, 200);
    assert.equal(own.headers['content-type'], 'image/jpeg');
    assert.match(own.headers['cache-control'], /no-store/);
    assert.equal(own.headers['x-content-type-options'], 'nosniff');
    assert.ok(Buffer.isBuffer(own.body) && own.body.length > 100);

    const adm = await admin.agent.get(`/api/verification/id-card/${students.first.id}`);
    assert.equal(adm.status, 200);
  });

  it('refuses other students and anonymous visitors', async () => {
    const other = await makeStudent('intruder', 11);
    const res = await other.agent.get(`/api/verification/id-card/${students.first.id}`);
    assert.equal(res.status, 403);
    assert.equal((await request(app).get(`/api/verification/id-card/${students.first.id}`)).status, 401);
  });

  it('returns 404 for bad ids and exposes no static folder', async () => {
    assert.equal((await admin.agent.get('/api/verification/id-card/not-an-id')).status, 404);
    assert.equal((await admin.agent.get(`/api/verification/id-card/${new mongoose.Types.ObjectId()}`)).status, 404);
    const file = storedFiles()[0];
    assert.equal((await request(app).get(`/storage/id-cards/${file}`)).status, 404);
    assert.equal((await request(app).get(`/id-cards/${file}`)).status, 404);
  });
});

function binary(res, cb) {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}

describe('admin verification queue', () => {
  it('is closed to students and anonymous users', async () => {
    assert.equal((await students.first.agent.get('/api/admin/stats')).status, 403);
    assert.equal((await students.first.agent.get('/api/admin/verifications')).status, 403);
    assert.equal((await request(app).get('/api/admin/verifications')).status, 401);
    assert.equal(
      (await students.first.agent.patch(`/api/admin/verifications/${students.first.id}/approve`)).status,
      403
    );
  });

  it('lists pending students, oldest first, with search and pagination', async () => {
    const res = await admin.agent.get('/api/admin/verifications?status=pending');
    assert.equal(res.status, 200);
    const { users, pagination } = res.body.data;
    assert.ok(users.length >= 2);
    assert.ok(users.every((u) => u.role === 'student' && u.verificationStatus === 'pending'));
    assert.equal(users[0].email, 'student1@example.com'); // registered first
    assert.equal(users.some((u) => 'passwordHash' in u || 'idCardImageUrl' in u), false);
    assert.equal(pagination.page, 1);

    const search = await admin.agent.get('/api/admin/verifications?status=pending&search=intruder');
    assert.equal(search.body.data.users.length, 1);
    assert.equal(search.body.data.users[0].email, 'intruder@example.com');

    const regex = await admin.agent.get('/api/admin/verifications?status=all&search=.*');
    assert.equal(regex.status, 200);
    assert.equal(regex.body.data.users.length, 0, 'search text is escaped, not treated as a regex');

    const page = await admin.agent.get('/api/admin/verifications?status=pending&limit=1&page=2');
    assert.equal(page.body.data.users.length, 1);
    assert.ok(page.body.data.pagination.pages >= 2);
  });

  it('rejects invalid query parameters', async () => {
    assert.equal((await admin.agent.get('/api/admin/verifications?status=banana')).status, 400);
    assert.equal((await admin.agent.get('/api/admin/verifications?page=0')).status, 400);
    assert.equal((await admin.agent.get('/api/admin/verifications?limit=500')).status, 400);
  });

  it('approves a student: status, audit log and notification', async () => {
    const s = students.first;
    const res = await admin.agent.patch(`/api/admin/verifications/${s.id}/approve`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.user.verificationStatus, 'verified');
    assert.equal(res.body.data.user.isVerifiedBadge, true);

    const me = await s.agent.get('/api/auth/me');
    assert.equal(me.body.data.user.verificationStatus, 'verified');

    const log = await AdminActionLog.findOne({ targetId: s.id, actionType: 'approve_user' });
    assert.ok(log);
    assert.equal(String(log.adminId), admin.id);

    const notes = await s.agent.get('/api/notifications');
    assert.equal(notes.body.data.unreadCount, 1);
    assert.match(notes.body.data.notifications[0].message, /approved/i);
    assert.equal(notes.body.data.notifications[0].type, 'verification_status');
  });

  it('does not let the same student be reviewed twice', async () => {
    const again = await admin.agent.patch(`/api/admin/verifications/${students.first.id}/approve`);
    assert.equal(again.status, 409);
    assert.equal(again.body.code, 'ALREADY_REVIEWED');
    const rej = await admin.agent
      .patch(`/api/admin/verifications/${students.first.id}/reject`)
      .send({ reason: 'Changed my mind' });
    assert.equal(rej.status, 409);
  });

  it('requires a reason to reject, then rejects with the reason visible to the student', async () => {
    const s = students.intruder;
    const noReason = await admin.agent.patch(`/api/admin/verifications/${s.id}/reject`).send({});
    assert.equal(noReason.status, 400);
    assert.ok(noReason.body.errors.reason);
    const short = await admin.agent.patch(`/api/admin/verifications/${s.id}/reject`).send({ reason: 'no' });
    assert.equal(short.status, 400);

    const ok = await admin.agent
      .patch(`/api/admin/verifications/${s.id}/reject`)
      .send({ reason: 'The photo is blurry, please upload a clearer one.' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.user.verificationStatus, 'rejected');

    const me = await s.agent.get('/api/auth/me');
    assert.equal(me.body.data.user.verificationStatus, 'rejected');
    assert.match(me.body.data.user.rejectionReason, /blurry/);
    assert.ok(await AdminActionLog.findOne({ targetId: s.id, actionType: 'reject_user' }));
    const notes = await s.agent.get('/api/notifications');
    assert.match(notes.body.data.notifications[0].message, /rejected/i);
  });

  it('returns 404 for unknown / non-student ids', async () => {
    assert.equal((await admin.agent.patch('/api/admin/verifications/xyz/approve')).status, 404);
    assert.equal(
      (await admin.agent.patch(`/api/admin/verifications/${new mongoose.Types.ObjectId()}/approve`)).status,
      404
    );
    assert.equal((await admin.agent.patch(`/api/admin/verifications/${admin.id}/approve`)).status, 404);
  });

  it('reports stats', async () => {
    const res = await admin.agent.get('/api/admin/stats');
    assert.equal(res.status, 200);
    const s = res.body.data.stats;
    assert.equal(s.verified, 1);
    assert.equal(s.rejected, 1);
    assert.equal(s.total, s.pending + s.verified + s.rejected);
  });
});

describe('resubmitting after a rejection', () => {
  it('is refused for verified and for pending students', async () => {
    const v = await students.first.agent.post('/api/verification/resubmit').attach('idCard', jpg(), { filename: 'a.jpg', contentType: 'image/jpeg' });
    assert.equal(v.status, 409);
    const pend = await makeStudent('waiting', 12);
    const p = await pend.agent.post('/api/verification/resubmit').attach('idCard', jpg(), { filename: 'a.jpg', contentType: 'image/jpeg' });
    assert.equal(p.status, 409);
  });

  it('requires a real image', async () => {
    const s = students.intruder;
    assert.equal((await s.agent.post('/api/verification/resubmit')).status, 400);
    const fake = await s.agent
      .post('/api/verification/resubmit')
      .attach('idCard', Buffer.from('not really an image, just text'), { filename: 'x.png', contentType: 'image/png' });
    assert.equal(fake.status, 400);
  });

  it('cannot take another student\'s registration number, and leaves no orphan file', async () => {
    const files = storedFiles().length;
    const res = await students.intruder.agent
      .post('/api/verification/resubmit')
      .field('universityRegNumber', '241-35-001')
      .attach('idCard', png(), { filename: 'new.png', contentType: 'image/png' });
    assert.equal(res.status, 409);
    assert.ok(res.body.errors.universityRegNumber);
    assert.equal(storedFiles().length, files);
  });

  it('sends a rejected student back to the queue and swaps the stored file', async () => {
    const s = students.intruder;
    const before = await User.findById(s.id);
    const oldFile = before.idCardImageUrl;
    assert.ok(fs.existsSync(path.join(ID_DIR, oldFile)));

    const res = await s.agent
      .post('/api/verification/resubmit')
      .field('universityRegNumber', '241-35-0011')
      .attach('idCard', png(), { filename: 'new.png', contentType: 'image/png' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.user.verificationStatus, 'pending');
    assert.equal(res.body.data.user.rejectionReason, '');
    assert.equal(res.body.data.user.universityRegNumber, '241-35-0011');

    const after = await User.findById(s.id);
    assert.notEqual(after.idCardImageUrl, oldFile);
    assert.ok(after.idCardImageUrl.endsWith('.png'));
    assert.equal(fs.existsSync(path.join(ID_DIR, oldFile)), false, 'old ID image is deleted');
    assert.ok(fs.existsSync(path.join(ID_DIR, after.idCardImageUrl)));

    const view = await s.agent.get(`/api/verification/id-card/${s.id}`);
    assert.equal(view.headers['content-type'], 'image/png');
  });
});

describe('notifications', () => {
  it('marks a notification read, only for its owner', async () => {
    const s = students.first;
    const list = await s.agent.get('/api/notifications');
    const id = list.body.data.notifications[0].id;

    const other = students.waiting;
    assert.equal((await other.agent.patch(`/api/notifications/${id}/read`)).status, 404);

    const ok = await s.agent.patch(`/api/notifications/${id}/read`);
    assert.equal(ok.status, 200);
    assert.equal((await s.agent.get('/api/notifications')).body.data.unreadCount, 0);

    assert.equal((await s.agent.patch('/api/notifications/xyz/read')).status, 404);
    assert.equal((await s.agent.patch('/api/notifications/read-all')).status, 200);
    assert.equal((await request(app).get('/api/notifications')).status, 401);
  });
});

describe('requireVerified middleware (used by upcoming listing/chat modules)', () => {
  const run = (user) =>
    new Promise((resolve) => requireVerified({ user }, {}, (err) => resolve(err)));

  it('lets verified students and admins through, blocks the rest', async () => {
    assert.equal(await run({ role: 'student', verificationStatus: 'verified' }), undefined);
    assert.equal(await run({ role: 'admin', verificationStatus: 'verified' }), undefined);
    const pending = await run({ role: 'student', verificationStatus: 'pending' });
    assert.equal(pending.statusCode, 403);
    assert.equal(pending.appCode, 'NOT_VERIFIED');
    const rejected = await run({ role: 'student', verificationStatus: 'rejected' });
    assert.equal(rejected.statusCode, 403);
  });
});

// =====================================================================================
//  Separate `admins` collection (admins are NOT users)
// =====================================================================================
const PNG = () => ({ buf: png(), name: 'admin-id.png', type: 'image/png' });

function createAdminRequest(agent, overrides = {}, file = PNG()) {
  const fields = {
    name: 'Second Admin',
    email: 'second.admin@example.com',
    phone: '01812345678',
    universityRegNumber: 'ADMIN-0002',
    password: 'Passw0rdOK',
    ...overrides,
  };
  let req = agent.post('/api/admin/admins');
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) req = req.field(k, v);
  if (file) req = req.attach('idCard', file.buf, { filename: file.name, contentType: file.type });
  return req;
}

describe('admins are stored in their own collection', () => {
  it('keeps the admin out of `users` and returns the golden badge data', async () => {
    assert.equal(await User.countDocuments({ email: 'admin@example.com' }), 0);
    assert.equal(await Admin.countDocuments({ email: 'admin@example.com' }), 1);

    const res = await admin.agent.get('/api/auth/me');
    assert.equal(res.status, 200);
    const a = res.body.data.user;
    assert.equal(a.role, 'admin');
    assert.deepEqual(a.adminBadge, { label: 'Admin', color: '#FFD700' });
    assert.equal(a.phone, '01712345678');
    assert.equal(a.universityRegNumber, 'ADMIN-0001');
    assert.equal(a.hasIdCard, true);
    assert.equal(a.status, 'active');
    for (const secret of ['passwordHash', 'idCardImageUrl', '_id', '__v']) {
      assert.equal(secret in a, false, `${secret} must not be in the response`);
    }
    assert.equal('verificationStatus' in a, false, 'admins are not verified like students');
  });

  it('stores the admin password only as a bcrypt hash', async () => {
    const a = await Admin.findOne({ email: 'admin@example.com' }).select('+passwordHash');
    assert.match(a.passwordHash, /^\$2[aby]\$/);
    assert.notEqual(a.passwordHash, 'Admin@12345');
  });

  it('logs in through the same login endpoint; the token records the account type', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'ADMIN@example.com', password: 'Admin@12345' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.role, 'admin');
    const token = res.headers['set-cookie'][0].split(';')[0].split('=')[1];
    const payload = jwt.decode(token);
    assert.equal(payload.type, 'admin');
    assert.equal(payload.id, admin.id);
    assert.ok((await Admin.findById(admin.id)).lastLoginAt);

    const student = await request(app).post('/api/auth/login').send({ email: 'student1@example.com', password: 'Passw0rdOK' });
    assert.equal(jwt.decode(student.headers['set-cookie'][0].split(';')[0].split('=')[1]).type, 'student');
    assert.equal(student.body.data.user.role, 'student');
  });

  it('gives the same generic error for a wrong admin password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: 'WrongPass1' });
    assert.equal(res.status, 401);
    assert.equal(res.body.message, 'Invalid email or password.');
  });

  it('rejects tokens with a missing or mismatching account type', async () => {
    const secret = process.env.JWT_SECRET;
    const old = jwt.sign({ id: admin.id }, secret, { expiresIn: '1h' }); // like a token from the first version
    const oldRes = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${old}`);
    assert.equal(oldRes.status, 401);
    assert.equal(oldRes.body.code, 'SESSION_EXPIRED');

    // an admin id presented as a student (and the other way round) matches nothing
    const asStudent = jwt.sign({ id: admin.id, type: 'student' }, secret, { expiresIn: '1h' });
    assert.equal((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${asStudent}`)).status, 401);
    const asAdmin = jwt.sign({ id: students.first.id, type: 'admin' }, secret, { expiresIn: '1h' });
    assert.equal((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${asAdmin}`)).status, 401);
    const bogus = jwt.sign({ id: admin.id, type: 'superuser' }, secret, { expiresIn: '1h' });
    assert.equal((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${bogus}`)).status, 401);
  });
});

describe('creating another admin', () => {
  it('is closed to students and anonymous visitors', async () => {
    const files = storedFiles().length;
    assert.equal((await createAdminRequest(students.first.agent)).status, 403);
    assert.equal((await createAdminRequest(request(app))).status, 401);
    assert.equal(storedFiles().length, files, 'nothing is uploaded before the permission check');
  });

  it('validates every field', async () => {
    const res = await createAdminRequest(admin.agent, {
      name: 'A',
      email: 'nope',
      phone: '12345',
      universityRegNumber: '!!',
      password: 'weak',
    });
    assert.equal(res.status, 400);
    for (const f of ['name', 'email', 'phone', 'universityRegNumber', 'password']) {
      assert.ok(res.body.errors[f], `expected an error for ${f}`);
    }
    const noFile = await createAdminRequest(admin.agent, {}, null);
    assert.equal(noFile.status, 400);
    assert.ok(noFile.body.errors.idCard);
    const fake = await createAdminRequest(admin.agent, {}, { buf: Buffer.from('plain text pretending to be an image'), name: 'x.png', type: 'image/png' });
    assert.equal(fake.status, 400);
  });

  it('creates an admin: phone normalised, ID stored privately, golden badge by default', async () => {
    const before = storedFiles().length;
    const agent = request.agent(app);
    const res = await createAdminRequest(admin.agent, { phone: '+880 1812-345678' });
    assert.equal(res.status, 201, JSON.stringify(res.body));

    const a = res.body.data.admin;
    assert.equal(a.phone, '01812345678');
    assert.equal(a.role, 'admin');
    assert.deepEqual(a.adminBadge, { label: 'Admin', color: '#FFD700' });
    assert.equal(a.hasIdCard, true);
    for (const secret of ['passwordHash', 'idCardImageUrl']) assert.equal(secret in a, false);

    const doc = await Admin.findById(a.id);
    assert.ok(fs.existsSync(path.join(ID_DIR, doc.idCardImageUrl)));
    assert.equal(storedFiles().length, before + 1);
    assert.equal(await User.countDocuments({ email: 'second.admin@example.com' }), 0, 'not created as a student');

    // the new admin can log in and use the admin area
    const login = await agent.post('/api/auth/login').send({ email: 'second.admin@example.com', password: 'Passw0rdOK' });
    assert.equal(login.status, 200);
    assert.equal(login.body.data.user.role, 'admin');
    assert.equal((await agent.get('/api/admin/stats')).status, 200);
    admin.second = { agent, id: a.id };
  });

  it('blocks duplicate email (even a student\'s), phone and registration number', async () => {
    const files = storedFiles().length;
    const studentEmail = await createAdminRequest(admin.agent, { email: 'student1@example.com', phone: '01911111111', universityRegNumber: 'ADMIN-0100' });
    assert.equal(studentEmail.status, 409);
    assert.ok(studentEmail.body.errors.email);

    const dup = await createAdminRequest(admin.agent, { email: 'third@example.com' }); // same phone + reg as admin #2
    assert.equal(dup.status, 409);
    assert.ok(dup.body.errors.phone);
    assert.ok(dup.body.errors.universityRegNumber);
    assert.equal(storedFiles().length, files, 'no orphan files after rejected requests');
  });

  it('stops students registering with an admin\'s email', async () => {
    const res = await register(request(app), { email: 'admin@example.com', universityRegNumber: '241-35-888' });
    assert.equal(res.status, 409);
    assert.ok(res.body.errors.email);
  });

  it('a disabled admin cannot log in, and an open session ends immediately', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'second.admin@example.com', password: 'Passw0rdOK' });
    assert.equal((await agent.get('/api/admin/stats')).status, 200);

    await Admin.updateOne({ _id: admin.second.id }, { $set: { status: 'disabled' } });
    const live = await agent.get('/api/admin/stats');
    assert.equal(live.status, 403);
    assert.equal(live.body.code, 'ACCOUNT_DISABLED');
    const login = await request(app).post('/api/auth/login').send({ email: 'second.admin@example.com', password: 'Passw0rdOK' });
    assert.equal(login.status, 403);

    await Admin.updateOne({ _id: admin.second.id }, { $set: { status: 'active' } }); // re-enable for the next tests
  });
});

describe('admin ID card privacy', () => {
  it('lets an admin view only their own ID card', async () => {
    const own = await admin.agent.get(`/api/admin/id-card/${admin.id}`).buffer(true).parse(binary);
    assert.equal(own.status, 200);
    assert.equal(own.headers['content-type'], 'image/png');
    assert.match(own.headers['cache-control'], /no-store/);
    assert.equal(detectImageType(own.body), 'png');

    assert.equal((await admin.agent.get(`/api/admin/id-card/${admin.second.id}`)).status, 403);
    assert.equal((await admin.second.agent.get(`/api/admin/id-card/${admin.id}`)).status, 403);
    assert.equal((await students.first.agent.get(`/api/admin/id-card/${admin.id}`)).status, 403);
    assert.equal((await request(app).get(`/api/admin/id-card/${admin.id}`)).status, 401);
    assert.equal((await admin.agent.get('/api/admin/id-card/not-an-id')).status, 404);
  });

  it('the student ID card endpoint never serves an admin\'s card', async () => {
    assert.equal((await admin.agent.get(`/api/verification/id-card/${admin.id}`)).status, 404);
    assert.equal((await students.first.agent.get(`/api/verification/id-card/${admin.id}`)).status, 403);
  });
});

describe('audit log: one admin -> many actions', () => {
  it('links every log entry to the admin who did it', async () => {
    // a second admin makes one decision of their own
    const waiting = students.waiting;
    const res = await admin.second.agent.patch(`/api/admin/verifications/${waiting.id}/approve`);
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const first = await AdminActionLog.find({ adminId: admin.id }).populate('adminId');
    const second = await AdminActionLog.find({ adminId: admin.second.id }).populate('adminId');
    assert.ok(first.length >= 2, 'the first admin approved one student and rejected another');
    assert.equal(second.length, 1);
    assert.ok(first.every((log) => log.adminId.email === 'admin@example.com'));
    assert.equal(second[0].adminId.email, 'second.admin@example.com');
    const types = new Set(first.map((l) => l.actionType));
    assert.ok(types.has('approve_user') && types.has('reject_user'));
    assert.ok(types.has('create_admin'), 'creating the second admin was logged too');
  });

  it('shows the reviewing admin (name + badge only) in the queue', async () => {
    const res = await admin.agent.get('/api/admin/verifications?status=verified&limit=50');
    const mine = res.body.data.users.find((u) => u.id === students.first.id);
    assert.equal(mine.reviewedBy.name, 'Test Admin');
    assert.deepEqual(mine.reviewedBy.adminBadge, { label: 'Admin', color: '#FFD700' });
    for (const hidden of ['email', 'phone', 'universityRegNumber', 'passwordHash']) {
      assert.equal(hidden in mine.reviewedBy, false, `${hidden} must not leak through reviewedBy`);
    }
    const byTheSecondAdmin = res.body.data.users.find((u) => u.id === students.waiting.id);
    assert.equal(byTheSecondAdmin.reviewedBy.name, 'Second Admin');
  });
});

describe('seed script and migration from the first version', () => {
  it('generates a valid placeholder ID card image', () => {
    const png1 = createPlaceholderIdCard();
    assert.equal(detectImageType(png1), 'png');
    assert.equal(png1.readUInt32BE(16), 640); // IHDR width
    assert.equal(png1.readUInt32BE(20), 400); // IHDR height
  });

  it('creates an admin with a placeholder ID card, and is safe to run again', async () => {
    const input = { email: 'seed.admin@example.com', phone: '01912345678', universityRegNumber: 'ADMIN-0003', password: 'Seeded@123' };
    const first = await seedAdmin(input);
    assert.equal(first.created, true);
    assert.equal(first.placeholderIdCard, true);
    const stored = await Admin.findOne({ email: input.email });
    assert.equal(detectImageType(fs.readFileSync(path.join(ID_DIR, stored.idCardImageUrl))), 'png');
    assert.equal(stored.adminBadge.label, 'Admin');

    const again = await seedAdmin({ ...input, password: 'Seeded@456' });
    assert.equal(again.created, false);
    assert.equal(await Admin.countDocuments({ email: input.email }), 1);
    const login = await request(app).post('/api/auth/login').send({ email: input.email, password: 'Seeded@456' });
    assert.equal(login.status, 200);
    assert.equal(login.body.data.user.role, 'admin');
  });

  it('uses a real ID card photo when one is given', async () => {
    const file = path.join(os.tmpdir(), `real-id-${process.pid}.jpg`);
    fs.writeFileSync(file, jpg());
    const res = await seedAdmin({ email: 'photo.admin@example.com', phone: '01512345678', universityRegNumber: 'ADMIN-0004', idCardPath: file });
    assert.equal(res.placeholderIdCard, false);
    const stored = await Admin.findOne({ email: 'photo.admin@example.com' });
    assert.ok(stored.idCardImageUrl.endsWith('.jpg'));
    fs.rmSync(file);
  });

  it('rejects a missing or non-image ID card file', async () => {
    await assert.rejects(
      seedAdmin({ email: 'bad1@example.com', phone: '01512345679', universityRegNumber: 'ADMIN-0005', idCardPath: '/definitely/not/here.jpg' }),
      /Cannot read the ID card photo/
    );
    const txt = path.join(os.tmpdir(), `not-image-${process.pid}.txt`);
    fs.writeFileSync(txt, 'just text');
    await assert.rejects(
      seedAdmin({ email: 'bad2@example.com', phone: '01512345670', universityRegNumber: 'ADMIN-0006', idCardPath: txt }),
      /JPG or PNG/
    );
    fs.rmSync(txt);
    assert.equal(await Admin.countDocuments({ email: { $in: ['bad1@example.com', 'bad2@example.com'] } }), 0);
  });

  it('moves an admin left in `users` by the first version, keeps its id, and never touches students', async () => {
    const legacyId = new mongoose.Types.ObjectId();
    await User.collection.insertOne({
      _id: legacyId,
      name: 'Old Admin',
      email: 'old.admin@example.com',
      passwordHash: 'x',
      universityRegNumber: 'ADMIN-0009',
      role: 'admin',
      verificationStatus: 'verified',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await AdminActionLog.create({ adminId: legacyId, actionType: 'approve_user', targetType: 'user', targetId: students.first.id });
    const studentsBefore = await User.countDocuments();
    const studentRoleBefore = await User.collection.countDocuments({ role: { $ne: 'admin' } });

    const res = await seedAdmin({ email: 'old.admin@example.com', phone: '01612345678', universityRegNumber: 'ADMIN-0009', password: 'Migrated@123' });
    assert.equal(res.migrated, true);
    assert.equal(String(res.admin._id), String(legacyId), 'the id is kept');
    assert.equal(await User.collection.countDocuments({ _id: legacyId }), 0, 'removed from users');
    assert.equal(await User.collection.countDocuments({ role: 'admin' }), 0);
    assert.equal((await User.collection.countDocuments({ role: { $ne: 'admin' } })), studentRoleBefore, 'students untouched');
    assert.equal(await User.countDocuments(), studentsBefore - 1 + 0, 'only the old admin entry left users');

    // the old audit entry still points at the (now separate) admin
    const log = await AdminActionLog.findOne({ adminId: legacyId }).populate('adminId');
    assert.equal(log.adminId.email, 'old.admin@example.com');
    const login = await request(app).post('/api/auth/login').send({ email: 'old.admin@example.com', password: 'Migrated@123' });
    assert.equal(login.body.data.user.role, 'admin');
  });

  it('refuses to turn an existing student into an admin', async () => {
    await assert.rejects(
      seedAdmin({ email: 'student1@example.com', phone: '01412345678', universityRegNumber: 'ADMIN-0010' }),
      (err) => err.statusCode === 409 && /student account already uses/.test(err.message)
    );
    assert.equal(await Admin.countDocuments({ email: 'student1@example.com' }), 0);
  });
});

// =====================================================================================
//  An admin can make any student an admin
// =====================================================================================
describe('promoting a student to admin', () => {
  const promote = (agent, id, body) => agent.post(`/api/admin/students/${id}/promote`).send(body);

  it('logs the creation of an admin in the audit trail', async () => {
    const log = await AdminActionLog.findOne({ actionType: 'create_admin', targetId: admin.second.id });
    assert.ok(log);
    assert.equal(String(log.adminId), admin.id);
    assert.equal(log.targetType, 'admin');
    assert.equal(log.details, 'second.admin@example.com');
  });

  it('is closed to students and anonymous visitors', async () => {
    const target = await makeStudent('promo1', 41);
    assert.equal((await promote(students.first.agent, target.id, { phone: '01311111111' })).status, 403);
    assert.equal((await promote(request(app), target.id, { phone: '01311111111' })).status, 401);
    assert.equal(await Admin.countDocuments({ email: target.email }), 0);
    assert.equal(await User.countDocuments({ email: target.email }), 1);
  });

  it('validates the phone number and the student id', async () => {
    const target = students.promo1;
    const bad = await promote(admin.agent, target.id, { phone: '12345' });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.errors.phone);
    assert.equal((await promote(admin.agent, target.id, {})).status, 400);
    assert.equal((await promote(admin.agent, 'not-an-id', { phone: '01311111111' })).status, 404);
    assert.equal((await promote(admin.agent, new mongoose.Types.ObjectId(), { phone: '01311111111' })).status, 404);
    assert.equal(await User.countDocuments({ _id: target.id }), 1, 'nothing changed');
  });

  it('moves the student into admins and keeps the id, password, registration number and ID card', async () => {
    const target = students.promo1; // still "pending": ANY student can be promoted
    await Notification.create({ userId: target.id, type: 'verification_status', message: 'hello' });
    const old = await User.findById(target.id).select('+passwordHash');
    const files = storedFiles().length;

    const res = await promote(admin.agent, target.id, { phone: '+880 1311-111111' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.match(res.body.message, /is now an admin/);
    const a = res.body.data.admin;
    assert.equal(a.id, target.id);
    assert.equal(a.role, 'admin');
    assert.equal(a.phone, '01311111111');
    assert.deepEqual(a.adminBadge, { label: 'Admin', color: '#FFD700' });
    assert.equal(a.hasIdCard, true);
    for (const secret of ['passwordHash', 'idCardImageUrl']) assert.equal(secret in a, false);

    // moved, not copied
    assert.equal(await User.countDocuments({ _id: target.id }), 0);
    const doc = await Admin.findById(target.id).select('+passwordHash');
    assert.equal(doc.passwordHash, old.passwordHash, 'same password hash, so the same password works');
    assert.equal(doc.name, old.name);
    assert.equal(doc.universityRegNumber, old.universityRegNumber);
    assert.equal(doc.idCardImageUrl, old.idCardImageUrl);
    assert.equal(storedFiles().length, files, 'no ID file was duplicated or deleted');
    assert.ok(fs.existsSync(path.join(ID_DIR, old.idCardImageUrl)));
    assert.equal(await Notification.countDocuments({ userId: target.id }), 0);

    // audit trail
    const log = await AdminActionLog.findOne({ actionType: 'promote_to_admin', targetId: target.id });
    assert.ok(log);
    assert.equal(String(log.adminId), admin.id);
    assert.equal(log.details, target.email);

    // the old student session ends; the same email + password now open an ADMIN session
    assert.equal((await target.agent.get('/api/auth/me')).status, 401);
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ email: target.email, password: 'Passw0rdOK' });
    assert.equal(login.status, 200);
    assert.equal(login.body.data.user.role, 'admin');
    assert.equal((await agent.get('/api/admin/stats')).status, 200);
    const card = await agent.get(`/api/admin/id-card/${target.id}`);
    assert.equal(card.status, 200);
    assert.match(card.headers['content-type'], /image\/(jpeg|png)/);

    // gone from the student queue
    const list = await admin.agent.get('/api/admin/verifications?status=all&limit=50');
    assert.equal(list.body.data.users.some((u) => u.id === target.id), false);
    students.promo1.asAdmin = agent;
  });

  it('a newly promoted admin can promote others too (any admin may)', async () => {
    const other = await makeStudent('promo8', 48);
    const res = await promote(students.promo1.asAdmin, other.id, { phone: '01366666666' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const log = await AdminActionLog.findOne({ actionType: 'promote_to_admin', targetId: other.id });
    assert.equal(String(log.adminId), students.promo1.id, 'the log names the admin who did it');
  });

  it('cannot promote the same person twice, even when two admins click at the same moment', async () => {
    const target = await makeStudent('promo2', 42);
    const [r1, r2] = await Promise.all([
      promote(admin.agent, target.id, { phone: '01322222222' }),
      promote(admin.second.agent, target.id, { phone: '01333333333' }),
    ]);
    const codes = [r1.status, r2.status].sort();
    assert.equal(codes[0], 200, 'exactly one request wins');
    assert.ok([404, 409].includes(codes[1]), `the other one is refused (got ${codes[1]})`);
    assert.equal(await Admin.countDocuments({ _id: target.id }), 1);
    assert.equal(await User.countDocuments({ _id: target.id }), 0);
    assert.equal((await promote(admin.agent, target.id, { phone: '01344444444' })).status, 404);
  });

  it('does not promote a suspended or banned student', async () => {
    const t = await makeStudent('promo3', 43);
    await User.updateOne({ _id: t.id }, { $set: { status: 'suspended' } });
    const res = await promote(admin.agent, t.id, { phone: '01355555555' });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'ACCOUNT_NOT_ACTIVE');
    assert.equal(await User.countDocuments({ _id: t.id }), 1);
    assert.equal(await Admin.countDocuments({ _id: t.id }), 0);
  });

  it('refuses a phone number another admin already uses, and changes nothing', async () => {
    const t = await makeStudent('promo4', 44);
    const res = await promote(admin.agent, t.id, { phone: '01712345678' }); // the first test admin's number
    assert.equal(res.status, 409);
    assert.ok(res.body.errors.phone);
    assert.equal(await User.countDocuments({ _id: t.id }), 1);
    assert.equal(await Admin.countDocuments({ _id: t.id }), 0);
  });

  it('refuses a student who has no ID card on file', async () => {
    const t = await makeStudent('promo5', 45);
    await User.updateOne({ _id: t.id }, { $set: { idCardImageUrl: null } });
    const res = await promote(admin.agent, t.id, { phone: '01377777777' });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'NO_ID_CARD');
    assert.equal(await User.countDocuments({ _id: t.id }), 1);
  });

  it('refuses when an admin already uses the student\'s email or registration number', async () => {
    const t = await makeStudent('promo6', 46);
    const file = await saveIdCard(createPlaceholderIdCard(), 'png');
    await Admin.create({
      name: 'Clash Admin', email: t.email, phone: '01388888888', universityRegNumber: 'ADMIN-0077',
      idCardImageUrl: file, passwordHash: await Admin.hashPassword('Passw0rdOK'),
    });
    const res = await promote(admin.agent, t.id, { phone: '01399999999' });
    assert.equal(res.status, 409);
    assert.match(res.body.message, /already uses/);
    assert.equal(await User.countDocuments({ _id: t.id }), 1);
    await Admin.deleteOne({ email: t.email });
  });

  it('undoes everything if the student record cannot be removed (nobody ends up in both collections)', async () => {
    const t = await makeStudent('promo7', 47);
    const original = User.deleteOne;
    User.deleteOne = async () => {
      throw new Error('simulated database failure');
    };
    let res;
    try {
      res = await promote(admin.agent, t.id, { phone: '01411111111' });
    } finally {
      User.deleteOne = original;
    }
    assert.equal(res.status, 500);
    assert.equal(await Admin.countDocuments({ _id: t.id }), 0, 'the half-created admin was removed again');
    assert.equal(await User.countDocuments({ _id: t.id }), 1, 'the student is untouched');
    assert.equal((await t.agent.get('/api/auth/me')).status, 200, 'and can still use their account');
  });
});

// =====================================================================================
//  E-mail verification: limits, expiry, resending, clean-up
// =====================================================================================
const verifyEmail = (email, code) => request(app).post('/api/auth/verify-email').send({ email, code });
const resendCode = (email) => request(app).post('/api/auth/resend-code').send({ email });
const startSignUp = (key, n, overrides = {}) =>
  register(request(app), { name: 'Test Student', email: `${key}@example.com`, universityRegNumber: `241-35-${n}`, ...overrides });
const wrongCodeFor = (email) => (lastCodeFor(email) === '000000' ? '111111' : '000000');
// the cooldown is 60 s: pretend the last e-mail was sent two minutes ago
const ageLastEmail = (email) => PendingRegistration.updateOne({ email }, { $set: { lastSentAt: new Date(Date.now() - 120000) } });

describe('e-mail verification', () => {
  it('rejects a code that is not exactly 6 digits, and unknown e-mails', async () => {
    const bad = await verifyEmail('student1@example.com', 'abc');
    assert.equal(bad.status, 400);
    assert.match(bad.body.errors.code, /6-digit/);
    assert.equal((await verifyEmail('student1@example.com', '12345')).status, 400);

    const none = await verifyEmail('nobody-waiting@example.com', '123456');
    assert.equal(none.status, 400);
    assert.equal(none.body.code, 'NO_PENDING_REGISTRATION');
  });

  it('locks a code after 5 wrong guesses (even the right code is then refused) until a new code is requested', async () => {
    const { email } = { email: 'ev1@example.com' };
    assert.equal((await startSignUp('ev1', '101')).status, 202);
    const oldCode = lastCodeFor(email);

    for (let i = 1; i <= 5; i += 1) {
      const res = await verifyEmail(email, wrongCodeFor(email));
      assert.equal(res.status, 400, `guess ${i}`);
    }
    const locked = await verifyEmail(email, oldCode); // the CORRECT code, but too late
    assert.equal(locked.status, 429);
    assert.equal(locked.body.code, 'TOO_MANY_ATTEMPTS');
    assert.equal(await User.countDocuments({ email }), 0);

    await ageLastEmail(email);
    assert.equal((await resendCode(email)).status, 200);
    const fresh = await verifyEmail(email, lastCodeFor(email));
    assert.equal(fresh.status, 201, JSON.stringify(fresh.body));
    assert.equal((await PendingRegistration.countDocuments({ email })), 0);
  });

  it('refuses an expired code, and a new code fixes it', async () => {
    const email = 'ev2@example.com';
    await startSignUp('ev2', '102');
    await PendingRegistration.updateOne({ email }, { $set: { codeExpiresAt: new Date(Date.now() - 1000) } });

    const expired = await verifyEmail(email, lastCodeFor(email));
    assert.equal(expired.status, 400);
    assert.equal(expired.body.code, 'CODE_EXPIRED');

    await ageLastEmail(email);
    assert.equal((await resendCode(email)).status, 200);
    assert.equal((await verifyEmail(email, lastCodeFor(email))).status, 201);
  });

  it('allows only one e-mail per minute: resending and re-registering too soon are refused', async () => {
    const email = 'ev3@example.com';
    await startSignUp('ev3', '103');
    const sent = outbox.length;

    const again = await resendCode(email);
    assert.equal(again.status, 429);
    assert.equal(again.body.code, 'RESEND_COOLDOWN');
    const restart = await startSignUp('ev3', '103');
    assert.equal(restart.status, 429);
    assert.equal(outbox.length, sent, 'no extra e-mail was sent');
  });

  it('a resent code replaces the old one, which stops working', async () => {
    const email = 'ev3@example.com';
    const oldCode = lastCodeFor(email);
    await ageLastEmail(email);
    assert.equal((await resendCode(email)).status, 200);
    const newCode = lastCodeFor(email);
    assert.equal((await PendingRegistration.findOne({ email })).resendCount, 1);
    if (newCode !== oldCode) {
      assert.equal((await verifyEmail(email, oldCode)).status, 400, 'the old code no longer works');
    }
    assert.equal((await verifyEmail(email, newCode)).status, 201);
  });

  it('gives the same answer for an e-mail nobody is registering (nothing to learn from it)', async () => {
    const res = await resendCode('never-registered@example.com');
    assert.equal(res.status, 200);
    assert.match(res.body.message, /If a registration is waiting/);
  });

  it('limits how many new codes one registration may request', async () => {
    const email = 'ev4@example.com';
    await startSignUp('ev4', '104');
    await PendingRegistration.updateOne({ email }, { $set: { resendCount: 5, lastSentAt: new Date(Date.now() - 120000) } });
    const res = await resendCode(email);
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'TOO_MANY_RESENDS');
  });

  it('starting over with the same e-mail replaces the waiting registration and removes its old ID file', async () => {
    const email = 'ev4@example.com';
    const filesBefore = storedFiles().length;
    const old = await PendingRegistration.findOne({ email });
    await ageLastEmail(email);

    const res = await startSignUp('ev4', '104', { name: 'Changed Name' });
    assert.equal(res.status, 202);
    assert.equal(await PendingRegistration.countDocuments({ email }), 1);
    assert.equal((await PendingRegistration.findOne({ email })).name, 'Changed Name');
    assert.equal(fs.existsSync(path.join(ID_DIR, old.idCardImageUrl)), false, 'the replaced ID file is gone');
    assert.equal(storedFiles().length, filesBefore, 'one file out, one file in');
  });

  it('removes everything again if the e-mail cannot be delivered', async () => {
    const files = storedFiles().length;
    const res = await startSignUp('bounce', '105', { email: 'bounce@example.com' });
    assert.equal(res.status, 502);
    assert.equal(res.body.code, 'EMAIL_SEND_FAILED');
    assert.equal(await PendingRegistration.countDocuments({ email: 'bounce@example.com' }), 0);
    assert.equal(storedFiles().length, files, 'no orphaned ID file');
  });

  it('deletes expired sign-ups and their ID files, but never a file that belongs to a real account', async () => {
    const email = 'ev5@example.com';
    await startSignUp('ev5', '106');
    const pending = await PendingRegistration.findOne({ email });
    const file = path.join(ID_DIR, pending.idCardImageUrl);
    assert.ok(fs.existsSync(file));
    await PendingRegistration.updateOne({ email }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    assert.ok((await purgeExpiredPendingRegistrations()) >= 1);
    assert.equal(await PendingRegistration.countDocuments({ email }), 0);
    assert.equal(fs.existsSync(file), false);
    assert.equal((await verifyEmail(email, '123456')).status, 400, 'an expired sign-up cannot be confirmed');

    // a completed sign-up's file survives the clean-up
    const done = await makeStudent('ev6', 107);
    await purgeExpiredPendingRegistrations();
    assert.equal((await done.agent.get(`/api/verification/id-card/${done.id}`)).status, 200);
  });

  it('one code can only ever create one account, even if it is sent twice at once', async () => {
    const email = 'ev7@example.com';
    await startSignUp('ev7', '108');
    const code = lastCodeFor(email);
    const [a, b] = await Promise.all([verifyEmail(email, code), verifyEmail(email, code)]);
    const codes = [a.status, b.status].sort();
    assert.equal(codes[0], 201, 'exactly one request wins');
    assert.ok([400, 409].includes(codes[1]), `the other is refused (got ${codes[1]})`);
    assert.equal(await User.countDocuments({ email }), 1);
  });

  it('refuses the confirmation if the registration number was taken while the code was in the mail', async () => {
    const email = 'ev8@example.com';
    await startSignUp('ev8', '109', { universityRegNumber: '241-35-109' });
    const files = storedFiles().length;
    // somebody else completes a sign-up with the same number first (a different spelling of it)
    const winner = await signUp(request(app), { email: 'ev9@example.com', universityRegNumber: '24135109' });
    assert.equal(winner.status, 201, JSON.stringify(winner.body));

    const late = await verifyEmail(email, lastCodeFor(email));
    assert.equal(late.status, 409);
    assert.ok(late.body.errors.universityRegNumber);
    assert.equal(await User.countDocuments({ email }), 0);
    assert.equal(await PendingRegistration.countDocuments({ email }), 0);
    assert.equal(storedFiles().length, files, 'the loser\'s ID file was removed (the winner\'s was added)');
  });
});

// =====================================================================================
//  One account per university registration number
// =====================================================================================
describe('one account per university registration number', () => {
  it('treats different spellings of the same number as the same number', () => {
    assert.equal(toRegKey('241-35-032'), '24135032');
    assert.equal(toRegKey('241/35/032'), '24135032');
    assert.equal(toRegKey('24135032'), '24135032');
    assert.equal(toRegKey('adm-in 0001'), 'ADMIN0001');
  });

  it('blocks every spelling of a number that a student already has', async () => {
    // students.first has 241-35-001
    for (const variant of ['24135001', '241/35/001', '241-35001', '2413-5-001']) {
      const res = await register(request(app), { email: `variant${variant.length}@example.com`, universityRegNumber: variant });
      assert.equal(res.status, 409, `"${variant}" should be refused`);
      assert.ok(res.body.errors.universityRegNumber);
    }
    assert.equal(await PendingRegistration.countDocuments({ email: /^variant/ }), 0);
  });

  it('blocks an admin\'s number for students, in any spelling', async () => {
    for (const reg of ['ADMIN-0001', 'ADMIN0001', 'admin/0001']) {
      const res = await register(request(app), { email: 'wants-admin-number@example.com', universityRegNumber: reg });
      assert.equal(res.status, 409, `"${reg}" should be refused`);
      assert.ok(res.body.errors.universityRegNumber);
    }
  });

  it('blocks creating an admin with a student\'s number, and the other way round', async () => {
    const res = await createAdminRequest(admin.agent, {
      email: 'dup.reg.admin@example.com',
      phone: '01711112222',
      universityRegNumber: '24135001',
    });
    assert.equal(res.status, 409);
    assert.ok(res.body.errors.universityRegNumber);
    assert.equal(await Admin.countDocuments({ email: 'dup.reg.admin@example.com' }), 0);

    await assert.rejects(
      seedAdmin({ email: 'seed.dup@example.com', phone: '01711113333', universityRegNumber: '241/35/001' }),
      (err) => err.statusCode === 409 && /student already uses/.test(err.message)
    );
  });

  it('the database itself refuses a second account with the same number (unique index)', async () => {
    await assert.rejects(
      User.create({
        name: 'Impostor', email: 'impostor@example.com', passwordHash: 'x', universityRegNumber: '241/35/001',
        idCardImageUrl: 'x.jpg',
      }),
      (err) => err.code === 11000 // MongoDB's "duplicate key" error
    );
  });

  it('a rejected student cannot "correct" their number into somebody else\'s', async () => {
    const t = await makeStudent('regfix', 110);
    await admin.agent.patch(`/api/admin/verifications/${t.id}/reject`).send({ reason: 'The photo is blurry, please retake it.' });
    const files = storedFiles().length;

    const clash = await t.agent
      .post('/api/verification/resubmit')
      .field('universityRegNumber', '241/35/001')
      .attach('idCard', png(), { filename: 'new.png', contentType: 'image/png' });
    assert.equal(clash.status, 409);
    assert.ok(clash.body.errors.universityRegNumber);
    assert.equal(storedFiles().length, files, 'no orphan file');

    // writing their OWN number in another style is fine, and the key stays consistent
    const own = await t.agent
      .post('/api/verification/resubmit')
      .field('universityRegNumber', '241/35/110')
      .attach('idCard', png(), { filename: 'new.png', contentType: 'image/png' });
    assert.equal(own.status, 200, JSON.stringify(own.body));
    const doc = await User.findById(t.id);
    assert.equal(doc.universityRegNumber, '241/35/110');
    assert.equal(doc.regKey, '24135110');
  });

  it('fills in the key for accounts created before this rule existed, and flags look-alike duplicates', async () => {
    const scratch = mongoose.connection.collection('scratch_regkeys');
    const [a, b, c, d] = [1, 2, 3, 4].map(() => new mongoose.Types.ObjectId());
    await scratch.insertMany([
      { _id: a, universityRegNumber: '241-35-900' },
      { _id: b, universityRegNumber: '24135900' }, // same person's number, different spelling
      { _id: c, universityRegNumber: 'ABC-123-XY', regKey: 'ABC123XY' }, // already has a key
      { _id: d, universityRegNumber: 'ZZZ-111' },
    ]);
    const { duplicates } = await backfillRegKeys([{ name: 'scratch', collection: scratch }]);

    const byId = Object.fromEntries((await scratch.find({}).toArray()).map((doc) => [String(doc._id), doc]));
    assert.equal(byId[a].regKey, '24135900');
    assert.match(byId[b].regKey, /^24135900__DUPLICATE__/, 'the look-alike is marked, not silently merged');
    assert.equal(byId[c].regKey, 'ABC123XY');
    assert.equal(byId[d].regKey, 'ZZZ111');
    assert.equal(duplicates.length, 1);
    assert.equal(duplicates[0].id, String(b));

    const again = await backfillRegKeys([{ name: 'scratch', collection: scratch }]); // safe to repeat
    assert.equal(again.duplicates.length, 0);
    await scratch.drop();
  });

  it('accounts from before e-mail verification existed still work (grandfathered)', async () => {
    const legacyId = new mongoose.Types.ObjectId();
    await User.collection.insertOne({
      _id: legacyId,
      name: 'Old Student',
      email: 'old.student@example.com',
      passwordHash: await User.hashPassword('Passw0rdOK'),
      universityRegNumber: '241-35-777',
      idCardImageUrl: students.first && (await User.findById(students.first.id)).idCardImageUrl,
      role: 'student', // the first version stored this field
      verificationStatus: 'verified',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ email: 'old.student@example.com', password: 'Passw0rdOK' });
    assert.equal(login.status, 200);
    assert.equal(login.body.data.user.role, 'student');
    assert.equal(login.body.data.user.emailVerifiedAt, null);
    assert.equal((await agent.patch('/api/profile').send({ name: 'Old Student Renamed' })).status, 200, 'verified, so they may edit their profile');

    await backfillRegKeys([{ name: 'users', collection: User.collection }]);
    assert.equal((await User.collection.findOne({ _id: legacyId })).regKey, '24135777');
    assert.equal(await regKeyTaken('24135777'), true, 'and from now on their number is protected too');
    await User.collection.deleteOne({ _id: legacyId });
  });
});

async function regKeyTaken(key) {
  const res = await register(request(app), { email: `probe${key}@example.com`, universityRegNumber: key });
  return res.status === 409;
}

// =====================================================================================
//  Profile editing (verified students and admins)
// =====================================================================================
const approve = (id) => admin.agent.patch(`/api/admin/verifications/${id}/approve`);
const patchProfile = (agent, body) => agent.patch('/api/profile').send(body);
const staleToken = (id, type) =>
  jwt.sign({ id, type, iat: Math.floor(Date.now() / 1000) - 120 }, process.env.JWT_SECRET, { expiresIn: '1h' }); // issued 2 minutes ago

describe('profile editing', () => {
  let me; // a verified student

  before(async () => {
    me = await makeStudent('profa', 61);
    assert.equal((await approve(me.id)).status, 200);
  });

  it('is closed to anonymous visitors and to students who are not verified', async () => {
    assert.equal((await patchProfile(request(app), { name: 'Nobody Here' })).status, 401);

    const pending = await makeStudent('profpend', 62); // still waiting for the admin
    const res = await patchProfile(pending.agent, { name: 'Pending Person' });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'NOT_VERIFIED');

    const rejected = await makeStudent('profrej', 63);
    await admin.agent.patch(`/api/admin/verifications/${rejected.id}/reject`).send({ reason: 'The photo is blurry, retake it.' });
    assert.equal((await patchProfile(rejected.agent, { name: 'Rejected Person' })).status, 403);
    assert.equal((await User.findById(pending.id)).name, 'Student profpend'.replace(/[0-9]/g, ''), 'nothing was changed');
  });

  it('lets a verified student edit name, department and batch', async () => {
    const res = await patchProfile(me.agent, { name: 'Renamed Student', department: 'EEE', batch: '45' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const u = res.body.data.user;
    assert.equal(u.name, 'Renamed Student');
    assert.equal(u.department, 'EEE');
    assert.equal(u.batch, '45');
    assert.equal(u.universityRegNumber, '241-35-061', 'unchanged');
    assert.equal((await me.agent.get('/api/auth/me')).body.data.user.name, 'Renamed Student');

    const clear = await patchProfile(me.agent, { department: '' }); // clearing an optional field is fine
    assert.equal(clear.body.data.user.department, '');
  });

  it('validates the fields', async () => {
    assert.ok((await patchProfile(me.agent, { name: 'A' })).body.errors.name);
    assert.ok((await patchProfile(me.agent, { name: 'Bad N4me' })).body.errors.name);
    assert.ok((await patchProfile(me.agent, { department: 'x'.repeat(81) })).body.errors.department);
    assert.ok((await patchProfile(me.agent, { batch: 'x'.repeat(21) })).body.errors.batch);
    const empty = await patchProfile(me.agent, {});
    assert.equal(empty.status, 400);
    assert.equal(empty.body.code, 'NOTHING_TO_UPDATE');
    assert.equal((await User.findById(me.id)).name, 'Renamed Student');
  });

  it('REFUSES to change the university registration number or the ID card photo', async () => {
    const before = await User.findById(me.id);
    const attempts = [
      { universityRegNumber: '241-35-999' },
      { regKey: '24135999' },
      { idCardImageUrl: 'evil.png' },
      { idCard: 'evil.png' },
    ];
    for (const body of attempts) {
      const res = await patchProfile(me.agent, { name: 'Sneaky Change', ...body });
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(res.body.code, 'FIELD_LOCKED');
    }
    const regAttempt = await patchProfile(me.agent, { universityRegNumber: '241-35-999' });
    assert.match(regAttempt.body.errors.universityRegNumber, /cannot be changed/);

    const after = await User.findById(me.id);
    assert.equal(after.universityRegNumber, before.universityRegNumber);
    assert.equal(after.regKey, before.regKey);
    assert.equal(after.idCardImageUrl, before.idCardImageUrl);
    assert.equal(after.name, before.name, 'the request is refused as a whole (the name was not changed either)');
  });

  it('cannot swap the ID card photo by uploading a file to the profile route', async () => {
    const before = await User.findById(me.id);
    const res = await me.agent.patch('/api/profile').attach('idCard', png(), { filename: 'new.png', contentType: 'image/png' });
    assert.equal(res.status, 400);
    assert.equal((await User.findById(me.id)).idCardImageUrl, before.idCardImageUrl);
  });

  it('ignores fields a user must never set themselves (role, status, verification)', async () => {
    const res = await patchProfile(me.agent, {
      name: 'Still A Student', role: 'admin', status: 'banned', verificationStatus: 'rejected', rating: 5,
    });
    assert.equal(res.status, 200);
    const u = res.body.data.user;
    assert.equal(u.role, 'student');
    assert.equal(u.status, 'active');
    assert.equal(u.verificationStatus, 'verified');
    assert.equal(u.rating, 0);
  });

  it('tells the e-mail form apart from the profile form', async () => {
    const res = await patchProfile(me.agent, { email: 'sneaky@elsewhere.com' });
    assert.equal(res.status, 400);
    assert.match(res.body.errors.email, /verification code/);
    assert.equal((await User.findById(me.id)).email, 'profa@example.com');
  });

  it('never exposes internal or secret fields', async () => {
    const u = (await me.agent.get('/api/auth/me')).body.data.user;
    for (const hidden of ['passwordHash', 'idCardImageUrl', 'regKey', 'emailChange', 'passwordChangedAt', 'codeHash']) {
      assert.equal(hidden in u, false, `${hidden} must not be exposed`);
    }
    assert.equal(u.pendingEmail, null);
  });

  it('lets an admin edit name and phone, but not their registration number or ID card', async () => {
    const res = await patchProfile(admin.agent, { name: 'Test Admin Renamed', phone: '+880 1512-345679' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.user.name, 'Test Admin Renamed');
    assert.equal(res.body.data.user.phone, '01512345679');
    assert.equal(res.body.data.user.universityRegNumber, 'ADMIN-0001');

    const dup = await patchProfile(admin.agent, { phone: '01812345678' }); // the second admin's number
    assert.equal(dup.status, 409);
    assert.ok(dup.body.errors.phone);
    assert.ok((await patchProfile(admin.agent, { phone: '123' })).body.errors.phone);

    for (const body of [{ universityRegNumber: 'ADMIN-9999' }, { idCardImageUrl: 'x.png' }]) {
      const locked = await patchProfile(admin.agent, body);
      assert.equal(locked.status, 400);
      assert.equal(locked.body.code, 'FIELD_LOCKED');
    }
    assert.equal((await patchProfile(admin.agent, { department: 'CSE' })).status, 400, 'students-only fields do nothing for admins');

    await patchProfile(admin.agent, { name: 'Test Admin', phone: '01712345678' }); // restore for the other tests
  });
});

describe('changing the password', () => {
  let me;

  before(async () => {
    me = await makeStudent('passa', 64);
    await approve(me.id);
  });

  it('needs the current password, a strong new one, and a matching confirmation', async () => {
    const change = (body) => me.agent.post('/api/profile/password').send(body);
    const wrong = await change({ currentPassword: 'WrongPass1', newPassword: 'Brand9NewPass', confirmPassword: 'Brand9NewPass' });
    assert.equal(wrong.status, 400);
    assert.ok(wrong.body.errors.currentPassword);

    assert.ok((await change({ currentPassword: 'Passw0rdOK', newPassword: 'weak', confirmPassword: 'weak' })).body.errors.newPassword);
    assert.ok((await change({ currentPassword: 'Passw0rdOK', newPassword: 'Brand9NewPass', confirmPassword: 'Different1' })).body.errors.confirmPassword);
    assert.ok((await change({ currentPassword: 'Passw0rdOK', newPassword: 'Passw0rdOK', confirmPassword: 'Passw0rdOK' })).body.errors.newPassword);
    assert.equal((await request(app).post('/api/profile/password').send({})).status, 401);
    // nothing changed
    assert.equal((await request(app).post('/api/auth/login').send({ email: 'passa@example.com', password: 'Passw0rdOK' })).status, 200);
  });

  it('changes it, logs out other devices, and keeps this session', async () => {
    const other = staleToken(me.id, 'student'); // a login from before the change
    assert.equal((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${other}`)).status, 200);

    const res = await me.agent.post('/api/profile/password').send({
      currentPassword: 'Passw0rdOK', newPassword: 'Brand9NewPass', confirmPassword: 'Brand9NewPass',
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(hasCookie(res), 'a fresh login cookie is issued');

    assert.equal((await me.agent.get('/api/auth/me')).status, 200, 'this session continues');
    const old = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${other}`);
    assert.equal(old.status, 401);
    assert.match(old.body.message, /password was changed/);

    assert.equal((await request(app).post('/api/auth/login').send({ email: 'passa@example.com', password: 'Passw0rdOK' })).status, 401);
    assert.equal((await request(app).post('/api/auth/login').send({ email: 'passa@example.com', password: 'Brand9NewPass' })).status, 200);
    const stored = await User.findById(me.id).select('+passwordHash');
    assert.match(stored.passwordHash, /^\$2[aby]\$/);
  });

  it('works for admins too', async () => {
    const created = await createAdminRequest(admin.agent, {
      name: 'Password Admin', email: 'pw.admin@example.com', phone: '01911110000', universityRegNumber: 'ADMIN-0300',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'pw.admin@example.com', password: 'Passw0rdOK' });
    const res = await agent.post('/api/profile/password').send({
      currentPassword: 'Passw0rdOK', newPassword: 'Admin9Fresh', confirmPassword: 'Admin9Fresh',
    });
    assert.equal(res.status, 200);
    assert.equal((await agent.get('/api/admin/stats')).status, 200);
    assert.equal((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${staleToken(created.body.data.admin.id, 'admin')}`)).status, 401);
    assert.equal((await request(app).post('/api/auth/login').send({ email: 'pw.admin@example.com', password: 'Admin9Fresh' })).status, 200);
  });
});

describe('changing the e-mail address (needs a code sent to the NEW address)', () => {
  let me;
  const requestChange = (body) => me.agent.post('/api/profile/email/request').send(body);
  const confirmChange = (code) => me.agent.post('/api/profile/email/confirm').send({ code });
  const ageChange = () => User.updateOne({ _id: me.id }, { $set: { 'emailChange.sentAt': new Date(Date.now() - 120000) } });

  before(async () => {
    me = await makeStudent('mailchg', 65);
    await approve(me.id);
  });

  it('checks the password, and refuses the same or an already used address', async () => {
    const wrong = await requestChange({ newEmail: 'fresh.mail@example.com', password: 'WrongPass1' });
    assert.equal(wrong.status, 400);
    assert.ok(wrong.body.errors.password);
    assert.ok((await requestChange({ newEmail: 'MAILCHG@example.com', password: 'Passw0rdOK' })).body.errors.newEmail);
    const taken = await requestChange({ newEmail: 'admin@example.com', password: 'Passw0rdOK' }); // an admin's e-mail
    assert.equal(taken.status, 409);
    assert.ok(taken.body.errors.newEmail);
    assert.equal((await requestChange({ newEmail: 'not-an-email', password: 'Passw0rdOK' })).status, 400);
    assert.equal((await request(app).post('/api/profile/email/request').send({})).status, 401);
  });

  it('sends the code to the NEW address; the old address keeps working until it is confirmed', async () => {
    outbox.length = 0;
    const res = await requestChange({ newEmail: 'fresh.mail@example.com', password: 'Passw0rdOK' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.pendingEmail, 'fresh.mail@example.com');
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0].to, 'fresh.mail@example.com');
    assert.match(outbox[0].subject, /new WeReUse email/);

    const profile = (await me.agent.get('/api/auth/me')).body.data.user;
    assert.equal(profile.email, 'mailchg@example.com', 'not changed yet');
    assert.equal(profile.pendingEmail, 'fresh.mail@example.com');
    assert.equal((await request(app).post('/api/auth/login').send({ email: 'mailchg@example.com', password: 'Passw0rdOK' })).status, 200);
    assert.equal((await request(app).post('/api/auth/login').send({ email: 'fresh.mail@example.com', password: 'Passw0rdOK' })).status, 401);

    const again = await requestChange({ newEmail: 'fresh.mail@example.com', password: 'Passw0rdOK' });
    assert.equal(again.status, 429, 'one e-mail per minute');
  });

  it('counts wrong codes and locks after 5; a resent code works again', async () => {
    const bad = lastCodeFor('fresh.mail@example.com') === '000000' ? '111111' : '000000';
    assert.equal((await confirmChange('abc')).status, 400);
    const first = await confirmChange(bad);
    assert.equal(first.status, 400);
    assert.match(first.body.errors.code, /4 attempts left/);
    for (let i = 0; i < 4; i += 1) await confirmChange(bad);
    const locked = await confirmChange(lastCodeFor('fresh.mail@example.com')); // right code, too late
    assert.equal(locked.status, 429);

    assert.equal((await me.agent.post('/api/profile/email/resend')).status, 429, 'cooldown applies to resending');
    await ageChange();
    const resent = await me.agent.post('/api/profile/email/resend');
    assert.equal(resent.status, 200, JSON.stringify(resent.body));
    assert.equal((await User.findById(me.id)).emailChange.attempts, 0);
  });

  it('refuses an expired code', async () => {
    await User.updateOne({ _id: me.id }, { $set: { 'emailChange.expiresAt': new Date(Date.now() - 1000) } });
    const res = await confirmChange(lastCodeFor('fresh.mail@example.com'));
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'CODE_EXPIRED');
    await ageChange();
    assert.equal((await me.agent.post('/api/profile/email/resend')).status, 200);
  });

  it('switches the login e-mail once the right code is entered', async () => {
    const res = await confirmChange(lastCodeFor('fresh.mail@example.com'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const u = res.body.data.user;
    assert.equal(u.email, 'fresh.mail@example.com');
    assert.equal(u.pendingEmail, null);
    assert.ok(u.emailVerifiedAt);

    assert.equal((await request(app).post('/api/auth/login').send({ email: 'mailchg@example.com', password: 'Passw0rdOK' })).status, 401);
    assert.equal((await request(app).post('/api/auth/login').send({ email: 'fresh.mail@example.com', password: 'Passw0rdOK' })).status, 200);
    assert.equal((await me.agent.get('/api/auth/me')).status, 200, 'the open session carries on');
    assert.equal((await confirmChange('123456')).body.code, 'NO_PENDING_CHANGE', 'a code cannot be used twice');
  });

  it('refuses the change if somebody took that address while the code was in the mail', async () => {
    await ageChange();
    assert.equal((await requestChange({ newEmail: 'race.mail@example.com', password: 'Passw0rdOK' })).status, 200);
    const code = lastCodeFor('race.mail@example.com');
    const taker = await signUp(request(app), { email: 'race.mail@example.com', universityRegNumber: '241-35-166' });
    assert.equal(taker.status, 201);

    const res = await confirmChange(code);
    assert.equal(res.status, 409);
    assert.ok(res.body.errors.newEmail);
    assert.equal((await User.findById(me.id)).email, 'fresh.mail@example.com');
    assert.equal((await User.findById(me.id)).emailChange.newEmail, null, 'the pending change was cleared');
  });

  it('can be cancelled, and a failed delivery leaves nothing pending', async () => {
    await ageChange();
    assert.equal((await requestChange({ newEmail: 'cancel.me@example.com', password: 'Passw0rdOK' })).status, 200);
    const cancel = await me.agent.delete('/api/profile/email');
    assert.equal(cancel.status, 200);
    assert.equal(cancel.body.data.user.pendingEmail, null);

    const bounce = await requestChange({ newEmail: 'bounce@example.com', password: 'Passw0rdOK' });
    assert.equal(bounce.status, 502);
    assert.equal((await User.findById(me.id)).emailChange.newEmail, null);
  });

  it('works for admins too', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'pw.admin@example.com', password: 'Admin9Fresh' });
    const res = await agent.post('/api/profile/email/request').send({ newEmail: 'pw.admin.new@example.com', password: 'Admin9Fresh' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const done = await agent.post('/api/profile/email/confirm').send({ code: lastCodeFor('pw.admin.new@example.com') });
    assert.equal(done.status, 200);
    assert.equal(done.body.data.user.email, 'pw.admin.new@example.com');
    assert.equal(done.body.data.user.role, 'admin');
    assert.equal(await Admin.countDocuments({ email: 'pw.admin.new@example.com' }), 1);
  });
});
