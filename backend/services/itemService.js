/* ============================================================
   ReQuora — item (report) business rules
   Pure logic, no Express: routes call these functions and send the
   result. Keeping the rules here makes them easy to test.
   ============================================================ */

const db = require('../utils/db');
const { Errors } = require('../utils/http');
const {
  ITEM_TYPES,
  ITEM_STATUSES,
  HIDDEN_BY_DEFAULT,
  OPEN_STATUSES,
  CATEGORIES,
  OFFICE_TIMEZONE_OFFSET_MINUTES,
  LIMITS,
} = require('../utils/constants');
const {
  textField,
  throwIfInvalid,
  isIsoDate,
  isClockTime,
  isUuid,
  queryString,
  queryInt,
  clean,
  asString,
} = require('../utils/validate');
const { serializeItem, serializeClaim } = require('../utils/serialize');
const { removeUpload } = require('../utils/imageFiles');

// "Today" in Philippine time as YYYY-MM-DD (the server may run anywhere).
function officeToday() {
  return new Date(Date.now() + OFFICE_TIMEZONE_OFFSET_MINUTES * 60000).toISOString().slice(0, 10);
}

function matchCategory(raw) {
  const wanted = clean(asString(raw)).toLowerCase();
  return CATEGORIES.find((c) => c.toLowerCase() === wanted) || null;
}

function isOwnerOrAdmin(user, item) {
  return !!user && (user.role === 'admin' || item.reportedBy === user.id);
}

function findItemOr404(id) {
  if (!isUuid(id)) throw Errors.notFound('That report could not be found.');
  const item = db.getItemById(id);
  if (!item) throw Errors.notFound('That report could not be found.');
  return item;
}

/* ------------------------------------------------------------
   Reading
   ------------------------------------------------------------ */

// Turns ?type=&status=&q=... into db filters, rejecting nonsense values.
function parseFilters(query, { allowStatusAll = true } = {}) {
  const fields = {};
  const filters = {};

  const type = queryString(query.type);
  if (type) {
    if (!ITEM_TYPES.includes(type)) fields.type = 'Type must be "lost" or "found".';
    else filters.type = type;
  }

  const status = queryString(query.status);
  if (status && status !== 'all') {
    if (!ITEM_STATUSES.includes(status)) fields.status = 'Unknown status.';
    else filters.status = status;
  } else if (!status || !allowStatusAll) {
    filters.statusNotIn = HIDDEN_BY_DEFAULT;
  }

  const category = queryString(query.category);
  if (category) filters.category = category;

  const q = queryString(query.q, 100);
  if (q) filters.q = q;

  const location = queryString(query.location, 100);
  if (location) filters.location = location;

  for (const key of ['dateFrom', 'dateTo']) {
    const v = queryString(query[key], 10);
    if (v) {
      if (!isIsoDate(v)) fields[key] = 'Use the format YYYY-MM-DD.';
      else filters[key] = v;
    }
  }

  throwIfInvalid(fields, 'Some filters are not valid.');
  return filters;
}

function paginate(list, query, defaultLimit = 12) {
  const limit = queryInt(query.limit, defaultLimit, { min: 1, max: 50 });
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(queryInt(query.page, 1, { min: 1, max: 100000 }), totalPages);
  const start = (page - 1) * limit;
  return { slice: list.slice(start, start + limit), pagination: { page, limit, total, totalPages } };
}

function sortItems(items, sort) {
  if (sort === 'oldest') return items.slice().reverse(); // getItems is newest-first
  return items;
}

function listItems(query, viewer) {
  const filters = parseFilters(query);
  const sorted = sortItems(db.getItems(filters), queryString(query.sort, 10));
  const { slice, pagination } = paginate(sorted, query);
  return { items: slice.map((i) => serializeItem(i, viewer)), pagination };
}

function getItemForViewer(id, viewer) {
  const item = findItemOr404(id);
  const claims = viewer ? db.getClaims({ itemId: item.id, claimantId: viewer.id }) : [];
  const myClaim = claims.find((c) => c.status !== 'cancelled') || null;
  const approvedClaimant = claims.some((c) => c.status === 'approved' || c.status === 'completed');

  const owner = !!viewer && item.reportedBy === viewer.id;
  const canClaim =
    !!viewer &&
    !owner &&
    viewer.role !== 'admin' &&
    OPEN_STATUSES.includes(item.status) &&
    !(myClaim && ['pending', 'approved'].includes(myClaim.status));

  return {
    item: serializeItem(item, viewer, { canSeeContact: approvedClaimant }),
    myClaim: myClaim ? serializeClaim(myClaim, item, 'claimant') : null,
    canClaim,
  };
}

function listMine(user, query) {
  const filters = parseFilters({ ...query, status: query.status || 'all' });
  filters.reportedBy = user.id;
  const sorted = db.getItems(filters);
  const { slice, pagination } = paginate(sorted, query, 20);
  const items = slice.map((i) => {
    const claims = db.getClaims({ itemId: i.id });
    return {
      ...serializeItem(i, user),
      claimsCount: claims.length,
      pendingClaims: claims.filter((c) => c.status === 'pending').length,
    };
  });
  return { items, pagination };
}

/* ------------------------------------------------------------
   Creating
   ------------------------------------------------------------ */
function validateReportFields(body, { partial = false } = {}) {
  const fields = {};
  const values = {};
  const has = (k) => body[k] !== undefined;

  if (!partial || has('title')) {
    values.title = textField(fields, 'title', body.title, { label: 'Item name', ...LIMITS.title, required: true });
  }
  if (!partial || has('description')) {
    values.description = textField(fields, 'description', body.description, { label: 'Description', ...LIMITS.description, required: true });
  }
  if (!partial || has('location')) {
    values.location = textField(fields, 'location', body.location, { label: 'Location', ...LIMITS.location, required: true });
  }
  if (!partial || has('category')) {
    const category = matchCategory(body.category);
    if (!category) fields.category = 'Please choose a category from the list.';
    else values.category = category;
  }
  if (!partial || has('date')) {
    const date = clean(asString(body.date));
    if (!isIsoDate(date)) fields.date = 'Please enter a valid date.';
    else if (date > officeToday()) fields.date = 'The date cannot be in the future.';
    else values.date = date;
  }
  if (has('time')) {
    const time = clean(asString(body.time));
    if (time && !isClockTime(time)) fields.time = 'Please enter a valid time.';
    else values.time = time || null;
  }
  if (has('additionalDetails')) {
    values.additionalDetails =
      textField(fields, 'additionalDetails', body.additionalDetails, { label: 'Additional details', max: LIMITS.additionalDetails.max }) || null;
  }
  if (has('contactInfo')) {
    values.contactInfo = textField(fields, 'contactInfo', body.contactInfo, { label: 'Contact info', max: LIMITS.contactInfo.max }) || null;
  }

  throwIfInvalid(fields);
  return values;
}

function createReport(user, body, file) {
  const fields = {};
  const type = clean(asString(body.type));
  if (!ITEM_TYPES.includes(type)) fields.type = 'Choose whether the item was lost or found.';
  throwIfInvalid(fields);

  const values = validateReportFields(body);

  const item = db.createItem({
    type,
    ...values,
    time: values.time || null,
    additionalDetails: values.additionalDetails || null,
    contactInfo: values.contactInfo || null,
    imageUrl: file ? `/uploads/${file.filename}` : null,
    status: 'pending_verification',
    reportedBy: user.id,
    reportedByName: user.name,
  });
  return serializeItem(item, user);
}

/* ------------------------------------------------------------
   Updating / deleting
   ------------------------------------------------------------ */
function updateReport(user, id, body) {
  const item = findItemOr404(id);
  if (!isOwnerOrAdmin(user, item)) throw Errors.forbidden('You can only edit reports that you filed.');

  const admin = user.role === 'admin';
  const updates = validateReportFields(body, { partial: true });

  const editingDetails = Object.keys(updates).length > 0;
  if (editingDetails && !admin && !OPEN_STATUSES.includes(item.status)) {
    throw Errors.conflict('This report can no longer be edited because it is already being processed. Contact the Lost and Found Office.');
  }

  if (body.status !== undefined) {
    const status = clean(asString(body.status));
    if (admin) {
      updates.status = checkAdminStatus(item, status);
    } else if (status === 'closed' && OPEN_STATUSES.includes(item.status)) {
      updates.status = 'closed'; // an owner may withdraw their own report
    } else {
      throw Errors.forbidden('You can only close your own open reports. Other status changes are made by the office.');
    }
  }

  if (!Object.keys(updates).length) throw Errors.validation('Nothing to update.');

  const updated = db.updateItem(item.id, updates);
  if (updates.status) syncClaimsWithItemStatus(updated);
  return serializeItem(updated, user);
}

// Admin status rules shared with adminService.
function checkAdminStatus(item, status) {
  if (!ITEM_STATUSES.includes(status)) throw Errors.validation('Invalid status value.', { status: 'Unknown status.' });
  if ((status === 'lost' || status === 'found') && status !== item.type) {
    throw Errors.validation(`This is a ${item.type} report, so its active status is "${item.type}".`, { status: `Use "${item.type}" for this report.` });
  }
  return status;
}

// Keeps claims consistent when the office closes/returns a report directly.
function syncClaimsWithItemStatus(item) {
  const claims = db.getClaims({ itemId: item.id });
  const now = new Date().toISOString();
  if (item.status === 'returned') {
    for (const c of claims) {
      if (c.status === 'approved') db.updateClaim(c.id, { status: 'completed', reviewedAt: now });
      else if (c.status === 'pending') {
        db.updateClaim(c.id, { status: 'rejected', reviewedAt: now, officeNotes: c.officeNotes || 'The item was returned to its owner.' });
      }
    }
  } else if (item.status === 'closed') {
    for (const c of claims) {
      if (c.status === 'pending' || c.status === 'approved') {
        db.updateClaim(c.id, { status: 'rejected', reviewedAt: now, officeNotes: c.officeNotes || 'This report was closed.' });
      }
    }
  }
}

function removeReport(user, id) {
  const item = findItemOr404(id);
  if (!isOwnerOrAdmin(user, item)) throw Errors.forbidden('You can only delete reports that you filed.');

  if (user.role !== 'admin') {
    const hasActiveClaim = db.getClaims({ itemId: item.id }).some((c) => c.status === 'approved' || c.status === 'completed');
    if (!OPEN_STATUSES.includes(item.status) || hasActiveClaim) {
      throw Errors.conflict('This report is already being processed and can no longer be deleted. Ask the Lost and Found Office to close it.');
    }
  }

  const removed = db.deleteItem(item.id);
  if (removed) removeUpload(removed.imageUrl);
  return { id: item.id };
}

module.exports = {
  officeToday,
  matchCategory,
  isOwnerOrAdmin,
  findItemOr404,
  parseFilters,
  paginate,
  sortItems,
  listItems,
  getItemForViewer,
  listMine,
  createReport,
  updateReport,
  removeReport,
  checkAdminStatus,
  syncClaimsWithItemStatus,
};
