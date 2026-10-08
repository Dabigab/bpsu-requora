/* ============================================================
   ReQuora — input validation helpers
   Small, dependency-free helpers. Each route/service collects
   problems into a `fields` object and throws one validation error.
   ============================================================ */

const { Errors } = require('./http');

// Remove control characters (keeps \n and \t) and trim the ends.
function clean(value) {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}

// Always returns a plain string, even for arrays/objects sent by a client.
function asString(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

function isEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

// "YYYY-MM-DD" that is also a real calendar date.
function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// "HH:MM" 24-hour.
function isClockTime(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/**
 * Validates a text field and records any problem in `fields`.
 * Returns the cleaned value (or '' when invalid/absent).
 */
function textField(fields, name, raw, { label, min = 0, max = 500, required = false } = {}) {
  const niceName = label || name;
  const value = clean(asString(raw));
  if (!value) {
    if (required) fields[name] = `${niceName} is required.`;
    return '';
  }
  if (value.length < min) {
    fields[name] = `${niceName} must be at least ${min} characters.`;
    return value;
  }
  if (value.length > max) {
    fields[name] = `${niceName} must be ${max} characters or fewer.`;
    return value;
  }
  return value;
}

function throwIfInvalid(fields, message) {
  if (Object.keys(fields).length) throw Errors.validation(message, fields);
}

// Express query values can be arrays/objects (?a=1&a=2). Return one string.
function queryString(value, max = 100) {
  if (Array.isArray(value)) value = value[0];
  return clean(asString(value)).slice(0, max);
}

function queryInt(value, fallback, { min = 1, max = 1000 } = {}) {
  const n = parseInt(queryString(value, 12), 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

module.exports = {
  clean,
  asString,
  isEmail,
  isUuid,
  isIsoDate,
  isClockTime,
  textField,
  throwIfInvalid,
  queryString,
  queryInt,
};
