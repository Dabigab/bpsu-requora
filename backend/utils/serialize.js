/* ============================================================
   ReQuora — what the API is allowed to show to whom
   Records are stored with everything. These functions decide which
   fields leave the server for a given viewer (guest, owner, claimant,
   admin). Doing it in one place means a new endpoint cannot
   accidentally leak private data.
   ============================================================ */

const { verificationTier } = require('./constants');

// Short code people can quote at the office, e.g. RQ-3F9A12BC
function referenceCode(id) {
  return `RQ-${String(id).replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

// "Maria Santos" -> "Maria S."  (strangers never see full names)
function shortName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'BPSU member';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

const isAdmin = (viewer) => !!viewer && viewer.role === 'admin';

/**
 * @param item    stored item
 * @param viewer  req.user or undefined for guests
 * @param opts    { canSeeContact } extra permission (e.g. approved claimant)
 */
function serializeItem(item, viewer, opts = {}) {
  const owner = !!viewer && item.reportedBy === viewer.id;
  const admin = isAdmin(viewer);

  const out = {
    id: item.id,
    reference: referenceCode(item.id),
    type: item.type,
    title: item.title,
    description: item.description,
    category: item.category,
    location: item.location,
    date: item.date,
    time: item.time || null,
    additionalDetails: item.additionalDetails || null,
    imageUrl: item.imageUrl || null,
    status: item.status,
    verificationTier: verificationTier(item.category),
    reportedByName: owner || admin ? item.reportedByName || 'Unknown' : shortName(item.reportedByName),
    isOwner: owner,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt || item.createdAt,
  };

  if (owner || admin || opts.canSeeContact) out.contactInfo = item.contactInfo || null;
  if (admin) out.reportedBy = item.reportedBy;
  return out;
}

/**
 * @param claim   stored claim
 * @param item    the item it belongs to (may be undefined if deleted)
 * @param view    'claimant' | 'admin' | 'reporter'
 */
function serializeClaim(claim, item, view) {
  const base = {
    id: claim.id,
    reference: referenceCode(claim.id),
    itemId: claim.itemId,
    itemReference: referenceCode(claim.itemId),
    itemTitle: (item && item.title) || claim.itemTitle || 'Item',
    itemType: (item && item.type) || null,
    itemStatus: (item && item.status) || null,
    itemImageUrl: (item && item.imageUrl) || null,
    status: claim.status,
    claimType: claim.claimType || 'ownership',
    appointmentDate: claim.appointmentDate,
    appointmentTime: claim.appointmentTime,
    verificationTier: claim.verificationTier || verificationTier(claim.itemCategory),
    createdAt: claim.createdAt,
    updatedAt: claim.updatedAt,
  };

  if (view === 'reporter') {
    // The reporter learns that someone is claiming and when they are coming,
    // but the office alone sees the proof and contact details.
    base.claimantName = shortName(claim.claimantName);
    return base;
  }

  base.proofDescription = claim.proofDescription;
  base.contactInfo = claim.contactInfo || null;
  base.officeNotes = claim.officeNotes || null;

  if (view === 'admin') {
    base.claimantId = claim.claimantId;
    base.claimantName = claim.claimantName;
    base.claimantEmail = claim.claimantEmail;
    base.reviewedAt = claim.reviewedAt || null;
  }
  return base;
}

module.exports = { referenceCode, shortName, serializeItem, serializeClaim };
