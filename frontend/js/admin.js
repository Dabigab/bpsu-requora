/* ReQuora — admin dashboard (overview, reports, claims, users)
   The server enforces admin access on every request; this page just
   shows the right things to the right person. */

const ATABS = ['overview', 'reports', 'claims', 'users'];
const ADMIN_STATUSES = ['pending_verification', 'lost', 'found', 'claimed', 'returned', 'closed'];

// Chart colours, checked with the dataviz validator (light surface).
const CHART_LOST = '#2a5db0';
const CHART_FOUND = '#b87400';

const q = (id) => document.getElementById(id);
const loadedTabs = {};
let reportFilters = { q: '', type: '', status: '', category: '', page: 1 };
let claimFilter = '';

/* ============================================================
   Overview
   ============================================================ */
function statTile(iconName, label, value, tone, href) {
  const inner = `<span class="stat-card-icon">${icon(iconName, 22)}</span>
    <div><div class="stat-card-value">${value}</div><div class="stat-card-label">${escapeHtml(label)}</div></div>`;
  return href
    ? `<a class="stat-card ${tone}" href="${href}">${inner}</a>`
    : `<div class="stat-card ${tone}">${inner}</div>`;
}

/* ---- Charts (inline SVG, no library) ---- */
function niceMax(n) {
  if (n <= 4) return 4;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  const step = [1, 2, 5, 10].find((m) => m * pow >= n) * pow;
  return step;
}

function shortDay(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function perDayChartHtml(days) {
  const W = 640;
  const H = 240;
  const pad = { l: 34, r: 8, t: 12, b: 28 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const maxVal = niceMax(Math.max(1, ...days.map((d) => d.lost + d.found)));
  const slot = iw / days.length;
  const barW = Math.min(26, slot * 0.62);
  const y = (v) => pad.t + ih - (v / maxVal) * ih;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxVal * f));
  const grid = [...new Set(ticks)]
    .map((t) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}" class="chart-grid"/><text x="${pad.l - 6}" y="${y(t) + 4}" text-anchor="end" class="chart-axis">${t}</text>`)
    .join('');

  const bars = days
    .map((d, i) => {
      const x = pad.l + slot * i + (slot - barW) / 2;
      const hLost = (d.lost / maxVal) * ih;
      const hFound = (d.found / maxVal) * ih;
      const gap = d.lost && d.found ? 2 : 0;
      const label = i % 2 === 0 || days.length < 8 ? `<text x="${x + barW / 2}" y="${H - 8}" text-anchor="middle" class="chart-axis">${escapeHtml(shortDay(d.date))}</text>` : '';
      return `
        <g class="chart-col" tabindex="0" data-tip="${escapeHtml(`${formatDate(d.date)}: ${d.lost} lost, ${d.found} found`)}" role="img" aria-label="${escapeHtml(`${formatDate(d.date)}: ${d.lost} lost, ${d.found} found`)}">
          <rect x="${pad.l + slot * i}" y="${pad.t}" width="${slot}" height="${ih}" class="chart-hit"/>
          ${d.lost ? `<rect x="${x}" y="${y(0) - hLost}" width="${barW}" height="${hLost}" rx="3" fill="${CHART_LOST}"/>` : ''}
          ${d.found ? `<rect x="${x}" y="${y(0) - hLost - gap - hFound}" width="${barW}" height="${hFound}" rx="3" fill="${CHART_FOUND}"/>` : ''}
          ${label}
        </g>`;
    })
    .join('');

  const rows = days.map((d) => `<tr><td>${escapeHtml(formatDate(d.date))}</td><td>${d.lost}</td><td>${d.found}</td></tr>`).join('');
  return `
    <div class="chart-card">
      <div class="chart-head">
        <h3>Reports per day <small>last 14 days</small></h3>
        <ul class="chart-legend" aria-label="Legend">
          <li><span class="swatch" style="background:${CHART_LOST}"></span>Lost</li>
          <li><span class="swatch" style="background:${CHART_FOUND}"></span>Found</li>
        </ul>
      </div>
      <div class="chart-wrap">
        <svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="group" aria-label="Stacked bar chart of lost and found reports per day">${grid}${bars}</svg>
        <div class="chart-tip" hidden></div>
      </div>
      <details class="chart-table"><summary>View as table</summary>
        <table class="table-lite"><thead><tr><th>Date</th><th>Lost</th><th>Found</th></tr></thead><tbody>${rows}</tbody></table>
      </details>
    </div>`;
}

function barListHtml(title, rows, color) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const total = rows.reduce((s, r) => s + r.count, 0);
  const body = rows.length
    ? rows
        .map(
          (r) => `
        <li class="hbar" data-tip="${escapeHtml(`${r.label}: ${r.count}`)}" tabindex="0">
          <span class="hbar-label">${escapeHtml(r.label)}</span>
          <span class="hbar-track"><span class="hbar-fill" style="width:${Math.max(2, (r.count / max) * 100)}%;background:${color}"></span></span>
          <span class="hbar-value">${r.count}</span>
        </li>`
        )
        .join('')
    : '<li class="muted">No data yet.</li>';
  return `
    <div class="chart-card">
      <div class="chart-head"><h3>${escapeHtml(title)} <small>${total} total</small></h3></div>
      <ul class="hbar-list">${body}</ul>
    </div>`;
}

function wireChartTips(root) {
  root.querySelectorAll('.chart-wrap').forEach((wrap) => {
    const tip = wrap.querySelector('.chart-tip');
    const show = (target, evt) => {
      tip.textContent = target.dataset.tip;
      tip.hidden = false;
      const box = wrap.getBoundingClientRect();
      const t = target.getBoundingClientRect();
      const x = evt ? evt.clientX - box.left : t.left - box.left + t.width / 2;
      tip.style.left = `${Math.min(Math.max(x, 70), box.width - 70)}px`;
      tip.style.top = `${t.top - box.top - 8}px`;
    };
    wrap.querySelectorAll('.chart-col').forEach((col) => {
      col.addEventListener('mousemove', (e) => show(col, e));
      col.addEventListener('focus', () => show(col));
      col.addEventListener('mouseleave', () => (tip.hidden = true));
      col.addEventListener('blur', () => (tip.hidden = true));
    });
  });
}

function recentReportsHtml(items) {
  if (!items.length) return '<p class="muted">No reports yet.</p>';
  return `<ul class="mini-list">${items
    .map(
      (i) => `<li><a href="${escapeHtml(itemUrl(i.id))}" data-item-id="${escapeHtml(i.id)}">${escapeHtml(i.title)}</a>
        <span>${itemBadges(i)}</span><small>${escapeHtml(timeAgo(i.createdAt))}</small></li>`
    )
    .join('')}</ul>`;
}

function recentClaimsHtml(claims) {
  if (!claims.length) return '<p class="muted">No claims yet.</p>';
  return `<ul class="mini-list">${claims
    .map(
      (c) => `<li><a href="${escapeHtml(itemUrl(c.itemId))}" data-item-id="${escapeHtml(c.itemId)}">${escapeHtml(c.itemTitle)}</a>
        <span>${claimBadge(c.status)}</span><small>${escapeHtml(c.claimantName)} · ${escapeHtml(timeAgo(c.createdAt))}</small></li>`
    )
    .join('')}</ul>`;
}

async function loadOverview() {
  const panel = q('apanel-overview');
  panel.innerHTML = `<div class="stat-cards">${'<div class="stat-card skeleton-block" aria-hidden="true"></div>'.repeat(6)}</div>`;
  try {
    const { stats, recentReports, recentClaims } = await apiRequest('/admin/stats', { auth: true });
    setClaimsPill(stats.pendingClaims);
    const byStatus = ADMIN_STATUSES.map((s) => ({ label: statusLabel(s), count: stats.byStatus[s] || 0 }));
    const byCategory = stats.byCategory.map((c) => ({ label: c.category, count: c.count }));

    panel.innerHTML = `
      <div class="stat-cards stat-cards-6">
        ${statTile('file', 'Total Reports', stats.totalReports, '', '#reports')}
        ${statTile('search', 'Lost Items', stats.lost, 'tone-lost')}
        ${statTile('check', 'Found Items', stats.found, 'tone-found')}
        ${statTile('shield', 'Pending Claims', stats.pendingClaims, 'tone-claim', '#claims')}
        ${statTile('award', 'Returned Items', stats.returned, 'tone-returned')}
        ${statTile('users', 'Users', stats.users, '', '#users')}
      </div>
      ${
        stats.pendingVerification
          ? `<div class="note note-gold">${icon('alert', 18)}<span><strong>${stats.pendingVerification}</strong> report${stats.pendingVerification === 1 ? ' is' : 's are'} waiting for verification. <a href="#reports" data-go-pending>Review them</a></span></div>`
          : ''
      }
      <div class="chart-grid-2">
        ${perDayChartHtml(stats.reportsPerDay)}
        <div class="chart-stack">
          ${barListHtml('Reports by status', byStatus, '#7d1a2f')}
          ${barListHtml('Reports by category', byCategory, '#7d1a2f')}
        </div>
      </div>
      <div class="two-col">
        <section class="panel"><div class="panel-head"><h2>Recent reports</h2><a href="#reports" class="link-sm">View all</a></div>${recentReportsHtml(recentReports)}</section>
        <section class="panel"><div class="panel-head"><h2>Recent claims</h2><a href="#claims" class="link-sm">View all</a></div>${recentClaimsHtml(recentClaims)}</section>
      </div>`;
    wireChartTips(panel);
    panel.querySelectorAll('.hbar').forEach((row) => row.setAttribute('title', row.dataset.tip));
    const pendingLink = panel.querySelector('[data-go-pending]');
    if (pendingLink) {
      pendingLink.addEventListener('click', () => {
        reportFilters = { q: '', type: '', status: 'pending_verification', category: '', page: 1 };
        loadedTabs.reports = false;
      });
    }
  } catch (err) {
    panel.innerHTML = errorState(err, { retryId: 'retry-overview' });
    const retry = q('retry-overview');
    if (retry) retry.addEventListener('click', loadOverview);
  }
}

function setClaimsPill(n) {
  const pill = q('claims-pill');
  pill.textContent = n;
  pill.hidden = !n;
}

/* ============================================================
   Reports
   ============================================================ */
function reportsToolbarHtml(categories) {
  const opt = (v, label, cur) => `<option value="${escapeHtml(v)}" ${cur === v ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  return `
    <form class="filters admin-filters" id="rep-filters" role="search" aria-label="Filter reports">
      <div class="form-field grow"><label for="rf-q">Search</label><input type="search" id="rf-q" placeholder="Title, description, location or reference" value="${escapeHtml(reportFilters.q)}"></div>
      <div class="form-field"><label for="rf-type">Type</label><select id="rf-type">${opt('', 'All types', reportFilters.type)}${opt('lost', 'Lost', reportFilters.type)}${opt('found', 'Found', reportFilters.type)}</select></div>
      <div class="form-field"><label for="rf-status">Status</label><select id="rf-status">${opt('', 'All statuses', reportFilters.status)}${ADMIN_STATUSES.map((s) => opt(s, statusLabel(s), reportFilters.status)).join('')}</select></div>
      <div class="form-field"><label for="rf-category">Category</label><select id="rf-category">${opt('', 'All categories', reportFilters.category)}${categories.map((c) => opt(c, c, reportFilters.category)).join('')}</select></div>
      <button type="button" class="btn btn-ghost btn-sm" id="rf-clear">Clear</button>
    </form>`;
}

function reportRow(i) {
  const open = i.status === 'pending_verification';
  return `
    <tr>
      <td data-label="Item"><a class="strong-link" href="${escapeHtml(itemUrl(i.id))}" data-item-id="${escapeHtml(i.id)}">${escapeHtml(i.title)}</a><small class="cell-sub">${escapeHtml(i.reference)} · ${escapeHtml(i.category)}</small></td>
      <td data-label="Type">${typeBadge(i.type)}</td>
      <td data-label="Status">${statusBadge(i.status)}</td>
      <td data-label="Reported by">${escapeHtml(i.reportedByName)}<small class="cell-sub">${escapeHtml(i.reporterEmail || '')}</small></td>
      <td data-label="Claims">${i.claimsCount}${i.pendingClaims ? ` <span class="badge badge-pending">${i.pendingClaims} pending</span>` : ''}</td>
      <td data-label="Reported">${escapeHtml(formatDate(i.createdAt))}</td>
      <td data-label="Actions" class="actions-cell">
        <a class="btn btn-outline btn-sm" href="${escapeHtml(itemUrl(i.id))}" data-item-id="${escapeHtml(i.id)}">View</a>
        ${open ? `<button type="button" class="btn btn-gold btn-sm" data-verify="${escapeHtml(i.id)}">Verify</button>` : ''}
        <button type="button" class="btn btn-ghost btn-sm" data-status="${escapeHtml(i.id)}" data-current="${escapeHtml(i.status)}" data-title="${escapeHtml(i.title)}" data-type="${escapeHtml(i.type)}">Status</button>
        ${i.claimsCount ? `<button type="button" class="btn btn-ghost btn-sm" data-review-item="${escapeHtml(i.id)}">Claims</button>` : ''}
        <button type="button" class="btn btn-danger-outline btn-sm" data-delete="${escapeHtml(i.id)}" data-title="${escapeHtml(i.title)}" aria-label="Delete ${escapeHtml(i.title)}">${icon('trash', 15)}</button>
      </td>
    </tr>`;
}

async function loadReports() {
  const panel = q('apanel-reports');
  const meta = await loadMeta();
  const categories = meta.categories || FALLBACK_CATEGORIES;

  if (!q('rep-filters')) {
    panel.innerHTML = `${reportsToolbarHtml(categories)}<p class="results-count" id="rep-count" aria-live="polite"></p><div id="rep-table"></div><div id="rep-pagination"></div>`;
    wireReportFilters();
  }
  const table = q('rep-table');
  table.setAttribute('aria-busy', 'true');
  table.innerHTML = '<div class="state"><span class="spinner dark" aria-hidden="true"></span><p>Loading reports…</p></div>';
  try {
    const query = { page: reportFilters.page, limit: 15 };
    ['q', 'type', 'status', 'category'].forEach((k) => {
      if (reportFilters[k]) query[k] = reportFilters[k];
    });
    const data = await apiRequest('/admin/items', { auth: true, query });
    reportFilters.page = data.pagination.page;
    q('rep-count').textContent = `${data.pagination.total} report${data.pagination.total === 1 ? '' : 's'}`;
    if (!data.items.length) {
      table.innerHTML = stateBlock({ iconName: 'search', title: 'No reports match', text: 'Try changing your search or filters.' });
      renderPagination(q('rep-pagination'), null);
      return;
    }
    table.innerHTML = `<div class="table-wrap"><table class="data-table responsive">
      <thead><tr><th>Item</th><th>Type</th><th>Status</th><th>Reported by</th><th>Claims</th><th>Reported</th><th><span class="sr-only">Actions</span></th></tr></thead>
      <tbody>${data.items.map(reportRow).join('')}</tbody></table></div>`;
    renderPagination(q('rep-pagination'), data.pagination, (n) => {
      reportFilters.page = n;
      loadReports();
    });
    wireReportRows(table);
  } catch (err) {
    table.innerHTML = errorState(err, { retryId: 'retry-reports' });
    const retry = q('retry-reports');
    if (retry) retry.addEventListener('click', loadReports);
  } finally {
    table.setAttribute('aria-busy', 'false');
  }
}

function wireReportFilters() {
  const apply = () => {
    reportFilters = {
      q: q('rf-q').value.trim(),
      type: q('rf-type').value,
      status: q('rf-status').value,
      category: q('rf-category').value,
      page: 1,
    };
    loadReports();
  };
  q('rep-filters').addEventListener('submit', (e) => e.preventDefault());
  q('rf-q').addEventListener('input', debounce(apply, 350));
  ['rf-type', 'rf-status', 'rf-category'].forEach((id) => q(id).addEventListener('change', apply));
  q('rf-clear').addEventListener('click', () => {
    q('rf-q').value = '';
    ['rf-type', 'rf-status', 'rf-category'].forEach((id) => (q(id).value = ''));
    apply();
  });
}

function wireReportRows(table) {
  table.querySelectorAll('[data-verify]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      setLoading(btn, true, 'Verifying…');
      try {
        await apiRequest(`/admin/items/${btn.dataset.verify}/verify`, { method: 'POST', auth: true });
        toast('Report verified.');
        refreshAdmin();
      } catch (err) {
        setLoading(btn, false);
        toast(err.message, 'error');
      }
    })
  );

  table.querySelectorAll('[data-delete]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const yes = await confirmDialog({
        title: 'Delete this report?',
        message: `“${btn.dataset.title}” and all claims on it will be permanently removed. This cannot be undone.`,
        confirmText: 'Delete report',
        danger: true,
      });
      if (!yes) return;
      try {
        await apiRequest(`/admin/items/${btn.dataset.delete}`, { method: 'DELETE', auth: true });
        toast('Report deleted.');
        refreshAdmin();
      } catch (err) {
        toast(err.message, 'error');
      }
    })
  );

  table.querySelectorAll('[data-status]').forEach((btn) => btn.addEventListener('click', () => openStatusDialog(btn.dataset)));

  table.querySelectorAll('[data-review-item]').forEach((btn) =>
    btn.addEventListener('click', () => {
      claimFilter = '';
      loadedTabs.claims = false;
      claimItemFilter = btn.dataset.reviewItem;
      selectTab('claims');
    })
  );
}

async function openStatusDialog({ status: id, current, title, type }) {
  const options = ['pending_verification', type, 'claimed', 'returned', 'closed'];
  const result = await openDialog({
    title: 'Update status',
    bodyHtml: `
      <p class="muted">${escapeHtml(title)}</p>
      <div class="form-field"><label for="new-status">New status</label>
        <select id="new-status">${options.map((s) => `<option value="${s}" ${s === current ? 'selected' : ''}>${escapeHtml(statusLabel(s))}</option>`).join('')}</select></div>
      <p class="field-hint">Returned completes an approved claim and rejects other open claims. Closed rejects all open claims.</p>`,
    actions: [
      { label: 'Cancel', value: 'cancel', variant: 'ghost' },
      { label: 'Update status', value: 'save', variant: 'primary' },
    ],
    focus: '#new-status',
    collect: (panel) => ({ status: panel.querySelector('#new-status').value }),
  });
  if (result.action !== 'save' || result.data.status === current) return;
  try {
    await apiRequest(`/admin/items/${id}/status`, { method: 'PUT', auth: true, body: { status: result.data.status } });
    toast(`Status changed to ${statusLabel(result.data.status)}.`);
    refreshAdmin();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ============================================================
   Claims
   ============================================================ */
let claimItemFilter = '';
let allClaims = [];

function claimRow(c) {
  return `
    <tr>
      <td data-label="Item"><a class="strong-link" href="${escapeHtml(itemUrl(c.itemId))}" data-item-id="${escapeHtml(c.itemId)}">${escapeHtml(c.itemTitle)}</a><small class="cell-sub">${escapeHtml(c.reference)}</small></td>
      <td data-label="Claimant">${escapeHtml(c.claimantName)}<small class="cell-sub">${escapeHtml(c.claimantEmail || '')}</small></td>
      <td data-label="Type">${c.claimType === 'ownership' ? 'Ownership' : 'Finder report'}</td>
      <td data-label="Appointment">${escapeHtml(formatDate(c.appointmentDate))}<small class="cell-sub">${escapeHtml(formatTime12(c.appointmentTime))}</small></td>
      <td data-label="Status">${claimBadge(c.status)}</td>
      <td data-label="Actions" class="actions-cell"><button type="button" class="btn btn-outline btn-sm" data-review="${escapeHtml(c.id)}">${c.status === 'pending' || c.status === 'approved' ? 'Review' : 'View'}</button></td>
    </tr>`;
}

async function loadClaims() {
  const panel = q('apanel-claims');
  if (!q('claim-filter')) {
    panel.innerHTML = `
      <form class="filters admin-filters" id="claim-filters" aria-label="Filter claims">
        <div class="form-field"><label for="claim-filter">Status</label>
          <select id="claim-filter">
            <option value="">All claims</option>
            ${['pending', 'approved', 'rejected', 'completed', 'cancelled'].map((s) => `<option value="${s}">${escapeHtml(claimStatusLabel(s))}</option>`).join('')}
          </select></div>
        <div id="claim-item-chip"></div>
      </form>
      <p class="results-count" id="claim-count" aria-live="polite"></p>
      <div id="claim-table"></div>`;
    q('claim-filters').addEventListener('submit', (e) => e.preventDefault());
    q('claim-filter').addEventListener('change', () => {
      claimFilter = q('claim-filter').value;
      loadClaims();
    });
  }
  q('claim-filter').value = claimFilter;

  const chip = q('claim-item-chip');
  chip.innerHTML = claimItemFilter ? `<button type="button" class="chip" id="clear-item-filter">Filtered to one report ${icon('x', 14)}</button>` : '';
  if (claimItemFilter) {
    q('clear-item-filter').addEventListener('click', () => {
      claimItemFilter = '';
      loadClaims();
    });
  }

  const table = q('claim-table');
  table.setAttribute('aria-busy', 'true');
  table.innerHTML = '<div class="state"><span class="spinner dark" aria-hidden="true"></span><p>Loading claims…</p></div>';
  try {
    const data = await apiRequest('/claims', { auth: true, query: { status: claimFilter } });
    allClaims = data.claims;
    const shown = claimItemFilter ? allClaims.filter((c) => c.itemId === claimItemFilter) : allClaims;
    q('claim-count').textContent = `${shown.length} claim${shown.length === 1 ? '' : 's'}`;
    if (!shown.length) {
      table.innerHTML = stateBlock({ iconName: 'shield', title: 'No claims found', text: claimFilter ? 'No claims have this status.' : 'No one has filed a claim yet.' });
      return;
    }
    table.innerHTML = `<div class="table-wrap"><table class="data-table responsive">
      <thead><tr><th>Item</th><th>Claimant</th><th>Type</th><th>Appointment</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead>
      <tbody>${shown.map(claimRow).join('')}</tbody></table></div>`;
    table.querySelectorAll('[data-review]').forEach((btn) => btn.addEventListener('click', () => openReviewDialog(allClaims.find((c) => c.id === btn.dataset.review))));
  } catch (err) {
    table.innerHTML = errorState(err, { retryId: 'retry-claims' });
    const retry = q('retry-claims');
    if (retry) retry.addEventListener('click', loadClaims);
  } finally {
    table.setAttribute('aria-busy', 'false');
  }
}

const NEXT_CLAIM_ACTIONS = {
  pending: [
    { value: 'approved', label: 'Approve', variant: 'primary' },
    { value: 'rejected', label: 'Reject', variant: 'danger' },
  ],
  approved: [
    { value: 'completed', label: 'Mark item handed over', variant: 'primary' },
    { value: 'rejected', label: 'Reject', variant: 'danger' },
  ],
  rejected: [{ value: 'pending', label: 'Reopen as pending', variant: 'primary' }],
  completed: [],
  cancelled: [],
};

async function openReviewDialog(claim) {
  if (!claim) return;
  const actions = [{ label: 'Close', value: 'close', variant: 'ghost' }].concat(NEXT_CLAIM_ACTIONS[claim.status] || []);
  const editable = actions.length > 1;
  const result = await openDialog({
    title: `Claim ${claim.reference}`,
    size: 'lg',
    bodyHtml: `
      <div class="badge-row">${claimBadge(claim.status)}${claim.itemStatus ? statusBadge(claim.itemStatus) : ''}</div>
      <dl class="detail-list">
        <dt>Item</dt><dd><a href="${escapeHtml(itemUrl(claim.itemId))}" data-item-id="${escapeHtml(claim.itemId)}">${escapeHtml(claim.itemTitle)}</a> (${escapeHtml(claim.itemReference)})</dd>
        <dt>Claimant</dt><dd>${escapeHtml(claim.claimantName)} · ${escapeHtml(claim.claimantEmail || '')}</dd>
        <dt>Contact</dt><dd>${escapeHtml(claim.contactInfo || '—')}</dd>
        <dt>Appointment</dt><dd>${escapeHtml(formatDate(claim.appointmentDate))} at ${escapeHtml(formatTime12(claim.appointmentTime))}</dd>
        <dt>Filed</dt><dd>${escapeHtml(formatDateTime(claim.createdAt))}</dd>
        <dt>${claim.claimType === 'ownership' ? 'Proof of ownership' : 'Finder’s account'}</dt><dd class="proof">${multiline(claim.proofDescription)}</dd>
      </dl>
      ${
        editable
          ? `<div class="form-field"><label for="office-notes">Office notes <span class="optional">(shown to the claimant)</span></label>
              <textarea id="office-notes" rows="3" maxlength="500">${escapeHtml(claim.officeNotes || '')}</textarea></div>`
          : claim.officeNotes
            ? `<p class="muted"><strong>Office notes:</strong> ${escapeHtml(claim.officeNotes)}</p>`
            : ''
      }`,
    actions,
    collect: (panel) => ({ notes: (panel.querySelector('#office-notes') || {}).value || '' }),
  });
  if (!result.action || result.action === 'close') return;

  // Rejecting or completing is hard to take back, so it asks once more.
  if (['rejected', 'completed'].includes(result.action)) {
    const yes = await confirmDialog({
      title: result.action === 'rejected' ? 'Reject this claim?' : 'Mark as handed over?',
      message:
        result.action === 'rejected'
          ? 'The claimant will see the rejection and your notes.'
          : 'This records that the item was released and marks the report as returned.',
      confirmText: result.action === 'rejected' ? 'Reject claim' : 'Mark handed over',
      danger: result.action === 'rejected',
    });
    if (!yes) return;
  }
  try {
    await apiRequest(`/claims/${claim.id}`, { method: 'PUT', auth: true, body: { status: result.action, officeNotes: result.data.notes.trim() } });
    toast('Claim updated.');
    refreshAdmin();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ============================================================
   Users
   ============================================================ */
async function loadUsers() {
  const panel = q('apanel-users');
  panel.innerHTML = '<div class="state"><span class="spinner dark" aria-hidden="true"></span><p>Loading users…</p></div>';
  try {
    const { users } = await apiRequest('/admin/users', { auth: true });
    panel.innerHTML = `
      <p class="results-count">${users.length} user${users.length === 1 ? '' : 's'}</p>
      <div class="table-wrap"><table class="data-table responsive">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>ID</th><th>Reports</th><th>Claims</th><th>Joined</th></tr></thead>
        <tbody>${users
          .map(
            (u) => `<tr>
          <td data-label="Name"><strong>${escapeHtml(u.name)}</strong></td>
          <td data-label="Email">${escapeHtml(u.email)}</td>
          <td data-label="Role"><span class="badge ${u.role === 'admin' ? 'badge-claimed' : 'badge-closed'}">${escapeHtml(u.role)}</span></td>
          <td data-label="ID">${escapeHtml(u.studentId || '—')}</td>
          <td data-label="Reports">${u.reports}</td>
          <td data-label="Claims">${u.claims}</td>
          <td data-label="Joined">${escapeHtml(formatDate(u.createdAt))}</td></tr>`
          )
          .join('')}</tbody></table></div>`;
  } catch (err) {
    panel.innerHTML = errorState(err, { retryId: 'retry-users' });
    const retry = q('retry-users');
    if (retry) retry.addEventListener('click', loadUsers);
  }
}

/* ============================================================
   Tabs + refresh
   ============================================================ */
const LOADERS = { overview: loadOverview, reports: loadReports, claims: loadClaims, users: loadUsers };

function selectTab(name, { focus = false } = {}) {
  if (!ATABS.includes(name)) name = 'overview';
  ATABS.forEach((t) => {
    const tab = q(`atab-${t}`);
    const on = t === name;
    tab.setAttribute('aria-selected', on ? 'true' : 'false');
    tab.tabIndex = on ? 0 : -1;
    q(`apanel-${t}`).hidden = !on;
    if (on && focus) tab.focus();
  });
  window.history.replaceState(null, '', `#${name}`);
  if (!loadedTabs[name]) {
    loadedTabs[name] = true;
    // Rebuild the reports toolbar so it reflects filters set from the overview.
    if (name === 'reports') q('apanel-reports').innerHTML = '';
    LOADERS[name]();
  }
}

function currentTab() {
  return ATABS.find((t) => !q(`apanel-${t}`).hidden) || 'overview';
}

// After any change: reload the visible tab and the numbers on the overview.
function refreshAdmin() {
  const active = currentTab();
  Object.keys(loadedTabs).forEach((t) => {
    if (t !== active) loadedTabs[t] = false;
  });
  LOADERS[active]();
  if (active !== 'overview') {
    apiRequest('/admin/stats', { auth: true })
      .then((d) => setClaimsPill(d.stats.pendingClaims))
      .catch(() => {});
  }
}

function wireTabs() {
  ATABS.forEach((name, i) => {
    const tab = q(`atab-${name}`);
    tab.addEventListener('click', () => selectTab(name));
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        selectTab(ATABS[(i + (e.key === 'ArrowRight' ? 1 : -1) + ATABS.length) % ATABS.length], { focus: true });
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        selectTab(e.key === 'Home' ? ATABS[0] : ATABS[ATABS.length - 1], { focus: true });
      }
    });
  });
  window.addEventListener('hashchange', () => {
    const name = window.location.hash.replace('#', '');
    if (ATABS.includes(name) && name !== currentTab()) selectTab(name);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  initLayout('admin');
  const admin = await requireAdminPage(document.getElementById('admin-main'));
  if (!admin) return;

  wireTabs();
  q('admin-refresh').addEventListener('click', async () => {
    const btn = q('admin-refresh');
    setLoading(btn, true, 'Refreshing…');
    Object.keys(loadedTabs).forEach((t) => (loadedTabs[t] = false));
    loadedTabs[currentTab()] = true;
    await LOADERS[currentTab()]();
    setLoading(btn, false);
    toast('Dashboard refreshed.', 'info', 2200);
  });

  const initial = window.location.hash.replace('#', '');
  selectTab(ATABS.includes(initial) ? initial : 'overview');
});
