/* ============================================================
   ReQuora — item details page
   Shows one report and, depending on who is looking:
     guest      -> a prompt to log in to claim
     other user -> the claim flow (or the status of their claim)
     reporter   -> controls for their own report
     admin      -> the office controls
   Every permission is enforced by the server too; this page only
   decides what to SHOW.
   ============================================================ */

const TIERS = {
  high: {
    label: 'High-value item: enhanced verification',
    note: 'Items in this category are the most often claimed by mistake, so the office applies the strictest checks.',
    requirements: [
      'Valid BPSU ID and one additional government-issued ID',
      'Proof of purchase, warranty card, serial number, or the original box',
      'Photos of you with the item, or the device unlock code / account login',
      'Describe hidden details (contents, scratches, stickers, lock screen) before the item is shown to you',
      'Release is logged and, for very high-value items, may need a parent, guardian, or College Dean to co-sign',
    ],
  },
  medium: {
    label: 'Moderate-value item: standard-plus verification',
    note: 'A short interview plus one supporting proof is normally enough.',
    requirements: [
      'Valid BPSU ID',
      'Describe the contents and any distinguishing marks before the item is shown to you',
      'One supporting proof: a photo of you with the item, a receipt, or a witness',
      'Sign the release logbook at the office',
    ],
  },
  standard: {
    label: 'Low-value item: standard verification',
    note: 'A basic identity check and an accurate description are normally enough.',
    requirements: ['Valid BPSU ID', 'Accurately describe the item before it is shown to you', 'Sign the release logbook at the office'],
  },
};

const OPEN_STATUSES = ['pending_verification', 'lost', 'found'];

// 8:00 AM to 4:30 PM in half-hour steps (the office closes at 5:00 PM).
const TIME_SLOTS = (() => {
  const slots = [];
  for (let minutes = 8 * 60; minutes <= 16 * 60 + 30; minutes += 30) {
    slots.push(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
  }
  return slots;
})();

let current = null; // { item, myClaim, canClaim }

const root = () => document.getElementById('item-root');
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/* ------------------------------------------------------------
   Progress: Reported -> Verified -> Claimed -> Returned
   ------------------------------------------------------------ */
function progressHtml(item) {
  if (item.status === 'closed') {
    return `<div class="note note-muted">${icon('xCircle', 18)}<span>This report has been closed and is no longer active.</span></div>`;
  }
  const rank = { pending_verification: 1, lost: 2, found: 2, claimed: 3, returned: 4 }[item.status] || 1;
  const steps = ['Reported', 'Verified', 'Claimed', 'Returned'];
  return `
    <ol class="progress" aria-label="Report progress">
      ${steps
        .map((label, i) => {
          const n = i + 1;
          const cls = n < rank ? 'done' : n === rank ? 'current' : '';
          return `<li class="${cls}" ${n === rank ? 'aria-current="step"' : ''}><span class="progress-dot">${n < rank || (n === rank && rank === 4) ? icon('check', 14) : n}</span><span class="progress-label">${label}</span></li>`;
        })
        .join('')}
    </ol>`;
}

/* ------------------------------------------------------------
   Left/right: photo and details
   ------------------------------------------------------------ */
function mediaHtml(item) {
  if (item.imageUrl) {
    return `<div class="detail-media"><img src="${escapeHtml(photoUrl(item.imageUrl))}" alt="Photo of ${escapeHtml(item.title)}"></div>`;
  }
  return `<div class="detail-media placeholder" role="img" aria-label="No photo provided">${icon(CATEGORY_ICONS[item.category] || 'box', 64)}<span>No photo provided</span></div>`;
}

function factHtml(iconName, label, value) {
  return `<div class="fact">${icon(iconName, 18)}<div><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div></div>`;
}

function infoHtml(item) {
  const isLost = item.type === 'lost';
  const when = `${escapeHtml(formatDate(item.date))}${item.time ? ` · ${escapeHtml(formatTime12(item.time))}` : ''}`;
  return `
    <div class="badge-row">${itemBadges(item)}</div>
    <h1 class="detail-title">${escapeHtml(item.title)}</h1>
    <p class="detail-ref">Reference <strong>${escapeHtml(item.reference)}</strong> · reported ${escapeHtml(timeAgo(item.createdAt))}</p>

    <dl class="facts">
      ${factHtml('tag', 'Category', escapeHtml(item.category))}
      ${factHtml('pin', isLost ? 'Last seen at' : 'Found at', escapeHtml(item.location))}
      ${factHtml('calendar', isLost ? 'Date lost' : 'Date found', when)}
      ${factHtml('clock', 'Date reported', escapeHtml(formatDate(item.createdAt)))}
      ${factHtml('user', isLost ? 'Reported by (owner)' : 'Turned in by (finder)', escapeHtml(item.reportedByName))}
      ${factHtml('shield', 'Current status', escapeHtml(statusLabel(item.status)))}
    </dl>

    <div class="detail-block">
      <h2>Description</h2>
      <p>${multiline(item.description)}</p>
    </div>
    ${item.additionalDetails ? `<div class="detail-block"><h2>Additional details</h2><p>${multiline(item.additionalDetails)}</p></div>` : ''}
    ${
      item.contactInfo
        ? `<div class="detail-block"><h2>Contact details</h2><p>${icon('mail', 16)} ${escapeHtml(item.contactInfo)}</p></div>`
        : '<p class="detail-locked">' + icon('lock', 15) + ' Contact details are private. They are shared only with the office and people whose claim has been approved.</p>'
    }
    ${progressHtml(item)}
  `;
}

/* ------------------------------------------------------------
   Claim panel (people who may claim the item)
   ------------------------------------------------------------ */
function timeOptionsHtml() {
  return ['<option value="">Select a time</option>'].concat(TIME_SLOTS.map((t) => `<option value="${t}">${escapeHtml(formatTime12(t))}</option>`)).join('');
}

function claimPanelHtml(item) {
  const isFound = item.type === 'found';
  const tier = TIERS[item.verificationTier] || TIERS.standard;
  const question = isFound ? 'Is this item yours?' : 'Did you find this item?';
  const lead = isFound
    ? 'Answering Yes starts the ownership check with the BPSU Lost and Found Office. Nothing is released until you pass the verification in person.'
    : 'If you found the item this person lost, let the office know and hand it in. They will contact the owner.';

  const steps = isFound
    ? `
        <li><strong>Go to the BPSU Lost and Found Office</strong>, handled by the Security Services Office at the Main Gate Security Post, City of Balanga, Bataan. Open Monday to Friday, 8:00 AM to 5:00 PM.</li>
        <li><strong>Bring your reference number</strong> (${escapeHtml(item.reference)}) and the confirmation you will see on this page.</li>
        <li><strong>Bring the required proof</strong> for this item's level:
          <ul class="req-list">${tier.requirements.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
        </li>
        <li><strong>Pass the verification.</strong> The handler asks you to describe the item before showing it, checks your proof, and compares it with this report.</li>
        <li><strong>Sign the release logbook</strong> once verification passes.</li>`
    : `
        <li><strong>Hand the item to the BPSU Lost and Found Office</strong> at the Main Gate Security Post (Mon to Fri, 8:00 AM to 5:00 PM).</li>
        <li><strong>Bring your reference number</strong> (${escapeHtml(item.reference)}) so the office can link it to this report.</li>
        <li><strong>The office contacts the owner</strong> and arranges the verified hand-over.</li>`;

  return `
    <section class="panel claim-panel" aria-labelledby="claim-question">
      <h2 id="claim-question">${escapeHtml(question)}</h2>
      <p class="muted">${escapeHtml(lead)}</p>

      <div class="claim-choice" id="claim-choice">
        <button type="button" class="btn btn-primary" id="claim-yes">Yes</button>
        <button type="button" class="btn btn-outline" id="claim-no">No</button>
      </div>

      <div class="note note-muted" id="claim-no-msg" hidden>
        ${icon('info', 18)}
        <div><p>No problem, nothing has been filed. You can keep browsing, or report something of your own.</p>
        <div class="inline-actions"><a class="btn btn-outline btn-sm" href="browse.html">Back to browse</a>
        <button type="button" class="btn btn-ghost btn-sm" id="claim-reopen">Actually, it is mine</button></div></div>
      </div>

      <div id="claim-flow" hidden>
        ${isFound ? `<div class="tier tier-${escapeHtml(item.verificationTier)}"><strong>${escapeHtml(tier.label)}</strong><p>${escapeHtml(tier.note)}</p></div>
        <p class="disclaimer"><strong>Disclaimer:</strong> the more valuable the item is, the more verification a possible owner must undergo.</p>` : ''}

        <h3>What to do next</h3>
        <ol class="claim-steps">${steps}</ol>

        <h3>${isFound ? 'Set your claiming appointment' : 'Tell us when you will come in'}</h3>
        <p class="muted">Weekdays only, 8:00 AM to 4:30 PM (Philippine time).</p>

        <div class="form-msg" id="claim-msg"></div>
        <form id="claim-form" novalidate>
          <div class="form-row">
            <div class="form-field">
              <label for="appointment-date">Appointment date</label>
              <input type="date" id="appointment-date" name="appointmentDate" min="${todayLocal()}" required>
            </div>
            <div class="form-field">
              <label for="appointment-time">Appointment time</label>
              <select id="appointment-time" name="appointmentTime" required>${timeOptionsHtml()}</select>
            </div>
          </div>
          <div class="form-field">
            <label for="proof-description">${isFound ? 'Your proof of ownership' : 'How and where did you find it?'}</label>
            <textarea id="proof-description" name="proofDescription" required rows="4" maxlength="1000"
              placeholder="${isFound ? 'Describe details only the real owner would know: contents, serial number, scratches, stickers, lock screen. List the documents you will bring.' : 'Tell us where and when you found it and where it is now.'}"></textarea>
            <small class="field-hint">At least 20 characters. The office compares this with the report.</small>
          </div>
          <div class="form-field">
            <label for="claim-contact">Your contact number or email <span class="optional">(optional)</span></label>
            <input type="text" id="claim-contact" name="contactInfo" maxlength="120" placeholder="So the office can reach you if the schedule changes">
          </div>
          <div class="inline-actions">
            <button type="submit" class="btn btn-primary" id="claim-submit">${isFound ? 'Book appointment &amp; file claim' : 'Notify the office'}</button>
            <button type="button" class="btn btn-ghost" id="claim-cancel">Cancel</button>
          </div>
        </form>
      </div>
    </section>`;
}

function wireClaimPanel(item) {
  const yes = document.getElementById('claim-yes');
  if (!yes) return;
  const choice = document.getElementById('claim-choice');
  const flow = document.getElementById('claim-flow');
  const noMsg = document.getElementById('claim-no-msg');
  const form = document.getElementById('claim-form');
  const msg = document.getElementById('claim-msg');

  const show = (which) => {
    choice.hidden = which !== 'choice';
    noMsg.hidden = which !== 'no';
    flow.hidden = which !== 'flow';
    if (which === 'flow') flow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  yes.addEventListener('click', () => show('flow'));
  document.getElementById('claim-no').addEventListener('click', () => show('no'));
  document.getElementById('claim-reopen').addEventListener('click', () => show('flow'));
  document.getElementById('claim-cancel').addEventListener('click', () => show('choice'));

  // Tell people straight away when they pick a weekend.
  const dateInput = document.getElementById('appointment-date');
  dateInput.addEventListener('change', () => {
    const existing = dateInput.parentElement.querySelector('.field-error');
    if (existing) existing.remove();
    if (!dateInput.value) return;
    const day = new Date(`${dateInput.value}T00:00:00`).getDay();
    if (day === 0 || day === 6) showFieldErrors(form, { appointmentDate: 'The office is open on weekdays only (Monday to Friday).' });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldErrors(form);
    setFormMessage(msg, '');

    // Quick checks before bothering the server.
    const problems = {};
    if (!dateInput.value) problems.appointmentDate = 'Please choose a date.';
    if (!document.getElementById('appointment-time').value) problems.appointmentTime = 'Please choose a time.';
    if (document.getElementById('proof-description').value.trim().length < 20) problems.proofDescription = 'Please write at least 20 characters.';
    if (Object.keys(problems).length) {
      showFieldErrors(form, problems);
      return;
    }

    const btn = document.getElementById('claim-submit');
    setLoading(btn, true, 'Submitting…');
    try {
      const data = await apiRequest('/claims', {
        method: 'POST',
        auth: true,
        body: {
          itemId: item.id,
          appointmentDate: dateInput.value,
          appointmentTime: document.getElementById('appointment-time').value,
          proofDescription: document.getElementById('proof-description').value.trim(),
          contactInfo: document.getElementById('claim-contact').value.trim(),
        },
      });
      toast('Claim submitted. The office will review it.');
      current.myClaim = data.claim;
      current.canClaim = false;
      renderActionZone();
    } catch (err) {
      setLoading(btn, false);
      const orphan = showFieldErrors(form, err.fields);
      setFormMessage(msg, orphan[0] || err.message, 'error');
    }
  });
}

/* ------------------------------------------------------------
   "Your claim" card
   ------------------------------------------------------------ */
function claimStatusHelp(claim) {
  const map = {
    pending: 'The office has not reviewed your claim yet. Come on your appointment day with your reference number.',
    approved: 'Your claim is approved. Bring your reference number and the proof you described to the office to collect it.',
    rejected: 'The office could not verify this claim. See the notes below or visit the office for details.',
    completed: 'The item has been handed over. Thank you for using ReQuora!',
    cancelled: 'You cancelled this claim.',
  };
  return map[claim.status] || '';
}

function myClaimHtml(claim) {
  const tier = TIERS[claim.verificationTier] || TIERS.standard;
  return `
    <section class="panel" aria-labelledby="my-claim-title">
      <div class="panel-head">
        <h2 id="my-claim-title">Your claim</h2>
        ${claimBadge(claim.status)}
      </div>
      <p class="muted">${escapeHtml(claimStatusHelp(claim))}</p>
      <dl class="detail-list">
        <dt>Claim reference</dt><dd>${escapeHtml(claim.reference)}</dd>
        <dt>Item reference</dt><dd>${escapeHtml(claim.itemReference)}</dd>
        <dt>Appointment</dt><dd>${escapeHtml(formatDate(claim.appointmentDate))} at ${escapeHtml(formatTime12(claim.appointmentTime))}</dd>
        <dt>Where</dt><dd>BPSU Lost and Found Office, Security Services Office, Main Gate Security Post</dd>
        ${claim.claimType === 'ownership' ? `<dt>Verification level</dt><dd>${escapeHtml(tier.label)}</dd>` : ''}
        ${claim.officeNotes ? `<dt>Office notes</dt><dd>${escapeHtml(claim.officeNotes)}</dd>` : ''}
      </dl>
      ${claim.status === 'pending' ? `<div class="inline-actions"><button type="button" class="btn btn-outline btn-sm" id="cancel-claim">${icon('x', 15)} Cancel my claim</button></div>` : ''}
    </section>`;
}

function wireMyClaim(claim) {
  const btn = document.getElementById('cancel-claim');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const yes = await confirmDialog({
      title: 'Cancel your claim?',
      message: 'The office will no longer expect you on your appointment day. You can file a new claim later if the item is still available.',
      confirmText: 'Cancel claim',
      cancelText: 'Keep claim',
      danger: true,
    });
    if (!yes) return;
    setLoading(btn, true, 'Cancelling…');
    try {
      await apiRequest(`/claims/${claim.id}/cancel`, { method: 'PUT', auth: true });
      toast('Your claim was cancelled.', 'info');
      await reload();
    } catch (err) {
      setLoading(btn, false);
      toast(err.message, 'error');
    }
  });
}

/* ------------------------------------------------------------
   Reporter + admin panels
   ------------------------------------------------------------ */
function claimRecordHtml(c, admin) {
  return `
    <div class="record">
      <div class="record-top"><strong>${escapeHtml(c.claimantName)}</strong>${claimBadge(c.status)}</div>
      <p class="muted">${escapeHtml(c.reference)} · appointment ${escapeHtml(formatDate(c.appointmentDate))} at ${escapeHtml(formatTime12(c.appointmentTime))}</p>
      ${admin ? `<p class="record-proof">${escapeHtml(c.proofDescription)}</p><p class="muted">${icon('mail', 14)} ${escapeHtml(c.contactInfo || c.claimantEmail || '—')}</p>` : ''}
    </div>`;
}

async function loadClaimsInto(boxId, admin) {
  const box = document.getElementById(boxId);
  if (!box) return;
  try {
    const data = await apiRequest(`/claims/item/${current.item.id}`, { auth: true });
    box.innerHTML = data.claims.length
      ? data.claims.map((c) => claimRecordHtml(c, admin)).join('')
      : '<p class="muted">No one has claimed this item yet.</p>';
    if (admin && data.claims.some((c) => c.status === 'pending' || c.status === 'approved')) {
      box.insertAdjacentHTML('beforeend', '<a class="btn btn-outline btn-sm" href="admin.html#claims">Review claims in the admin dashboard</a>');
    }
  } catch (err) {
    box.innerHTML = `<p class="muted">${escapeHtml(err.message)}</p>`;
  }
}

function ownerPanelHtml(item) {
  const open = OPEN_STATUSES.includes(item.status);
  return `
    <section class="panel" aria-labelledby="owner-title">
      <h2 id="owner-title">Manage your report</h2>
      <p class="muted">${
        open
          ? 'You filed this report, so you cannot claim it. You can update the details, close it once it is resolved, or delete it.'
          : 'This report is being processed by the office, so it can no longer be edited. Contact the Lost and Found Office for changes.'
      }</p>
      <div class="inline-actions">
        ${open ? `<button type="button" class="btn btn-primary btn-sm" id="edit-report">${icon('edit', 15)} Edit report</button>
        <button type="button" class="btn btn-outline btn-sm" id="close-report">${icon('xCircle', 15)} Close report</button>
        <button type="button" class="btn btn-danger-outline btn-sm" id="delete-report">${icon('trash', 15)} Delete</button>` : ''}
      </div>
      <h3>Claims on this item</h3>
      <div id="item-claims"><p class="muted">Loading claims…</p></div>
    </section>`;
}

function adminPanelHtml(item) {
  const statuses = ['pending_verification', item.type, 'claimed', 'returned', 'closed'];
  return `
    <section class="panel panel-admin" aria-labelledby="admin-title">
      <div class="panel-head"><h2 id="admin-title">Office controls</h2><span class="badge badge-pending">${icon('shield', 13)}<span>Admin</span></span></div>
      <p class="muted">Reporter: ${escapeHtml(item.reportedByName)}. Changes here are recorded for everyone.</p>
      <div class="inline-actions">
        ${item.status === 'pending_verification' ? `<button type="button" class="btn btn-gold btn-sm" id="verify-report">${icon('shield', 15)} Verify report</button>` : ''}
        <button type="button" class="btn btn-outline btn-sm" id="edit-report">${icon('edit', 15)} Edit details</button>
        <button type="button" class="btn btn-danger-outline btn-sm" id="delete-report">${icon('trash', 15)} Delete report</button>
      </div>
      <div class="form-field">
        <label for="status-select">Change status</label>
        <div class="inline-actions">
          <select id="status-select">${statuses.map((s) => `<option value="${s}" ${item.status === s ? 'selected' : ''}>${escapeHtml(statusLabel(s))}</option>`).join('')}</select>
          <button type="button" class="btn btn-primary btn-sm" id="save-status">Update status</button>
        </div>
      </div>
      <h3>Claims on this item</h3>
      <div id="item-claims"><p class="muted">Loading claims…</p></div>
    </section>`;
}

/* ---------- Edit dialog (reporter or admin) ---------- */
async function openEditDialog(item) {
  const meta = await loadMeta();
  const cats = (meta.categories || FALLBACK_CATEGORIES)
    .map((c) => `<option value="${escapeHtml(c)}" ${c === item.category ? 'selected' : ''}>${escapeHtml(c)}</option>`)
    .join('');

  const body = `
    <form id="edit-form" novalidate>
      <div class="form-msg" id="edit-msg"></div>
      <div class="form-field"><label for="e-title">Item name</label><input id="e-title" name="title" maxlength="100" value="${escapeHtml(item.title)}" required></div>
      <div class="form-field"><label for="e-category">Category</label><select id="e-category" name="category">${cats}</select></div>
      <div class="form-field"><label for="e-description">Description</label><textarea id="e-description" name="description" rows="4" maxlength="1000" required>${escapeHtml(item.description)}</textarea></div>
      <div class="form-field"><label for="e-location">Location</label><input id="e-location" name="location" maxlength="150" value="${escapeHtml(item.location)}" required></div>
      <div class="form-row">
        <div class="form-field"><label for="e-date">Date</label><input type="date" id="e-date" name="date" max="${todayLocal()}" value="${escapeHtml(item.date)}" required></div>
        <div class="form-field"><label for="e-time">Time <span class="optional">(optional)</span></label><input type="time" id="e-time" name="time" value="${escapeHtml(item.time || '')}"></div>
      </div>
      <div class="form-field"><label for="e-additionalDetails">Additional details <span class="optional">(optional)</span></label><textarea id="e-additionalDetails" name="additionalDetails" rows="2" maxlength="500">${escapeHtml(item.additionalDetails || '')}</textarea></div>
      <div class="form-field"><label for="e-contactInfo">Contact info <span class="optional">(optional)</span></label><input id="e-contactInfo" name="contactInfo" maxlength="120" value="${escapeHtml(item.contactInfo || '')}"></div>
      <div class="modal-actions inline">
        <button type="button" class="btn btn-ghost" data-edit-cancel>Cancel</button>
        <button type="submit" class="btn btn-primary" id="edit-save">Save changes</button>
      </div>
    </form>`;

  const result = await openDialog({
    title: 'Edit report',
    size: 'lg',
    bodyHtml: body,
    focus: '#e-title',
    onOpen(panel, finish) {
      const form = panel.querySelector('#edit-form');
      panel.querySelector('[data-edit-cancel]').addEventListener('click', () => finish({ action: null, data: {} }));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearFieldErrors(form);
        const msg = panel.querySelector('#edit-msg');
        setFormMessage(msg, '');
        const payload = Object.fromEntries(new FormData(form).entries());
        const btn = panel.querySelector('#edit-save');
        setLoading(btn, true, 'Saving…');
        try {
          const data = await apiRequest(`/items/${item.id}`, { method: 'PUT', auth: true, body: payload });
          finish({ action: 'saved', data: { item: data.item } });
        } catch (err) {
          setLoading(btn, false);
          const orphan = showFieldErrors(form, err.fields);
          setFormMessage(msg, orphan[0] || err.message, 'error');
        }
      });
    },
  });
  return result.action === 'saved';
}

function wireManagePanels(item, isAdmin) {
  const byId = (id) => document.getElementById(id);

  const edit = byId('edit-report');
  if (edit) {
    edit.addEventListener('click', async () => {
      if (await openEditDialog(item)) {
        toast('Report updated.');
        await reload();
      }
    });
  }

  const close = byId('close-report');
  if (close) {
    close.addEventListener('click', async () => {
      const yes = await confirmDialog({
        title: 'Close this report?',
        message: 'Use this when the item is sorted out or you no longer need the report. It will leave the public feed.',
        confirmText: 'Close report',
      });
      if (!yes) return;
      try {
        await apiRequest(`/items/${item.id}`, { method: 'PUT', auth: true, body: { status: 'closed' } });
        toast('Report closed.', 'info');
        await reload();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  const del = byId('delete-report');
  if (del) {
    del.addEventListener('click', async () => {
      const yes = await confirmDialog({
        title: 'Delete this report?',
        message: 'This permanently removes the report, its photo and any claims on it. This cannot be undone.',
        confirmText: 'Delete report',
        danger: true,
      });
      if (!yes) return;
      try {
        await apiRequest(`/items/${item.id}`, { method: 'DELETE', auth: true });
        flash('The report was deleted.', 'success');
        window.location.href = isAdmin ? 'admin.html#reports' : 'dashboard.html';
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  const verify = byId('verify-report');
  if (verify) {
    verify.addEventListener('click', async () => {
      setLoading(verify, true, 'Verifying…');
      try {
        await apiRequest(`/admin/items/${item.id}/verify`, { method: 'POST', auth: true });
        toast('Report verified.');
        await reload();
      } catch (err) {
        setLoading(verify, false);
        toast(err.message, 'error');
      }
    });
  }

  const save = byId('save-status');
  if (save) {
    save.addEventListener('click', async () => {
      const status = byId('status-select').value;
      if (status === item.status) {
        toast('That is already the current status.', 'info');
        return;
      }
      if (['closed', 'returned'].includes(status)) {
        const yes = await confirmDialog({
          title: `Mark as ${statusLabel(status)}?`,
          message: status === 'returned' ? 'Approved claims will be marked completed and other open claims rejected.' : 'Open claims on this report will be rejected.',
          confirmText: `Mark ${statusLabel(status)}`,
        });
        if (!yes) return;
      }
      setLoading(save, true, 'Saving…');
      try {
        await apiRequest(`/admin/items/${item.id}/status`, { method: 'PUT', auth: true, body: { status } });
        toast('Status updated.');
        await reload();
      } catch (err) {
        setLoading(save, false);
        toast(err.message, 'error');
      }
    });
  }
}

/* ------------------------------------------------------------
   Render
   ------------------------------------------------------------ */
function renderActionZone() {
  const zone = document.getElementById('action-zone');
  const { item, myClaim, canClaim } = current;
  const user = getCurrentUser();
  const isAdmin = !!user && user.role === 'admin';

  let html;
  if (isAdmin) html = adminPanelHtml(item);
  else if (item.isOwner) html = ownerPanelHtml(item);
  else if (myClaim && myClaim.status !== 'cancelled') html = myClaimHtml(myClaim);
  else if (!user) {
    const isFound = item.type === 'found';
    html = `
      <section class="panel">
        <h2>${isFound ? 'Is this item yours?' : 'Did you find this item?'}</h2>
        <p class="muted">Log in with your BPSU account to ${isFound ? 'start a claim and book a collection appointment' : 'let the office know'}.</p>
        <div class="inline-actions"><a class="btn btn-primary" href="login.html?next=${encodeURIComponent(itemUrl(item.id))}">Log in to continue</a>
        <a class="btn btn-outline" href="register.html">Create an account</a></div>
      </section>`;
  } else if (canClaim) html = claimPanelHtml(item);
  else {
    html = `<section class="panel"><div class="note note-muted">${icon('info', 18)}<span>This item can no longer be claimed because it is ${escapeHtml(statusLabel(item.status).toLowerCase())}.</span></div></section>`;
  }

  zone.innerHTML = html;
  if (isAdmin) {
    wireManagePanels(item, true);
    loadClaimsInto('item-claims', true);
  } else if (item.isOwner) {
    wireManagePanels(item, false);
    loadClaimsInto('item-claims', false);
  } else if (myClaim && myClaim.status !== 'cancelled') {
    wireMyClaim(myClaim);
  } else if (canClaim) {
    wireClaimPanel(item);
  }
}

function renderItem() {
  const { item } = current;
  document.title = `${item.title} — ReQuora`;
  root().setAttribute('aria-busy', 'false');
  root().innerHTML = `
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="index.html">Home</a>${icon('chevronRight', 14)}<a href="browse.html">Browse</a>${icon('chevronRight', 14)}<span aria-current="page">${escapeHtml(item.title)}</span>
    </nav>
    <div class="detail-grid">
      ${mediaHtml(item)}
      <div class="detail-info card">${infoHtml(item)}</div>
    </div>
    <div class="detail-actions" id="action-zone"></div>`;
  renderActionZone();
}

async function reload() {
  const id = current && current.item ? current.item.id : null;
  if (!id) return;
  const data = await apiRequest(`/items/${encodeURIComponent(id)}`, { auth: !!getToken() });
  current = data;
  renderItem();
}

document.addEventListener('DOMContentLoaded', async () => {
  initLayout();

  const params = new URLSearchParams(window.location.search);
  let id = params.get('id');

  // Fallback for servers that redirect item.html?id=x to /item and drop the query.
  if (!id) {
    try {
      id = sessionStorage.getItem('requora_last_item_id');
    } catch (e) {
      id = null;
    }
    if (id) window.history.replaceState(null, '', `${window.location.pathname}?id=${encodeURIComponent(id)}`);
  }

  const container = root();
  if (!id) {
    container.setAttribute('aria-busy', 'false');
    container.innerHTML = stateBlock({
      iconName: 'search',
      title: 'No item selected',
      text: 'Open a report from the browse page to see its details.',
      actionHtml: '<a class="btn btn-primary btn-sm" href="browse.html">Browse reports</a>',
    });
    return;
  }

  try {
    current = await apiRequest(`/items/${encodeURIComponent(id)}`, { auth: !!getToken() });
    renderItem();
  } catch (err) {
    container.setAttribute('aria-busy', 'false');
    container.innerHTML = errorState(err, { retryId: 'retry-item' });
    const retry = document.getElementById('retry-item');
    if (retry) retry.addEventListener('click', () => window.location.reload());
  }
});
