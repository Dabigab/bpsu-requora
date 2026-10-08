/* End-to-end API tests: real HTTP requests through the Express app.
   Needs the dev dependencies:  npm install  then  npm test           */

process.env.DB_PATH = require('path').join(__dirname, 'tmp-api-db.json');
process.env.JWT_SECRET = 'test-secret-for-the-api-suite';
process.env.NODE_ENV = 'test';

const { test, beforeEach, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const request = require('supertest');

const { resetDB, createUser, getItemById } = require('../utils/db');
const createApp = require('../app');
const { UPLOAD_DIR } = require('../utils/imageFiles');
const { weekdayFromNow, todayStr, validReport, uuid } = require('./helpers');

const app = createApp({ serveFrontend: false });

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

beforeEach(() => resetDB());
after(() => {
  if (fs.existsSync(process.env.DB_PATH)) fs.unlinkSync(process.env.DB_PATH);
});

/* ---------- helpers ---------- */
async function register(email = 'student@bpsu.edu.ph', name = 'Test Student') {
  const res = await request(app).post('/api/auth/register').send({ name, email, password: 'password123' });
  return { token: res.body.data.token, user: res.body.data.user, res };
}

async function loginAdmin() {
  createUser({
    name: 'Office Admin',
    email: 'admin@test.bpsu.edu.ph',
    studentId: null,
    passwordHash: await bcrypt.hash('AdminPass123', 10),
    role: 'admin',
  });
  const res = await request(app).post('/api/auth/login').send({ email: 'admin@test.bpsu.edu.ph', password: 'AdminPass123' });
  return res.body.data.token;
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

function postReport(token, fields = {}) {
  const r = validReport(fields);
  const req = request(app).post('/api/items').set(auth(token));
  Object.entries(r).forEach(([k, val]) => req.field(k, val));
  return req;
}

/* ---------- response shape ---------- */
describe('response envelope', () => {
  test('success responses are { success, data, message? }', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, 'ok');
  });

  test('errors are { success:false, error, message }', async () => {
    const res = await request(app).get('/api/items/not-a-uuid');
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error, 'NOT_FOUND');
    assert.equal(typeof res.body.message, 'string');
  });

  test('unknown API paths return JSON 404', async () => {
    const res = await request(app).get('/api/does-not-exist');
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'NOT_FOUND');
  });

  test('malformed JSON returns 400, not a crash', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email": ');
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'MALFORMED_REQUEST');
  });

  test('/api/meta exposes the shared status and category lists', async () => {
    const res = await request(app).get('/api/meta');
    assert.ok(res.body.data.itemStatuses.includes('pending_verification'));
    assert.ok(res.body.data.claimStatuses.includes('approved'));
    assert.ok(res.body.data.categories.includes('Electronics'));
  });

  test('/api/stats is public and contains only counts', async () => {
    const res = await request(app).get('/api/stats');
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body.data.stats).sort(), ['active', 'found', 'lost', 'returned', 'total']);
  });
});

/* ---------- authentication ---------- */
describe('auth', () => {
  test('registers a new user and returns a token (no password data)', async () => {
    const { res } = await register();
    assert.equal(res.status, 201);
    assert.ok(res.body.data.token);
    assert.equal(res.body.data.user.role, 'student');
    assert.equal(res.body.data.user.passwordHash, undefined);
  });

  test('rejects duplicate emails (case-insensitive)', async () => {
    await register('dup@bpsu.edu.ph');
    const again = await request(app).post('/api/auth/register').send({ name: 'Second', email: 'DUP@bpsu.edu.ph', password: 'password123' });
    assert.equal(again.status, 409);
  });

  test('validates name, email and password', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'A', email: 'nope', password: 'short' });
    assert.equal(res.status, 400);
    assert.ok(res.body.fields.name);
    assert.ok(res.body.fields.email);
    assert.ok(res.body.fields.password);

    const noDigit = await request(app).post('/api/auth/register').send({ name: 'Valid Name', email: 'v@bpsu.edu.ph', password: 'onlyletters' });
    assert.equal(noDigit.status, 400);
  });

  test('cannot self-register as admin', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Sneaky Person', email: 'sneaky@bpsu.edu.ph', password: 'password123', role: 'admin' });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.user.role, 'student');
  });

  test('passwords are stored hashed', async () => {
    await register('hash@bpsu.edu.ph');
    const stored = JSON.parse(fs.readFileSync(process.env.DB_PATH, 'utf-8')).users[0];
    assert.notEqual(stored.passwordHash, 'password123');
    assert.match(stored.passwordHash, /^\$2[aby]\$/);
  });

  test('login works, and wrong passwords / unknown emails give the same 401', async () => {
    await register('login@bpsu.edu.ph');
    const good = await request(app).post('/api/auth/login').send({ email: 'LOGIN@bpsu.edu.ph', password: 'password123' });
    assert.equal(good.status, 200);
    assert.ok(good.body.data.token);

    const wrong = await request(app).post('/api/auth/login').send({ email: 'login@bpsu.edu.ph', password: 'wrongpass1' });
    const unknown = await request(app).post('/api/auth/login').send({ email: 'ghost@bpsu.edu.ph', password: 'password123' });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.body.message, unknown.body.message);
  });

  test('protected routes need a valid token (401, not 403)', async () => {
    assert.equal((await request(app).get('/api/auth/me')).status, 401);
    assert.equal((await request(app).get('/api/auth/me').set(auth('garbage.token.here'))).status, 401);
    const bad = await request(app).get('/api/auth/me').set(auth('garbage.token.here'));
    assert.equal(bad.body.error, 'INVALID_TOKEN');
  });

  test('/me returns the current user; profile and password can be changed', async () => {
    const { token } = await register('me@bpsu.edu.ph');
    const me = await request(app).get('/api/auth/me').set(auth(token));
    assert.equal(me.body.data.user.email, 'me@bpsu.edu.ph');

    const upd = await request(app).put('/api/auth/me').set(auth(token)).send({ name: 'New Name', studentId: '22-0001' });
    assert.equal(upd.body.data.user.name, 'New Name');

    const badPw = await request(app).put('/api/auth/password').set(auth(token)).send({ currentPassword: 'nope12345', newPassword: 'brandnew123' });
    assert.equal(badPw.status, 400);
    const goodPw = await request(app).put('/api/auth/password').set(auth(token)).send({ currentPassword: 'password123', newPassword: 'brandnew123' });
    assert.equal(goodPw.status, 200);
    const relog = await request(app).post('/api/auth/login').send({ email: 'me@bpsu.edu.ph', password: 'brandnew123' });
    assert.equal(relog.status, 200);
  });

  test('a token for a deleted account stops working immediately', async () => {
    const { token, user } = await register('gone@bpsu.edu.ph');
    const data = JSON.parse(fs.readFileSync(process.env.DB_PATH, 'utf-8'));
    data.users = data.users.filter((u) => u.id !== user.id);
    fs.writeFileSync(process.env.DB_PATH, JSON.stringify(data));
    assert.equal((await request(app).get('/api/auth/me').set(auth(token))).status, 401);
  });
});

/* ---------- items ---------- */
describe('items', () => {
  test('creating a report needs login', async () => {
    const res = await request(app).post('/api/items').field('type', 'lost');
    assert.equal(res.status, 401);
  });

  test('a logged-in user can file a report; it starts pending_verification', async () => {
    const { token } = await register();
    const res = await postReport(token);
    assert.equal(res.status, 201);
    assert.equal(res.body.data.item.status, 'pending_verification');
    assert.equal(res.body.data.item.isOwner, true);
  });

  test('missing or invalid fields return per-field errors', async () => {
    const { token } = await register();
    const res = await request(app).post('/api/items').set(auth(token)).field('type', 'lost').field('title', 'Hi');
    assert.equal(res.status, 400);
    assert.ok(res.body.fields.title);
    assert.ok(res.body.fields.description);
  });

  test('a photo is stored, served, and removed again when the item is deleted', async () => {
    const { token } = await register();
    const res = await postReport(token).attach('image', PNG, { filename: 'photo.png', contentType: 'image/png' });
    assert.equal(res.status, 201);
    const url = res.body.data.item.imageUrl;
    assert.match(url, /^\/uploads\/[\w-]+\.png$/);

    const file = path.join(UPLOAD_DIR, path.basename(url));
    assert.ok(fs.existsSync(file));
    assert.equal((await request(app).get(url)).status, 200);

    const del = await request(app).delete(`/api/items/${res.body.data.item.id}`).set(auth(token));
    assert.equal(del.status, 200);
    assert.ok(!fs.existsSync(file), 'photo file deleted with the report');
  });

  test('a fake photo (text renamed to .png) is rejected and nothing is left on disk', async () => {
    const { token } = await register();
    const before = fs.readdirSync(UPLOAD_DIR);
    const res = await postReport(token).attach('image', Buffer.from('<script>alert(1)</script>'), { filename: 'evil.png', contentType: 'image/png' });
    assert.equal(res.status, 400);
    assert.deepEqual(fs.readdirSync(UPLOAD_DIR), before);
  });

  test('non-image extensions are rejected', async () => {
    const { token } = await register();
    const res = await postReport(token).attach('image', Buffer.from('MZ'), { filename: 'virus.exe', contentType: 'application/octet-stream' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'UPLOAD_ERROR');
  });

  test('a rejected report does not leave its uploaded photo behind', async () => {
    const { token } = await register();
    const before = fs.readdirSync(UPLOAD_DIR);
    const res = await request(app)
      .post('/api/items')
      .set(auth(token))
      .field('type', 'lost')
      .field('title', 'x')
      .attach('image', PNG, { filename: 'photo.png', contentType: 'image/png' });
    assert.equal(res.status, 400);
    assert.deepEqual(fs.readdirSync(UPLOAD_DIR), before);
  });

  test('oversized photos are rejected with a friendly message', async () => {
    const { token } = await register();
    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024 + 10)]);
    const res = await postReport(token).attach('image', big, { filename: 'big.png', contentType: 'image/png' });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /too large/i);
  });

  test('the public feed lists items, filters, searches and paginates', async () => {
    const { token } = await register();
    await postReport(token, { title: 'Lost phone', type: 'lost', category: 'Electronics' });
    await postReport(token, { title: 'Found umbrella', type: 'found', category: 'Other' });

    const all = await request(app).get('/api/items');
    assert.equal(all.body.data.items.length, 2);
    assert.equal(all.body.data.pagination.total, 2);

    assert.equal((await request(app).get('/api/items?type=lost')).body.data.items.length, 1);
    assert.equal((await request(app).get('/api/items?q=umbrella')).body.data.items[0].title, 'Found umbrella');
    assert.equal((await request(app).get('/api/items?limit=1&page=2')).body.data.items.length, 1);
    assert.equal((await request(app).get('/api/items?type=bogus')).status, 400);
    assert.equal((await request(app).get('/api/items?category=a&category=b')).status, 200);
  });

  test('guests do not receive contact details; the owner does', async () => {
    const { token } = await register();
    const created = await postReport(token, { contactInfo: '0917-123-4567' });
    const id = created.body.data.item.id;
    const guest = await request(app).get(`/api/items/${id}`);
    assert.equal(guest.body.data.item.contactInfo, undefined);
    const owner = await request(app).get(`/api/items/${id}`).set(auth(token));
    assert.equal(owner.body.data.item.contactInfo, '0917-123-4567');
  });

  test('only the owner or an admin can edit; owners cannot set arbitrary statuses', async () => {
    const owner = await register('owner@bpsu.edu.ph', 'Owner Person');
    const stranger = await register('stranger@bpsu.edu.ph', 'Stranger Person');
    const adminToken = await loginAdmin();
    const id = (await postReport(owner.token)).body.data.item.id;

    assert.equal((await request(app).put(`/api/items/${id}`).set(auth(stranger.token)).send({ title: 'Hijacked' })).status, 403);
    assert.equal((await request(app).put(`/api/items/${id}`).set(auth(owner.token)).send({ status: 'returned' })).status, 403);
    assert.equal((await request(app).put(`/api/items/${id}`).set(auth(owner.token)).send({ title: 'Updated title' })).status, 200);
    assert.equal((await request(app).put(`/api/items/${id}`).set(auth(adminToken)).send({ status: 'claimed' })).status, 200);
    assert.equal(getItemById(id).status, 'claimed');
  });

  test('"my reports" lists only my own', async () => {
    const a = await register('a@bpsu.edu.ph', 'Person A');
    const b = await register('b@bpsu.edu.ph', 'Person B');
    await postReport(a.token, { title: 'Item of A' });
    await postReport(b.token, { title: 'Item of B' });
    const mine = await request(app).get('/api/items/mine').set(auth(a.token));
    assert.equal(mine.body.data.items.length, 1);
    assert.equal(mine.body.data.items[0].title, 'Item of A');
  });
});

/* ---------- claims ---------- */
describe('claims', () => {
  async function setup() {
    const reporter = await register('reporter@bpsu.edu.ph', 'Reporter Person');
    const claimant = await register('claimant@bpsu.edu.ph', 'Claimant Person');
    const adminToken = await loginAdmin();
    const item = (await postReport(reporter.token, { type: 'found', title: 'Found black wallet' })).body.data.item;
    return { reporter, claimant, adminToken, item };
  }
  const body = (itemId) => ({
    itemId,
    appointmentDate: weekdayFromNow(2),
    appointmentTime: '10:00',
    proofDescription: 'Has my initials stitched inside and a BPSU ID in the sleeve.',
  });

  test('filing a claim needs login; the claimant sees its status', async () => {
    const { claimant, item } = await setup();
    assert.equal((await request(app).post('/api/claims').send(body(item.id))).status, 401);

    const res = await request(app).post('/api/claims').set(auth(claimant.token)).send(body(item.id));
    assert.equal(res.status, 201);
    assert.equal(res.body.data.claim.status, 'pending');

    const mine = await request(app).get('/api/claims/mine').set(auth(claimant.token));
    assert.equal(mine.body.data.claims.length, 1);
    assert.equal(mine.body.data.claims[0].itemTitle, 'Found black wallet');
  });

  test('duplicates, own reports and invalid appointments are refused', async () => {
    const { reporter, claimant, item } = await setup();
    assert.equal((await request(app).post('/api/claims').set(auth(reporter.token)).send(body(item.id))).status, 409);
    assert.equal((await request(app).post('/api/claims').set(auth(claimant.token)).send({ ...body(item.id), appointmentDate: '2020-01-06' })).status, 400);
    assert.equal((await request(app).post('/api/claims').set(auth(claimant.token)).send({ ...body(item.id), proofDescription: 'mine' })).status, 400);
    assert.equal((await request(app).post('/api/claims').set(auth(claimant.token)).send(body(uuid()))).status, 404);

    assert.equal((await request(app).post('/api/claims').set(auth(claimant.token)).send(body(item.id))).status, 201);
    assert.equal((await request(app).post('/api/claims').set(auth(claimant.token)).send(body(item.id))).status, 409);
  });

  test('users cannot approve claims; only admins can', async () => {
    const { claimant, reporter, adminToken, item } = await setup();
    const claim = (await request(app).post('/api/claims').set(auth(claimant.token)).send(body(item.id))).body.data.claim;

    assert.equal((await request(app).put(`/api/claims/${claim.id}`).set(auth(claimant.token)).send({ status: 'approved' })).status, 403);
    assert.equal((await request(app).put(`/api/claims/${claim.id}`).set(auth(reporter.token)).send({ status: 'approved' })).status, 403);
    assert.equal((await request(app).get('/api/claims').set(auth(claimant.token))).status, 403);

    const approved = await request(app).put(`/api/claims/${claim.id}`).set(auth(adminToken)).send({ status: 'approved' });
    assert.equal(approved.status, 200);
    assert.equal(getItemById(item.id).status, 'claimed');

    const done = await request(app).put(`/api/claims/${claim.id}`).set(auth(adminToken)).send({ status: 'completed' });
    assert.equal(done.status, 200);
    assert.equal(getItemById(item.id).status, 'returned');
  });

  test('the reporter sees claims on their item without proof or contact details', async () => {
    const { claimant, reporter, item } = await setup();
    await request(app).post('/api/claims').set(auth(claimant.token)).send(body(item.id));
    const res = await request(app).get(`/api/claims/item/${item.id}`).set(auth(reporter.token));
    assert.equal(res.status, 200);
    assert.equal(res.body.data.claims[0].proofDescription, undefined);
    assert.equal((await request(app).get(`/api/claims/item/${item.id}`).set(auth(claimant.token))).status, 403);
  });

  test('a claimant can cancel their own pending claim, nobody else can', async () => {
    const { claimant, reporter, item } = await setup();
    const claim = (await request(app).post('/api/claims').set(auth(claimant.token)).send(body(item.id))).body.data.claim;
    assert.equal((await request(app).put(`/api/claims/${claim.id}/cancel`).set(auth(reporter.token))).status, 403);
    const res = await request(app).put(`/api/claims/${claim.id}/cancel`).set(auth(claimant.token));
    assert.equal(res.status, 200);
    assert.equal(res.body.data.claim.status, 'cancelled');
  });
});

/* ---------- admin ---------- */
describe('admin', () => {
  test('regular users and guests cannot reach admin endpoints', async () => {
    const { token } = await register();
    assert.equal((await request(app).get('/api/admin/items').set(auth(token))).status, 403);
    assert.equal((await request(app).get('/api/admin/stats').set(auth(token))).status, 403);
    assert.equal((await request(app).get('/api/admin/users').set(auth(token))).status, 403);
    assert.equal((await request(app).get('/api/admin/stats')).status, 401);
  });

  test('an admin gets statistics, items and users', async () => {
    const adminToken = await loginAdmin();
    const { token } = await register();
    await postReport(token);

    const stats = await request(app).get('/api/admin/stats').set(auth(adminToken));
    assert.equal(stats.status, 200);
    assert.equal(stats.body.data.stats.totalReports, 1);
    assert.equal(stats.body.data.recentReports.length, 1);

    const items = await request(app).get('/api/admin/items').set(auth(adminToken));
    assert.equal(items.body.data.items[0].reporterEmail, 'student@bpsu.edu.ph');

    const users = await request(app).get('/api/admin/users').set(auth(adminToken));
    assert.ok(users.body.data.users.every((u) => u.passwordHash === undefined));
  });

  test('verify, change status and delete', async () => {
    const adminToken = await loginAdmin();
    const { token } = await register();
    const id = (await postReport(token, { type: 'found' })).body.data.item.id;

    const verified = await request(app).post(`/api/admin/items/${id}/verify`).set(auth(adminToken));
    assert.equal(verified.body.data.item.status, 'found');
    assert.equal((await request(app).post(`/api/admin/items/${id}/verify`).set(auth(adminToken))).status, 409);

    assert.equal((await request(app).put(`/api/admin/items/${id}/status`).set(auth(adminToken)).send({ status: 'lost' })).status, 400);
    assert.equal((await request(app).put(`/api/admin/items/${id}/status`).set(auth(adminToken)).send({ status: 'closed' })).status, 200);

    assert.equal((await request(app).delete(`/api/admin/items/${id}`).set(auth(adminToken))).status, 200);
    assert.equal((await request(app).get(`/api/items/${id}`)).status, 404);
    assert.equal((await request(app).delete(`/api/admin/items/${id}`).set(auth(adminToken))).status, 404);
  });
});

test('todayStr helper is consistent with the server (sanity)', () => {
  assert.match(todayStr(), /^\d{4}-\d{2}-\d{2}$/);
});
