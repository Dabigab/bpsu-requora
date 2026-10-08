/* Tests for the small building blocks: validation, uploads, rate limiting,
   error responses and what each kind of viewer is allowed to see. */

process.env.DB_PATH = require('path').join(__dirname, 'tmp-utils-db.json');
process.env.NODE_ENV = 'test';

const { test, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const v = require('../utils/validate');
const { detectImageType, removeUpload } = require('../utils/imageFiles');
const { createRateLimiter } = require('../utils/rateLimit');
const { ApiError, Errors, errorHandler, notFoundHandler } = require('../utils/http');
const { serializeItem, shortName, referenceCode } = require('../utils/serialize');
const C = require('../utils/constants');

after(() => {
  if (fs.existsSync(process.env.DB_PATH)) fs.unlinkSync(process.env.DB_PATH);
});

function fakeRes() {
  return {
    headersSent: false,
    headers: {},
    statusCode: 200,
    body: undefined,
    setHeader(k, val) {
      this.headers[k] = val;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
}

describe('validation helpers', () => {
  test('isEmail', () => {
    assert.ok(v.isEmail('a@b.co'));
    assert.ok(!v.isEmail('a@b'));
    assert.ok(!v.isEmail('a b@c.com'));
    assert.ok(!v.isEmail({}));
  });

  test('isIsoDate accepts only real calendar dates', () => {
    assert.ok(v.isIsoDate('2026-02-28'));
    assert.ok(!v.isIsoDate('2026-02-30'));
    assert.ok(!v.isIsoDate('26-02-28'));
    assert.ok(!v.isIsoDate(20260228));
  });

  test('isClockTime', () => {
    assert.ok(v.isClockTime('00:00'));
    assert.ok(v.isClockTime('23:59'));
    assert.ok(!v.isClockTime('24:00'));
    assert.ok(!v.isClockTime('9:30'));
  });

  test('isUuid', () => {
    assert.ok(v.isUuid('3f9a12bc-4d5e-4f60-8a7b-1c2d3e4f5a6b'));
    assert.ok(!v.isUuid('../../etc/passwd'));
    assert.ok(!v.isUuid(''));
  });

  test('clean removes control characters but keeps normal text and newlines', () => {
    assert.equal(v.clean('  hello\u0000 world\u0007  '), 'hello world');
    assert.equal(v.clean('line1\nline2'), 'line1\nline2');
    assert.equal(v.clean(123), '');
  });

  test('queryString and queryInt tolerate arrays, objects and junk', () => {
    assert.equal(v.queryString(['a', 'b']), 'a');
    assert.equal(v.queryString({ x: 1 }), '');
    assert.equal(v.queryString(undefined), '');
    assert.equal(v.queryInt('abc', 7), 7);
    assert.equal(v.queryInt('500', 7, { min: 1, max: 50 }), 50);
    assert.equal(v.queryInt('-4', 7, { min: 1, max: 50 }), 1);
  });

  test('textField records an error and returns the cleaned value', () => {
    const fields = {};
    assert.equal(v.textField(fields, 'name', '  Ana  ', { min: 2, max: 10, required: true }), 'Ana');
    assert.deepEqual(fields, {});
    v.textField(fields, 'name', '', { required: true, label: 'Name' });
    assert.equal(fields.name, 'Name is required.');
  });
});

describe('photo checks', () => {
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0]);
  const GIF = Buffer.from('GIF89a\u0001\u0000\u0001\u0000\u0000\u0000\u0000;', 'latin1');
  const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x1a, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);

  test('real image signatures are recognised', () => {
    assert.equal(detectImageType(PNG), 'png');
    assert.equal(detectImageType(JPG), 'jpg');
    assert.equal(detectImageType(GIF), 'gif');
    assert.equal(detectImageType(WEBP), 'webp');
  });

  test('scripts, executables and text pretending to be photos are rejected', () => {
    assert.equal(detectImageType(Buffer.from('<html><script>alert(1)</script></html>')), null);
    assert.equal(detectImageType(Buffer.from('MZ\u0090\u0000\u0003\u0000\u0000\u0000\u0004\u0000\u0000\u0000', 'latin1')), null);
    assert.equal(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
    assert.equal(detectImageType(Buffer.alloc(0)), null);
    assert.equal(detectImageType(null), null);
  });

  test('removeUpload deletes only plain files inside the uploads folder', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'requora-up-'));
    const outside = path.join(dir, '..', `outside-${Date.now()}.txt`);
    fs.writeFileSync(outside, 'keep me');
    fs.writeFileSync(path.join(dir, 'photo.png'), PNG);
    fs.writeFileSync(path.join(dir, '.gitkeep'), '');

    assert.equal(removeUpload('/uploads/../' + path.basename(outside), dir), false);
    assert.ok(fs.existsSync(outside), 'file outside uploads is untouched');
    assert.equal(removeUpload('/uploads/.gitkeep', dir), false);
    assert.equal(removeUpload('https://evil.example/uploads/photo.png', dir), false);
    assert.equal(removeUpload(null, dir), false);
    assert.equal(removeUpload('/uploads/photo.png', dir), true);
    assert.ok(!fs.existsSync(path.join(dir, 'photo.png')));
    assert.equal(removeUpload('/uploads/photo.png', dir), false, 'already gone is not an error');

    fs.unlinkSync(outside);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('rate limiter', () => {
  test('blocks after the limit and sets Retry-After', () => {
    process.env.ENABLE_RATE_LIMIT_IN_TESTS = 'true';
    const limiter = createRateLimiter({ windowMs: 60000, max: 3 });
    const req = { ip: '1.2.3.4' };
    const results = [];
    for (let i = 0; i < 5; i += 1) {
      const res = fakeRes();
      limiter(req, res, (err) => results.push({ err, res }));
    }
    assert.equal(results.slice(0, 3).every((r) => !r.err), true);
    assert.equal(results[3].err.status, 429);
    assert.equal(results[3].err.code, 'RATE_LIMITED');
    assert.ok(results[3].res.headers['Retry-After']);

    // a different address has its own allowance
    let other;
    limiter({ ip: '9.9.9.9' }, fakeRes(), (err) => {
      other = err;
    });
    assert.equal(other, undefined);
    delete process.env.ENABLE_RATE_LIMIT_IN_TESTS;
  });

  test('is switched off in the test environment unless explicitly enabled', () => {
    const limiter = createRateLimiter({ windowMs: 60000, max: 1 });
    let blocked = false;
    for (let i = 0; i < 5; i += 1) limiter({ ip: '5.5.5.5' }, fakeRes(), (err) => { if (err) blocked = true; });
    assert.equal(blocked, false);
  });
});

describe('error responses', () => {
  const run = (err) => {
    const res = fakeRes();
    errorHandler(err, {}, res, () => {});
    return res;
  };

  test('ApiError becomes the standard error envelope', () => {
    const res = run(Errors.validation('Bad input', { title: 'Too short' }));
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { success: false, error: 'VALIDATION_ERROR', message: 'Bad input', fields: { title: 'Too short' } });
  });

  test('conflict errors can carry extra data', () => {
    const res = run(Errors.conflict('Already claimed', { claim: { id: 1 } }));
    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body.claim, { id: 1 });
  });

  test('unexpected errors return a generic 500 and never leak details', () => {
    const original = console.error;
    console.error = () => {};
    const res = run(new Error('secret database path /etc/passwd'));
    console.error = original;
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error, 'SERVER_ERROR');
    assert.ok(!JSON.stringify(res.body).includes('passwd'));
  });

  test('upload and JSON problems map to 400/413', () => {
    assert.equal(run({ name: 'MulterError', code: 'LIMIT_FILE_SIZE' }).statusCode, 400);
    assert.match(run({ name: 'MulterError', code: 'LIMIT_FILE_SIZE' }).body.message, /too large/);
    assert.equal(run({ code: 'INVALID_FILE_TYPE', message: 'Only photos' }).statusCode, 400);
    assert.equal(run({ type: 'entity.parse.failed' }).statusCode, 400);
    assert.equal(run({ type: 'entity.too.large' }).statusCode, 413);
  });

  test('unknown /api paths get a JSON 404; other paths fall through', () => {
    const res = fakeRes();
    notFoundHandler({ path: '/api/nope' }, res, () => assert.fail('should not fall through'));
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error, 'NOT_FOUND');

    let passed = false;
    notFoundHandler({ path: '/index.html' }, fakeRes(), () => { passed = true; });
    assert.ok(passed);
  });
});

describe('what each viewer may see', () => {
  const stored = {
    id: '3f9a12bc-4d5e-4f60-8a7b-1c2d3e4f5a6b',
    type: 'found',
    title: 'Wallet',
    description: 'desc',
    category: 'Accessories',
    location: 'Gym',
    date: '2026-09-01',
    status: 'found',
    contactInfo: '0917-111-2222',
    reportedBy: 'owner-id',
    reportedByName: 'Maria Santos',
    createdAt: '2026-09-01T00:00:00.000Z',
  };

  test('guest', () => {
    const out = serializeItem(stored, undefined);
    assert.equal(out.contactInfo, undefined);
    assert.equal(out.reportedBy, undefined);
    assert.equal(out.reportedByName, 'Maria S.');
    assert.equal(out.isOwner, false);
  });

  test('owner', () => {
    const out = serializeItem(stored, { id: 'owner-id', role: 'student' });
    assert.equal(out.contactInfo, '0917-111-2222');
    assert.equal(out.reportedByName, 'Maria Santos');
    assert.equal(out.isOwner, true);
    assert.equal(out.reportedBy, undefined);
  });

  test('admin sees the reporter id and contact', () => {
    const out = serializeItem(stored, { id: 'a', role: 'admin' });
    assert.equal(out.reportedBy, 'owner-id');
    assert.equal(out.contactInfo, '0917-111-2222');
  });

  test('an approved claimant is granted contact details through opts', () => {
    assert.equal(serializeItem(stored, { id: 'x', role: 'student' }, { canSeeContact: true }).contactInfo, '0917-111-2222');
  });

  test('stored password hashes or internal fields are never copied', () => {
    const out = serializeItem({ ...stored, passwordHash: 'secret', internalNote: 'x' }, { id: 'a', role: 'admin' });
    assert.equal(out.passwordHash, undefined);
    assert.equal(out.internalNote, undefined);
  });

  test('short names and reference codes', () => {
    assert.equal(shortName('Maria Santos'), 'Maria S.');
    assert.equal(shortName('Cher'), 'Cher');
    assert.equal(shortName(''), 'BPSU member');
    assert.equal(referenceCode(stored.id), 'RQ-3F9A12BC');
  });
});

describe('shared constants', () => {
  test('every transition target is a real claim status', () => {
    for (const [from, targets] of Object.entries(C.CLAIM_TRANSITIONS)) {
      assert.ok(C.CLAIM_STATUSES.includes(from));
      targets.forEach((t) => assert.ok(C.CLAIM_STATUSES.includes(t)));
    }
  });

  test('open and hidden statuses are real item statuses', () => {
    [...C.OPEN_STATUSES, ...C.HIDDEN_BY_DEFAULT].forEach((s) => assert.ok(C.ITEM_STATUSES.includes(s)));
  });

  test('every legacy status maps onto a current one', () => {
    Object.values(C.LEGACY_ITEM_STATUS).filter(Boolean).forEach((s) => assert.ok(C.ITEM_STATUSES.includes(s)));
    Object.values(C.LEGACY_CLAIM_STATUS).forEach((s) => assert.ok(C.CLAIM_STATUSES.includes(s)));
  });

  test('verification tiers', () => {
    assert.equal(C.verificationTier('Electronics'), 'high');
    assert.equal(C.verificationTier('Keys'), 'medium');
    assert.equal(C.verificationTier('Clothing'), 'standard');
    assert.equal(C.verificationTier(undefined), 'standard');
  });

  test('ApiError is an Error with status and code', () => {
    const e = new ApiError(418, 'TEAPOT', 'short and stout');
    assert.ok(e instanceof Error);
    assert.equal(e.status, 418);
  });
});
