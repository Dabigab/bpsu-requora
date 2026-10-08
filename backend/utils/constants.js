/* ============================================================
   ReQuora — shared constants
   Single source of truth for every status / category value the
   API accepts. The frontend reads the same lists from
   GET /api/meta, so the two sides can never drift apart.
   ============================================================ */

const ITEM_TYPES = ['lost', 'found'];

// Item (report) statuses
//   pending_verification  newly filed, not yet checked by the office
//   lost / found          verified and active (matches the report type)
//   claimed               a claim was approved; waiting for hand-over
//   returned              item handed back to its owner
//   closed                withdrawn, duplicate, or otherwise finished
const ITEM_STATUSES = ['pending_verification', 'lost', 'found', 'claimed', 'returned', 'closed'];

// Statuses hidden from the public feed unless asked for explicitly.
const HIDDEN_BY_DEFAULT = ['returned', 'closed'];

// Statuses in which a report can still be claimed / edited by its owner.
const OPEN_STATUSES = ['pending_verification', 'lost', 'found'];

// Claim statuses
const CLAIM_STATUSES = ['pending', 'approved', 'rejected', 'completed', 'cancelled'];

// Which claim status can move to which (admin decisions).
const CLAIM_TRANSITIONS = {
  pending: ['approved', 'rejected'],
  approved: ['completed', 'rejected'],
  rejected: ['pending'],
  completed: [],
  cancelled: [],
};

const CATEGORIES = [
  'Electronics',
  'ID / Cards',
  'Bags',
  'Clothing',
  'Documents',
  'Accessories',
  'Keys',
  'Books & Supplies',
  'Other',
];

const USER_ROLES = ['student', 'faculty', 'staff', 'admin'];
const SELF_REGISTER_ROLES = ['student', 'faculty', 'staff'];

// Verification tiers: the more valuable the item, the stricter the check.
const HIGH_VALUE = ['Electronics', 'ID / Cards', 'Documents'];
const MEDIUM_VALUE = ['Bags', 'Accessories', 'Keys'];

// Claiming appointments (Lost & Found Office, Philippine time, weekdays only)
const OFFICE_TIMEZONE_OFFSET_MINUTES = 8 * 60; // UTC+8, no daylight saving
const OFFICE_OPEN_MINUTES = 8 * 60; // 8:00 AM
const OFFICE_LAST_SLOT_MINUTES = 16 * 60 + 30; // 4:30 PM (office closes 5:00 PM)

const LIMITS = {
  name: { min: 2, max: 80 },
  email: { max: 120 },
  password: { min: 8, max: 72 }, // bcrypt only uses the first 72 bytes
  studentId: { max: 30 },
  title: { min: 3, max: 100 },
  description: { min: 10, max: 1000 },
  location: { min: 3, max: 150 },
  additionalDetails: { max: 500 },
  contactInfo: { max: 120 },
  proof: { min: 20, max: 1000 },
  officeNotes: { max: 500 },
  imageBytes: 5 * 1024 * 1024,
};

// Old status names written by earlier versions of ReQuora. db.js converts
// them on first read so existing data keeps working.
const LEGACY_ITEM_STATUS = {
  pending: 'pending_verification',
  matched: null, // becomes the item's own type (lost / found)
  claimed: 'claimed',
  resolved: 'returned',
};
const LEGACY_CLAIM_STATUS = {
  submitted: 'pending',
  verified: 'approved',
  released: 'completed',
  rejected: 'rejected',
};

function verificationTier(category) {
  if (HIGH_VALUE.includes(category)) return 'high';
  if (MEDIUM_VALUE.includes(category)) return 'medium';
  return 'standard';
}

module.exports = {
  ITEM_TYPES,
  ITEM_STATUSES,
  HIDDEN_BY_DEFAULT,
  OPEN_STATUSES,
  CLAIM_STATUSES,
  CLAIM_TRANSITIONS,
  CATEGORIES,
  USER_ROLES,
  SELF_REGISTER_ROLES,
  HIGH_VALUE,
  MEDIUM_VALUE,
  OFFICE_TIMEZONE_OFFSET_MINUTES,
  OFFICE_OPEN_MINUTES,
  OFFICE_LAST_SLOT_MINUTES,
  LIMITS,
  LEGACY_ITEM_STATUS,
  LEGACY_CLAIM_STATUS,
  verificationTier,
};
