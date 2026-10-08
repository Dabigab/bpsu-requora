/* ============================================================
   ReQuora — claim business rules
   A claim is filed when a possible owner (for a found item) or a
   possible finder (for a lost item) asks the BPSU Lost & Found Office
   to look into an item, and books a visit to the office.

   Status flow (only the office can move a claim forward):
     pending -> approved -> completed
     pending -> rejected,  approved -> rejected,  rejected -> pending
     pending -> cancelled   (by the person who filed it)
   ============================================================ */

const db = require('../utils/db');
const { Errors } = require('../utils/http');
const {
  CLAIM_STATUSES,
  CLAIM_TRANSITIONS,
  OPEN_STATUSES,
  OFFICE_TIMEZONE_OFFSET_MINUTES,
  OFFICE_OPEN_MINUTES,
  OFFICE_LAST_SLOT_MINUTES,
  LIMITS,
  verificationTier,
} = require('../utils/constants');
const { textField, throwIfInvalid, isUuid, isIsoDate, isClockTime, clean, asString, queryString } = require('../utils/validate');
const { serializeClaim } = require('../utils/serialize');

const MAX_DAYS_AHEAD = 60;

// Current date and minutes-since-midnight at the office (Philippine time).
function officeNow(nowMs = Date.now()) {
  const t = new Date(nowMs + OFFICE_TIMEZONE_OFFSET_MINUTES * 60000);
  return { date: t.toISOString().slice(0, 10), minutes: t.getUTCHours() * 60 + t.getUTCMinutes() };
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Returns an error message, or null when the appointment is acceptable. */
function validateAppointment(dateStr, timeStr, now = officeNow()) {
  if (!dateStr || !timeStr) return 'Please choose both an appointment date and a time.';
  if (!isIsoDate(dateStr) || !isClockTime(timeStr)) return 'That appointment date or time could not be read.';

  const weekday = new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0 = Sunday, 6 = Saturday
  if (weekday === 0 || weekday === 6) return 'The Lost and Found Office is open on weekdays only (Monday to Friday).';

  const minutes = toMinutes(timeStr);
  if (minutes < OFFICE_OPEN_MINUTES || minutes > OFFICE_LAST_SLOT_MINUTES) {
    return 'Please choose a time between 8:00 AM and 4:30 PM (the office closes at 5:00 PM).';
  }

  if (dateStr < now.date || (dateStr === now.date && minutes <= now.minutes)) {
    return 'Appointments cannot be booked in the past.';
  }

  const limit = new Date(`${now.date}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + MAX_DAYS_AHEAD);
  if (dateStr > limit.toISOString().slice(0, 10)) {
    return `Appointments can be booked up to ${MAX_DAYS_AHEAD} days ahead.`;
  }
  return null;
}

function findClaimOr404(id) {
  if (!isUuid(id)) throw Errors.notFound('That claim could not be found.');
  const claim = db.getClaimById(id);
  if (!claim) throw Errors.notFound('That claim could not be found.');
  return claim;
}

/* ------------------------------------------------------------
   Filing a claim
   ------------------------------------------------------------ */
function createClaim(user, body) {
  const fields = {};

  const itemId = clean(asString(body.itemId));
  if (!isUuid(itemId)) throw Errors.validation('Please choose a valid item to claim.', { itemId: 'Invalid item.' });
  const item = db.getItemById(itemId);
  if (!item) throw Errors.notFound('That item could not be found.');

  if (user.role === 'admin') throw Errors.forbidden('Administrators review claims; they cannot file them.');
  if (item.reportedBy === user.id) {
    throw Errors.conflict('You filed this report yourself, so you cannot claim it.');
  }
  if (!OPEN_STATUSES.includes(item.status)) {
    throw Errors.conflict('This item can no longer be claimed because it is already being processed or has been closed.');
  }

  const proof = textField(fields, 'proofDescription', body.proofDescription, { label: 'Your explanation', ...LIMITS.proof, required: true });
  const contactInfo = textField(fields, 'contactInfo', body.contactInfo, { label: 'Contact info', max: LIMITS.contactInfo.max });
  const appointmentDate = clean(asString(body.appointmentDate));
  const appointmentTime = clean(asString(body.appointmentTime));
  const appointmentError = validateAppointment(appointmentDate, appointmentTime);
  if (appointmentError) fields.appointment = appointmentError;
  throwIfInvalid(fields, appointmentError || 'Please check the highlighted fields.');

  // One open claim per person per item.
  const existing = db.getClaims({ itemId, claimantId: user.id }).find((c) => c.status === 'pending' || c.status === 'approved');
  if (existing) {
    throw Errors.conflict('You already have an open claim on this item.', { claim: serializeClaim(existing, item, 'claimant') });
  }

  const claim = db.createClaim({
    itemId,
    itemTitle: item.title,
    itemCategory: item.category,
    claimType: item.type === 'found' ? 'ownership' : 'finder',
    claimantId: user.id,
    claimantName: user.name,
    claimantEmail: user.email,
    contactInfo: contactInfo || null,
    proofDescription: proof,
    appointmentDate,
    appointmentTime,
    verificationTier: verificationTier(item.category),
  });
  return serializeClaim(claim, item, 'claimant');
}

/* ------------------------------------------------------------
   Reading
   ------------------------------------------------------------ */
function listMine(user) {
  return db.getClaims({ claimantId: user.id }).map((c) => serializeClaim(c, db.getItemById(c.itemId), 'claimant'));
}

function listForItem(user, itemId) {
  if (!isUuid(itemId)) throw Errors.notFound('That report could not be found.');
  const item = db.getItemById(itemId);
  if (!item) throw Errors.notFound('That report could not be found.');

  const admin = user.role === 'admin';
  if (!admin && item.reportedBy !== user.id) {
    throw Errors.forbidden('Only the person who filed this report or an administrator can see its claims.');
  }
  return db.getClaims({ itemId }).map((c) => serializeClaim(c, item, admin ? 'admin' : 'reporter'));
}

function listAll(query) {
  const status = queryString(query.status);
  if (status && !CLAIM_STATUSES.includes(status)) {
    throw Errors.validation('Unknown claim status.', { status: 'Unknown status.' });
  }
  return db.getClaims({ status: status || undefined }).map((c) => serializeClaim(c, db.getItemById(c.itemId), 'admin'));
}

/* ------------------------------------------------------------
   Cancelling (by the claimant)
   ------------------------------------------------------------ */
function cancelClaim(user, id) {
  const claim = findClaimOr404(id);
  if (claim.claimantId !== user.id) throw Errors.forbidden('You can only cancel your own claims.');
  if (claim.status !== 'pending') {
    throw Errors.conflict('Only a claim that has not been reviewed yet can be cancelled. Please contact the office.');
  }
  const updated = db.updateClaim(claim.id, { status: 'cancelled' });
  return serializeClaim(updated, db.getItemById(claim.itemId), 'claimant');
}

/* ------------------------------------------------------------
   The office's decision (admin only — enforced by the route AND here)
   ------------------------------------------------------------ */
function decideClaim(admin, id, body) {
  if (!admin || admin.role !== 'admin') throw Errors.forbidden('Administrator access is required.');

  const claim = findClaimOr404(id);
  const item = db.getItemById(claim.itemId);
  const fields = {};
  const updates = {};

  if (body.status !== undefined) {
    const next = clean(asString(body.status));
    if (!CLAIM_STATUSES.includes(next) || next === 'cancelled') {
      throw Errors.validation('Invalid claim status.', { status: 'Choose pending, approved, rejected or completed.' });
    }
    if (next !== claim.status) {
      if (!CLAIM_TRANSITIONS[claim.status].includes(next)) {
        throw Errors.conflict(`A ${claim.status} claim cannot be changed to ${next}.`);
      }
      updates.status = next;
    }
  }

  if (body.officeNotes !== undefined) {
    updates.officeNotes = textField(fields, 'officeNotes', body.officeNotes, { label: 'Office notes', max: LIMITS.officeNotes.max }) || null;
  }

  if (body.appointmentDate !== undefined || body.appointmentTime !== undefined) {
    const date = clean(asString(body.appointmentDate)) || claim.appointmentDate;
    const time = clean(asString(body.appointmentTime)) || claim.appointmentTime;
    const err = validateAppointment(date, time);
    if (err) fields.appointment = err;
    else {
      updates.appointmentDate = date;
      updates.appointmentTime = time;
    }
  }
  throwIfInvalid(fields);

  if (!Object.keys(updates).length) throw Errors.validation('Nothing to update.');

  if (updates.status) {
    if (!item) throw Errors.conflict('The report for this claim no longer exists.');

    if (updates.status === 'approved') {
      const other = db.getClaims({ itemId: item.id, status: 'approved' }).find((c) => c.id !== claim.id);
      if (other) throw Errors.conflict('Another claim on this item is already approved. Reject it first if you need to approve this one.');
      if (['returned', 'closed'].includes(item.status)) throw Errors.conflict('This item is already returned or closed.');
    }
    updates.reviewedAt = new Date().toISOString();
    updates.reviewedBy = admin.id;
  }

  const updated = db.updateClaim(claim.id, updates);

  // Keep the report's own status in step with the claim.
  if (updates.status && item) {
    if (updates.status === 'approved') {
      db.updateItem(item.id, { status: 'claimed' });
    } else if (updates.status === 'completed') {
      db.updateItem(item.id, { status: 'returned' });
      const now = new Date().toISOString();
      for (const c of db.getClaims({ itemId: item.id })) {
        if (c.id !== claim.id && (c.status === 'pending' || c.status === 'approved')) {
          db.updateClaim(c.id, { status: 'rejected', reviewedAt: now, officeNotes: c.officeNotes || 'The item was returned to another claimant.' });
        }
      }
    } else if (updates.status === 'rejected' && claim.status === 'approved' && item.status === 'claimed') {
      db.updateItem(item.id, { status: item.type }); // back to a verified, claimable report
    }
  }

  return serializeClaim(updated, db.getItemById(claim.itemId), 'admin');
}

module.exports = {
  officeNow,
  validateAppointment,
  createClaim,
  listMine,
  listForItem,
  listAll,
  cancelClaim,
  decideClaim,
};
