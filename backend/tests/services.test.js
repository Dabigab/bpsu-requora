/* Business-rule tests for reports, claims and admin actions.
   These call the service layer directly (no web server needed). */

process.env.DB_PATH = require('path').join(__dirname, 'tmp-services-db.json');
process.env.NODE_ENV = 'test';

const { test, beforeEach, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const db = require('../utils/db');
const itemService = require('../services/itemService');
const claimService = require('../services/claimService');
const adminService = require('../services/adminService');
const { weekdayFromNow, saturdayFromNow, todayStr, daysFromToday, validReport, uuid } = require('./helpers');

let maria; // student who files reports
let juan; // another student (claimant)
let admin;

function makeUser(name, email, role = 'student') {
  const u = db.createUser({ name, email, studentId: null, passwordHash: 'x', role });
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}

beforeEach(() => {
  db.resetDB();
  maria = makeUser('Maria Santos', 'maria@bpsu.edu.ph');
  juan = makeUser('Juan Dela Cruz', 'juan@bpsu.edu.ph');
  admin = makeUser('Office Admin', 'admin@bpsu.edu.ph', 'admin');
});

after(() => {
  if (fs.existsSync(process.env.DB_PATH)) fs.unlinkSync(process.env.DB_PATH);
});

const claimBody = (itemId, overrides = {}) => ({
  itemId,
  appointmentDate: weekdayFromNow(2),
  appointmentTime: '10:00',
  proofDescription: 'It has a scratch on the back and my initials inside the flap.',
  contactInfo: '0917-000-0000',
  ...overrides,
});

const throwsApi = (fn, status, code) =>
  assert.throws(fn, (err) => err.status === status && (!code || err.code === code), `expected ApiError ${status} ${code || ''}`);

/* ---------------------------------------------------------- */
describe('creating reports', () => {
  test('a valid report starts as pending_verification', () => {
    const item = itemService.createReport(maria, validReport(), null);
    assert.equal(item.status, 'pending_verification');
    assert.equal(item.type, 'lost');
    assert.match(item.reference, /^RQ-[0-9A-F]{8}$/);
    assert.equal(item.isOwner, true);
  });

  test('missing fields are rejected with per-field messages', () => {
    try {
      itemService.createReport(maria, { type: 'lost', title: 'Hi' }, null);
      assert.fail('should have thrown');
    } catch (err) {
      assert.equal(err.status, 400);
      assert.equal(err.code, 'VALIDATION_ERROR');
      assert.ok(err.fields.title, 'short title flagged');
      assert.ok(err.fields.description);
      assert.ok(err.fields.category);
      assert.ok(err.fields.location);
      assert.ok(err.fields.date);
    }
  });

  test('type must be lost or found', () => {
    throwsApi(() => itemService.createReport(maria, validReport({ type: 'stolen' }), null), 400);
  });

  test('category must come from the official list (case-insensitive match is normalised)', () => {
    throwsApi(() => itemService.createReport(maria, validReport({ category: 'Spaceships' }), null), 400);
    const item = itemService.createReport(maria, validReport({ category: 'electronics' }), null);
    assert.equal(item.category, 'Electronics');
  });

  test('dates in the future and impossible dates are rejected', () => {
    throwsApi(() => itemService.createReport(maria, validReport({ date: daysFromToday(3) }), null), 400);
    throwsApi(() => itemService.createReport(maria, validReport({ date: '2026-02-31' }), null), 400);
    throwsApi(() => itemService.createReport(maria, validReport({ date: 'yesterday' }), null), 400);
  });

  test('time must be HH:MM and is optional', () => {
    throwsApi(() => itemService.createReport(maria, validReport({ time: '25:99' }), null), 400);
    const item = itemService.createReport(maria, validReport({ time: '14:30' }), null);
    assert.equal(item.time, '14:30');
  });

  test('objects and arrays sent as text fields cannot crash or pollute the record', () => {
    throwsApi(() => itemService.createReport(maria, validReport({ title: { $gt: '' } }), null), 400);
    throwsApi(() => itemService.createReport(maria, validReport({ description: ['a', 'b'] }), null), 400);
  });

  test('overlong text is rejected', () => {
    throwsApi(() => itemService.createReport(maria, validReport({ title: 'x'.repeat(101) }), null), 400);
  });

  test('the stored photo URL comes from the server-generated file name', () => {
    const item = itemService.createReport(maria, validReport(), { filename: '123-abc.png' });
    assert.equal(item.imageUrl, '/uploads/123-abc.png');
  });
});

/* ---------------------------------------------------------- */
describe('reading and privacy', () => {
  test('guests do not see contact details or the reporter full name', () => {
    const created = itemService.createReport(maria, validReport({ contactInfo: '0917-111-2222' }), null);
    const { item } = itemService.getItemForViewer(created.id, undefined);
    assert.equal(item.contactInfo, undefined);
    assert.equal(item.reportedByName, 'Maria S.');
    assert.equal(item.reportedBy, undefined);
    assert.equal(item.isOwner, false);
  });

  test('the owner and admins see contact details', () => {
    const created = itemService.createReport(maria, validReport({ contactInfo: '0917-111-2222' }), null);
    assert.equal(itemService.getItemForViewer(created.id, maria).item.contactInfo, '0917-111-2222');
    assert.equal(itemService.getItemForViewer(created.id, admin).item.contactInfo, '0917-111-2222');
    assert.equal(itemService.getItemForViewer(created.id, admin).item.reportedByName, 'Maria Santos');
  });

  test('another logged-in user does not see contact details until a claim is approved', () => {
    const created = itemService.createReport(maria, validReport({ contactInfo: '0917-111-2222', type: 'found' }), null);
    assert.equal(itemService.getItemForViewer(created.id, juan).item.contactInfo, undefined);

    const claim = claimService.createClaim(juan, claimBody(created.id));
    claimService.decideClaim(admin, claim.id, { status: 'approved' });
    assert.equal(itemService.getItemForViewer(created.id, juan).item.contactInfo, '0917-111-2222');
  });

  test('the default feed hides returned and closed reports; status=all shows everything', () => {
    const a = itemService.createReport(maria, validReport({ title: 'Active umbrella' }), null);
    const b = itemService.createReport(maria, validReport({ title: 'Returned umbrella' }), null);
    adminService.setItemStatus(b.id, 'returned');

    const feed = itemService.listItems({}, undefined);
    assert.deepEqual(feed.items.map((i) => i.id), [a.id]);
    assert.equal(itemService.listItems({ status: 'all' }, undefined).items.length, 2);
    assert.equal(itemService.listItems({ status: 'returned' }, undefined).items.length, 1);
  });

  test('search, type, category, location and date filters work together', () => {
    itemService.createReport(maria, validReport({ title: 'Blue umbrella', category: 'Other', location: 'Library', type: 'found' }), null);
    itemService.createReport(maria, validReport({ title: 'Red wallet', category: 'Accessories', location: 'Canteen' }), null);

    assert.equal(itemService.listItems({ q: 'umbrella' }, undefined).items.length, 1);
    assert.equal(itemService.listItems({ type: 'lost' }, undefined).items[0].title, 'Red wallet');
    assert.equal(itemService.listItems({ category: 'Other' }, undefined).items.length, 1);
    assert.equal(itemService.listItems({ location: 'canteen' }, undefined).items.length, 1);
    assert.equal(itemService.listItems({ dateFrom: daysFromToday(1) }, undefined).items.length, 0);
    assert.equal(itemService.listItems({ dateTo: todayStr() }, undefined).items.length, 2);
  });

  test('invalid filters give a 400, and repeated query params cannot crash the feed', () => {
    throwsApi(() => itemService.listItems({ type: 'nonsense' }, undefined), 400);
    throwsApi(() => itemService.listItems({ status: 'nonsense' }, undefined), 400);
    throwsApi(() => itemService.listItems({ dateFrom: 'abc' }, undefined), 400);
    // ?category=a&category=b arrives as an array
    assert.doesNotThrow(() => itemService.listItems({ category: ['Bags', 'Other'], q: ['x', 'y'] }, undefined));
  });

  test('pagination returns the right slice and totals', () => {
    for (let i = 1; i <= 5; i += 1) itemService.createReport(maria, validReport({ title: `Item number ${i}` }), null);
    const page1 = itemService.listItems({ limit: '2', page: '1' }, undefined);
    assert.equal(page1.items.length, 2);
    assert.deepEqual(page1.pagination, { page: 1, limit: 2, total: 5, totalPages: 3 });
    const page3 = itemService.listItems({ limit: '2', page: '3' }, undefined);
    assert.equal(page3.items.length, 1);
    const beyond = itemService.listItems({ limit: '2', page: '99' }, undefined);
    assert.equal(beyond.pagination.page, 3);
  });

  test('unknown or malformed ids give 404, not a crash', () => {
    throwsApi(() => itemService.getItemForViewer('not-a-uuid', undefined), 404);
    throwsApi(() => itemService.getItemForViewer(uuid(), undefined), 404);
  });

  test('my reports include every status plus claim counts', () => {
    const a = itemService.createReport(maria, validReport({ type: 'found' }), null);
    itemService.createReport(juan, validReport({ title: 'Not Marias item' }), null);
    adminService.setItemStatus(a.id, 'closed');
    const mine = itemService.listMine(maria, {});
    assert.equal(mine.items.length, 1);
    assert.equal(mine.items[0].status, 'closed');
    assert.equal(mine.items[0].claimsCount, 0);
  });
});

/* ---------------------------------------------------------- */
describe('editing, closing and deleting reports', () => {
  test('a stranger cannot edit or delete someone elses report', () => {
    const item = itemService.createReport(maria, validReport(), null);
    throwsApi(() => itemService.updateReport(juan, item.id, { title: 'Hijacked title' }), 403);
    throwsApi(() => itemService.removeReport(juan, item.id), 403);
  });

  test('the owner can edit details while the report is open', () => {
    const item = itemService.createReport(maria, validReport(), null);
    const updated = itemService.updateReport(maria, item.id, { title: 'Dark brown wallet', location: 'Gym' });
    assert.equal(updated.title, 'Dark brown wallet');
    assert.equal(updated.location, 'Gym');
  });

  test('edit validation still applies on update', () => {
    const item = itemService.createReport(maria, validReport(), null);
    throwsApi(() => itemService.updateReport(maria, item.id, { title: '' }), 400);
    throwsApi(() => itemService.updateReport(maria, item.id, { date: daysFromToday(5) }), 400);
    throwsApi(() => itemService.updateReport(maria, item.id, {}), 400);
  });

  test('an owner cannot give their report a status like claimed or returned', () => {
    const item = itemService.createReport(maria, validReport(), null);
    for (const status of ['claimed', 'returned', 'lost', 'pending_verification']) {
      throwsApi(() => itemService.updateReport(maria, item.id, { status }), 403);
    }
  });

  test('an owner can withdraw (close) their own open report', () => {
    const item = itemService.createReport(maria, validReport(), null);
    assert.equal(itemService.updateReport(maria, item.id, { status: 'closed' }).status, 'closed');
  });

  test('an owner cannot edit or delete once the office is processing the report', () => {
    const item = itemService.createReport(maria, validReport({ type: 'found' }), null);
    const claim = claimService.createClaim(juan, claimBody(item.id));
    claimService.decideClaim(admin, claim.id, { status: 'approved' });
    throwsApi(() => itemService.updateReport(maria, item.id, { title: 'Sneaky edit' }), 409);
    throwsApi(() => itemService.removeReport(maria, item.id), 409);
  });

  test('admins can edit and set any valid status, but lost/found must match the report type', () => {
    const item = itemService.createReport(maria, validReport({ type: 'lost' }), null);
    assert.equal(itemService.updateReport(admin, item.id, { status: 'claimed' }).status, 'claimed');
    throwsApi(() => itemService.updateReport(admin, item.id, { status: 'found' }), 400);
    throwsApi(() => itemService.updateReport(admin, item.id, { status: 'banana' }), 400);
    assert.equal(itemService.updateReport(admin, item.id, { status: 'lost' }).status, 'lost');
  });

  test('deleting a report also deletes its claims', () => {
    const item = itemService.createReport(maria, validReport({ type: 'found' }), null);
    claimService.createClaim(juan, claimBody(item.id));
    assert.equal(db.getClaims({ itemId: item.id }).length, 1);
    itemService.removeReport(maria, item.id);
    assert.equal(db.getItemById(item.id), undefined);
    assert.equal(db.getClaims({ itemId: item.id }).length, 0);
  });
});

/* ---------------------------------------------------------- */
describe('claims', () => {
  let found;
  beforeEach(() => {
    found = itemService.createReport(maria, validReport({ type: 'found', title: 'Found black wallet' }), null);
  });

  test('a user can file a claim; it starts pending and the item stays unchanged', () => {
    const claim = claimService.createClaim(juan, claimBody(found.id));
    assert.equal(claim.status, 'pending');
    assert.equal(claim.claimType, 'ownership');
    assert.equal(claim.itemId, found.id);
    assert.equal(db.getItemById(found.id).status, 'pending_verification');
  });

  test('claims on a lost report are "finder" claims', () => {
    const lost = itemService.createReport(maria, validReport({ type: 'lost' }), null);
    assert.equal(claimService.createClaim(juan, claimBody(lost.id)).claimType, 'finder');
  });

  test('you cannot claim your own report, and admins cannot file claims', () => {
    throwsApi(() => claimService.createClaim(maria, claimBody(found.id)), 409);
    throwsApi(() => claimService.createClaim(admin, claimBody(found.id)), 403);
  });

  test('the explanation must be detailed enough', () => {
    throwsApi(() => claimService.createClaim(juan, claimBody(found.id, { proofDescription: 'mine' })), 400);
    throwsApi(() => claimService.createClaim(juan, claimBody(found.id, { proofDescription: { a: 1 } })), 400);
  });

  test('appointments must be on a weekday, in office hours and in the future', () => {
    throwsApi(() => claimService.createClaim(juan, claimBody(found.id, { appointmentDate: saturdayFromNow() })), 400);
    throwsApi(() => claimService.createClaim(juan, claimBody(found.id, { appointmentTime: '07:30' })), 400);
    throwsApi(() => claimService.createClaim(juan, claimBody(found.id, { appointmentTime: '17:00' })), 400);
    throwsApi(() => claimService.createClaim(juan, claimBody(found.id, { appointmentDate: '2020-01-06' })), 400);
    throwsApi(() => claimService.createClaim(juan, claimBody(found.id, { appointmentDate: '' })), 400);
    throwsApi(() => claimService.createClaim(juan, claimBody(found.id, { appointmentDate: weekdayFromNow(200) })), 400);
  });

  test('validateAppointment treats a time earlier today as the past (office time)', () => {
    const now = { date: '2030-03-04', minutes: 11 * 60 }; // Monday 11:00
    assert.equal(claimService.validateAppointment('2030-03-04', '10:30', now), 'Appointments cannot be booked in the past.');
    assert.equal(claimService.validateAppointment('2030-03-04', '14:00', now), null);
    assert.equal(claimService.validateAppointment('2030-03-04', '16:30', now), null);
    assert.ok(claimService.validateAppointment('2030-03-04', '16:31', now));
  });

  test('a second open claim by the same person on the same item is refused', () => {
    claimService.createClaim(juan, claimBody(found.id));
    try {
      claimService.createClaim(juan, claimBody(found.id));
      assert.fail('should have thrown');
    } catch (err) {
      assert.equal(err.status, 409);
      assert.ok(err.extra.claim, 'the existing claim is returned');
    }
  });

  test('claims on closed, returned or already-claimed reports are refused', () => {
    adminService.setItemStatus(found.id, 'closed');
    throwsApi(() => claimService.createClaim(juan, claimBody(found.id)), 409);
  });

  test('unknown items give 404 and bad ids give 400', () => {
    throwsApi(() => claimService.createClaim(juan, claimBody(uuid())), 404);
    throwsApi(() => claimService.createClaim(juan, claimBody('nope')), 400);
  });

  test('the claimant sees their own claim with proof; the reporter sees a limited view', () => {
    const claim = claimService.createClaim(juan, claimBody(found.id));
    const mine = claimService.listMine(juan);
    assert.equal(mine.length, 1);
    assert.ok(mine[0].proofDescription);
    assert.equal(mine[0].itemTitle, 'Found black wallet');

    const forReporter = claimService.listForItem(maria, found.id);
    assert.equal(forReporter[0].id, claim.id);
    assert.equal(forReporter[0].proofDescription, undefined);
    assert.equal(forReporter[0].contactInfo, undefined);
    assert.equal(forReporter[0].claimantEmail, undefined);
    assert.equal(forReporter[0].claimantName, 'Juan C.');

    const forAdmin = claimService.listForItem(admin, found.id);
    assert.ok(forAdmin[0].proofDescription);
    assert.equal(forAdmin[0].claimantEmail, 'juan@bpsu.edu.ph');
  });

  test('strangers cannot list claims on someone elses report', () => {
    throwsApi(() => claimService.listForItem(juan, found.id), 403);
  });

  test('only the claimant can cancel, and only while pending', () => {
    const claim = claimService.createClaim(juan, claimBody(found.id));
    throwsApi(() => claimService.cancelClaim(maria, claim.id), 403);
    assert.equal(claimService.cancelClaim(juan, claim.id).status, 'cancelled');
    throwsApi(() => claimService.cancelClaim(juan, claim.id), 409);

    // after cancelling, the person may file again
    const again = claimService.createClaim(juan, claimBody(found.id));
    claimService.decideClaim(admin, again.id, { status: 'approved' });
    throwsApi(() => claimService.cancelClaim(juan, again.id), 409);
  });

  test('users cannot approve or change claim status (service-level guard)', () => {
    const claim = claimService.createClaim(juan, claimBody(found.id));
    throwsApi(() => claimService.decideClaim(juan, claim.id, { status: 'approved' }), 403);
    throwsApi(() => claimService.decideClaim(maria, claim.id, { status: 'approved' }), 403);
    assert.equal(db.getClaimById(claim.id).status, 'pending');
  });
});

/* ---------------------------------------------------------- */
describe('the office review of claims', () => {
  let found;
  let claim;
  beforeEach(() => {
    found = itemService.createReport(maria, validReport({ type: 'found' }), null);
    claim = claimService.createClaim(juan, claimBody(found.id));
  });

  test('approving a claim marks the report as claimed', () => {
    const updated = claimService.decideClaim(admin, claim.id, { status: 'approved', officeNotes: 'ID checked' });
    assert.equal(updated.status, 'approved');
    assert.equal(updated.officeNotes, 'ID checked');
    assert.equal(db.getItemById(found.id).status, 'claimed');
  });

  test('completing a claim returns the report and rejects other open claims', () => {
    const other = makeUser('Third Person', 'third@bpsu.edu.ph');
    const second = claimService.createClaim(other, claimBody(found.id));
    claimService.decideClaim(admin, claim.id, { status: 'approved' });
    claimService.decideClaim(admin, claim.id, { status: 'completed' });
    assert.equal(db.getItemById(found.id).status, 'returned');
    assert.equal(db.getClaimById(second.id).status, 'rejected');
  });

  test('only one claim per item can be approved at a time', () => {
    const other = makeUser('Third Person', 'third@bpsu.edu.ph');
    const second = claimService.createClaim(other, claimBody(found.id));
    claimService.decideClaim(admin, claim.id, { status: 'approved' });
    throwsApi(() => claimService.decideClaim(admin, second.id, { status: 'approved' }), 409);
  });

  test('rejecting an approved claim puts the report back to its active status', () => {
    claimService.decideClaim(admin, claim.id, { status: 'approved' });
    claimService.decideClaim(admin, claim.id, { status: 'rejected' });
    assert.equal(db.getItemById(found.id).status, 'found');
  });

  test('invalid jumps are refused', () => {
    throwsApi(() => claimService.decideClaim(admin, claim.id, { status: 'completed' }), 409); // pending -> completed
    throwsApi(() => claimService.decideClaim(admin, claim.id, { status: 'cancelled' }), 400);
    throwsApi(() => claimService.decideClaim(admin, claim.id, { status: 'banana' }), 400);
    throwsApi(() => claimService.decideClaim(admin, claim.id, {}), 400);
  });

  test('the office can reschedule within office rules', () => {
    const updated = claimService.decideClaim(admin, claim.id, { appointmentDate: weekdayFromNow(3), appointmentTime: '14:30' });
    assert.equal(updated.appointmentTime, '14:30');
    throwsApi(() => claimService.decideClaim(admin, claim.id, { appointmentTime: '18:00' }), 400);
  });

  test('closing a report directly rejects its open claims; returning completes the approved one', () => {
    adminService.setItemStatus(found.id, 'closed');
    assert.equal(db.getClaimById(claim.id).status, 'rejected');

    const found2 = itemService.createReport(maria, validReport({ type: 'found', title: 'Second found item' }), null);
    const c2 = claimService.createClaim(juan, claimBody(found2.id));
    claimService.decideClaim(admin, c2.id, { status: 'approved' });
    adminService.setItemStatus(found2.id, 'returned');
    assert.equal(db.getClaimById(c2.id).status, 'completed');
  });

  test('the admin list can be filtered by status', () => {
    assert.equal(claimService.listAll({ status: 'pending' }).length, 1);
    assert.equal(claimService.listAll({ status: 'approved' }).length, 0);
    throwsApi(() => claimService.listAll({ status: 'banana' }), 400);
  });
});

/* ---------------------------------------------------------- */
describe('admin statistics and verification', () => {
  test('public stats count lost, found, returned and active reports', () => {
    itemService.createReport(maria, validReport({ type: 'lost' }), null);
    const f = itemService.createReport(maria, validReport({ type: 'found' }), null);
    adminService.setItemStatus(f.id, 'returned');
    assert.deepEqual(adminService.publicStats(), { lost: 1, found: 1, returned: 1, active: 1, total: 2 });
  });

  test('admin stats include pending claims, users, status and category breakdowns', () => {
    const f = itemService.createReport(maria, validReport({ type: 'found', category: 'Bags' }), null);
    claimService.createClaim(juan, claimBody(f.id));
    const s = adminService.adminStats();
    assert.equal(s.totalReports, 1);
    assert.equal(s.pendingClaims, 1);
    assert.equal(s.pendingVerification, 1);
    assert.equal(s.users, 2); // admin is not counted
    assert.equal(s.byCategory[0].category, 'Bags');
    assert.equal(s.reportsPerDay.length, 14);
    assert.equal(s.reportsPerDay[13].found, 1);
  });

  test('verifying turns a pending report into its active status, once', () => {
    const lost = itemService.createReport(maria, validReport({ type: 'lost' }), null);
    assert.equal(adminService.verifyItem(lost.id).status, 'lost');
    throwsApi(() => adminService.verifyItem(lost.id), 409);
  });

  test('the user list never exposes password data', () => {
    const users = adminService.listUsers();
    assert.equal(users.length, 3);
    users.forEach((u) => {
      assert.equal(u.passwordHash, undefined);
      assert.equal(typeof u.reports, 'number');
    });
  });

  test('admin list includes reporter email and claim counts', () => {
    const f = itemService.createReport(maria, validReport({ type: 'found' }), null);
    claimService.createClaim(juan, claimBody(f.id));
    const list = adminService.listItemsForAdmin({});
    assert.equal(list.items[0].reporterEmail, 'maria@bpsu.edu.ph');
    assert.equal(list.items[0].pendingClaims, 1);
  });
});

/* ---------------------------------------------------------- */
describe('database upgrades and safety', () => {
  test('reports and claims from older versions are upgraded to the new status names', () => {
    const base = { description: 'old', category: 'Bags', location: 'x', date: '2026-01-01', reportedBy: maria.id, reportedByName: 'M', createdAt: '2026-01-01T00:00:00Z' };
    db.resetDB({
      users: db.readDB().users,
      items: [
        { id: uuid(), type: 'lost', title: 'a', status: 'pending', ...base },
        { id: uuid(), type: 'found', title: 'b', status: 'matched', ...base },
        { id: uuid(), type: 'lost', title: 'c', status: 'claimed', ...base },
        { id: uuid(), type: 'lost', title: 'd', status: 'resolved', ...base },
      ],
      claims: [
        { id: uuid(), itemId: uuid(), status: 'submitted', claimantId: juan.id },
        { id: uuid(), itemId: uuid(), status: 'verified', claimantId: juan.id },
        { id: uuid(), itemId: uuid(), status: 'released', claimantId: juan.id },
      ],
    });
    // resetDB writes the raw legacy data; the next read upgrades it
    const upgraded = db.readDB();
    assert.deepEqual(upgraded.items.map((i) => i.status), ['pending_verification', 'found', 'claimed', 'returned']);
    assert.deepEqual(upgraded.claims.map((c) => c.status), ['pending', 'approved', 'completed']);
    assert.equal(upgraded.schemaVersion, db.SCHEMA_VERSION);
  });

  test('email lookups are case-insensitive and stored lowercase', () => {
    db.createUser({ name: 'Case Test', email: 'MiXeD@Bpsu.edu.ph', passwordHash: 'x', role: 'student' });
    assert.equal(db.findUserByEmail('mixed@bpsu.edu.ph').email, 'mixed@bpsu.edu.ph');
    assert.ok(db.findUserByEmail('MIXED@BPSU.EDU.PH'));
  });

  test('a corrupted database file gives a clear error instead of silently wiping data', () => {
    fs.writeFileSync(process.env.DB_PATH, '{ this is not json');
    assert.throws(() => db.readDB(), /could not be read/);
    db.resetDB(); // restore for following tests
  });

  test('writes leave no temp files behind', () => {
    itemService.createReport(maria, validReport(), null);
    const dir = require('path').dirname(process.env.DB_PATH);
    const leftovers = fs.readdirSync(dir).filter((f) => f.startsWith('tmp-services-db.json.') && f.endsWith('.tmp'));
    assert.deepEqual(leftovers, []);
  });
});
