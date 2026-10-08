// Simple file-based JSON "database".
// This keeps the project free of any external database engine, which is fine
// for a capstone-scale deployment. Swap this module for a real database
// (MySQL / Postgres / MongoDB) later without touching the routes or services,
// as long as the same function names are kept.
//
// Safety notes:
//  - Writes are atomic (temp file + rename) so a crash mid-write cannot
//    leave a half-written db.json behind.
//  - Data written by earlier ReQuora versions (old status names) is upgraded
//    automatically the first time it is read.
//  - Node runs one request at a time through these synchronous functions, so
//    read-modify-write sequences cannot interleave inside a single server.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { LEGACY_ITEM_STATUS, LEGACY_CLAIM_STATUS } = require('./constants');

const SCHEMA_VERSION = 2;

// DB_PATH can be overridden (e.g. by the test suite) so tests never touch
// the real data/db.json used by the running app.
const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, '..', 'data', 'db.json');

function emptyDB() {
  return { schemaVersion: SCHEMA_VERSION, users: [], items: [], claims: [] };
}

function ensureDB() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) writeDB(emptyDB());
}

// Wipes the database back to empty (or to the data you pass in). Used by tests and seed.
function resetDB(data = emptyDB()) {
  ensureDB();
  writeDB({ ...emptyDB(), ...data });
}

/* ---------- upgrade of data written by older versions ---------- */
function migrate(data) {
  let changed = false;

  for (const user of data.users) {
    if (typeof user.email === 'string' && user.email !== user.email.toLowerCase()) {
      user.email = user.email.toLowerCase();
      changed = true;
    }
  }

  for (const item of data.items) {
    if (Object.prototype.hasOwnProperty.call(LEGACY_ITEM_STATUS, item.status)) {
      const mapped = LEGACY_ITEM_STATUS[item.status];
      item.status = mapped === null ? item.type : mapped; // "matched" -> lost/found
      changed = true;
    }
  }

  for (const claim of data.claims) {
    if (Object.prototype.hasOwnProperty.call(LEGACY_CLAIM_STATUS, claim.status)) {
      claim.status = LEGACY_CLAIM_STATUS[claim.status];
      changed = true;
    }
  }

  if (data.schemaVersion !== SCHEMA_VERSION) {
    data.schemaVersion = SCHEMA_VERSION;
    changed = true;
  }
  return changed;
}

function readDB() {
  ensureDB();
  let data;
  try {
    data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch (err) {
    throw new Error(
      `The database file (${DB_PATH}) could not be read: ${err.message}. ` +
        'Fix or delete the file (a new empty one is created automatically).'
    );
  }
  // Collections added after the first release may be missing from an older db.json.
  if (!Array.isArray(data.users)) data.users = [];
  if (!Array.isArray(data.items)) data.items = [];
  if (!Array.isArray(data.claims)) data.claims = [];

  if (migrate(data)) writeDB(data);
  return data;
}

function writeDB(data) {
  const json = JSON.stringify(data, null, 2);
  const tmp = `${DB_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, json);
  try {
    fs.renameSync(tmp, DB_PATH);
  } catch (err) {
    // Windows can refuse to replace a file that antivirus/indexing is touching.
    // Fall back to a direct write rather than losing the update.
    fs.writeFileSync(DB_PATH, json);
    try {
      fs.unlinkSync(tmp);
    } catch (e) {
      /* temp file already gone */
    }
  }
}

function newId() {
  return crypto.randomUUID();
}

const nowIso = () => new Date().toISOString();
const str = (v) => (typeof v === 'string' ? v : '');

// ---------- Users ----------
function findUserByEmail(email) {
  const wanted = String(email || '').toLowerCase();
  return readDB().users.find((u) => String(u.email).toLowerCase() === wanted);
}

function findUserById(id) {
  return readDB().users.find((u) => u.id === id);
}

function listUsers() {
  return readDB().users.slice();
}

function createUser(user) {
  const db = readDB();
  const newUser = {
    id: newId(),
    createdAt: nowIso(),
    ...user,
    email: String(user.email).toLowerCase(),
  };
  db.users.push(newUser);
  writeDB(db);
  return newUser;
}

function updateUser(id, updates) {
  const db = readDB();
  const idx = db.users.findIndex((u) => u.id === id);
  if (idx === -1) return null;
  db.users[idx] = { ...db.users[idx], ...updates, updatedAt: nowIso() };
  writeDB(db);
  return db.users[idx];
}

// ---------- Items ----------
/**
 * Returns every item matching the filters, newest first.
 * filters: type, category, status, q, location, dateFrom, dateTo, reportedBy,
 *          statusNotIn (array of statuses to hide)
 */
function getItems(filters = {}) {
  let items = readDB().items;

  if (filters.type) items = items.filter((i) => i.type === filters.type);
  if (filters.category) {
    const c = filters.category.toLowerCase();
    items = items.filter((i) => str(i.category).toLowerCase() === c);
  }
  if (filters.status) {
    items = items.filter((i) => i.status === filters.status);
  } else if (Array.isArray(filters.statusNotIn) && filters.statusNotIn.length) {
    items = items.filter((i) => !filters.statusNotIn.includes(i.status));
  }
  if (filters.reportedBy) items = items.filter((i) => i.reportedBy === filters.reportedBy);
  if (filters.location) {
    const l = filters.location.toLowerCase();
    items = items.filter((i) => str(i.location).toLowerCase().includes(l));
  }
  if (filters.dateFrom) items = items.filter((i) => str(i.date) >= filters.dateFrom);
  if (filters.dateTo) items = items.filter((i) => str(i.date) <= filters.dateTo);
  if (filters.q) {
    const q = filters.q.toLowerCase();
    items = items.filter(
      (i) =>
        str(i.title).toLowerCase().includes(q) ||
        str(i.description).toLowerCase().includes(q) ||
        str(i.location).toLowerCase().includes(q) ||
        str(i.category).toLowerCase().includes(q)
    );
  }

  return items.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getItemById(id) {
  return readDB().items.find((i) => i.id === id);
}

function createItem(item) {
  const db = readDB();
  const newItem = {
    id: newId(),
    status: 'pending_verification',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...item,
  };
  db.items.push(newItem);
  writeDB(db);
  return newItem;
}

function updateItem(id, updates) {
  const db = readDB();
  const idx = db.items.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  db.items[idx] = { ...db.items[idx], ...updates, updatedAt: nowIso() };
  writeDB(db);
  return db.items[idx];
}

// Removes the item AND its claims in a single write. Returns the removed item
// (so the caller can delete its photo) or null when it did not exist.
function deleteItem(id) {
  const db = readDB();
  const idx = db.items.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  const [removed] = db.items.splice(idx, 1);
  db.claims = db.claims.filter((c) => c.itemId !== id);
  writeDB(db);
  return removed;
}

// ---------- Claims ----------
function getClaims(filters = {}) {
  let claims = readDB().claims;

  if (filters.itemId) claims = claims.filter((c) => c.itemId === filters.itemId);
  if (filters.claimantId) claims = claims.filter((c) => c.claimantId === filters.claimantId);
  if (filters.status) claims = claims.filter((c) => c.status === filters.status);

  return claims.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getClaimById(id) {
  return readDB().claims.find((c) => c.id === id);
}

function createClaim(claim) {
  const db = readDB();
  const newClaim = {
    id: newId(),
    status: 'pending',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...claim,
  };
  db.claims.push(newClaim);
  writeDB(db);
  return newClaim;
}

function updateClaim(id, updates) {
  const db = readDB();
  const idx = db.claims.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  db.claims[idx] = { ...db.claims[idx], ...updates, updatedAt: nowIso() };
  writeDB(db);
  return db.claims[idx];
}

module.exports = {
  DB_PATH,
  SCHEMA_VERSION,
  ensureDB,
  resetDB,
  readDB,
  writeDB,
  findUserByEmail,
  findUserById,
  listUsers,
  createUser,
  updateUser,
  getItems,
  getItemById,
  createItem,
  updateItem,
  deleteItem,
  getClaims,
  getClaimById,
  createClaim,
  updateClaim,
};
