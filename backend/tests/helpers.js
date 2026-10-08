// Shared helpers for the test files. Each test file points DB_PATH at its own
// temporary database BEFORE requiring anything that touches utils/db.js.
const crypto = require('node:crypto');

function weekdayFromNow(daysAhead = 1) {
  const d = new Date(Date.now() + 8 * 3600 * 1000); // office time
  d.setUTCDate(d.getUTCDate() + daysAhead);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function saturdayFromNow() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function todayStr() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function daysFromToday(n) {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const validReport = (overrides = {}) => ({
  type: 'lost',
  title: 'Brown leather wallet',
  description: 'Lost near the canteen, has a BPSU ID inside.',
  category: 'Accessories',
  location: 'University Canteen',
  date: todayStr(),
  ...overrides,
});

const uuid = () => crypto.randomUUID();

module.exports = { weekdayFromNow, saturdayFromNow, todayStr, daysFromToday, validReport, uuid };
