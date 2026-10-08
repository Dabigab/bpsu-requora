/* ============================================================
   ReQuora — UI toolkit
   Icons, badges, formatting, toasts, item cards, empty/error
   states, pagination and form helpers shared by every page.
   ============================================================ */

/* ---------- Icons (inline SVG, no external files) ---------- */
const ICON_PATHS = {
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  tag: '<path d="M12.6 2.6a2 2 0 0 0-1.4-.6H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2 2 0 0 0 2.8 0l7.2-7.2a2 2 0 0 0 0-2.8Z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3Z"/><path d="m9 12 2 2 4-4"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><path d="m9 11 3 3L22 4"/>',
  xCircle: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M9.9 4.2A9.7 9.7 0 0 1 12 4c6.4 0 10 8 10 8a17 17 0 0 1-2.2 3.2M6.6 6.6A16.7 16.7 0 0 0 2 12s3.6 8 10 8a9.7 9.7 0 0 0 5.4-1.6"/><path d="m2 2 20 20M14.1 14.1a3 3 0 0 1-4.2-4.2"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  arrowRight: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  arrowLeft: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  box: '<path d="m7.5 4.3 9 5.2M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
  award: '<circle cx="12" cy="8" r="6"/><path d="M15.5 13.2 17 22l-5-3-5 3 1.5-8.8"/>',
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5Z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5Z"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  laptop: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 20h20"/>',
  idcard: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  shirt: '<path d="M20.4 5.6 16 3a4 4 0 0 1-8 0L3.6 5.6a1 1 0 0 0-.5 1.2l1.3 3.4a1 1 0 0 0 1 .7H7V21h10V10.9h1.6a1 1 0 0 0 1-.7l1.3-3.4a1 1 0 0 0-.5-1.2Z"/>',
  watch: '<circle cx="12" cy="12" r="6"/><path d="M12 10v2l1 1M16 16l-.5 4.4a2 2 0 0 1-2 1.6h-3a2 2 0 0 1-2-1.6L8 16M8 8l.5-4.4A2 2 0 0 1 10.5 2h3a2 2 0 0 1 2 1.6L16 8"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5Z"/><path d="M20 17v5H6.5A2.5 2.5 0 0 1 4 19.5"/>',
  wifiOff: '<path d="M12 20h.01M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 5.2-2.7M19 12.9a10 10 0 0 0-2.4-1.7M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8a15 15 0 0 0-10-3.3"/><path d="m2 2 20 20"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
};

const CATEGORY_ICONS = {
  Electronics: 'laptop',
  'ID / Cards': 'idcard',
  Bags: 'bag',
  Clothing: 'shirt',
  Documents: 'file',
  Accessories: 'watch',
  Keys: 'key',
  'Books & Supplies': 'book',
  Other: 'box',
};

function icon(name, size = 18, extraClass = '') {
  const paths = ICON_PATHS[name] || ICON_PATHS.info;
  return (
    `<svg class="icon ${extraClass}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
    `stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`
  );
}

/* ---------- Text + formatting ---------- */
function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Escapes text and turns line breaks into <br> (for descriptions).
function multiline(value) {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

function formatDate(value) {
  if (!value) return '—';
  // A bare YYYY-MM-DD is a calendar date, not a moment in time: do not shift it by time zone.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatTime12(hhmm) {
  if (!hhmm) return '';
  const [h, m] = String(hhmm).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return '';
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function timeAgo(iso) {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (Number.isNaN(seconds)) return '';
  if (seconds < 60) return 'just now';
  const units = [['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [name, size] of units) {
    if (seconds >= size) {
      const n = Math.floor(seconds / size);
      if (name === 'day' && n > 30) return formatDate(iso);
      return `${n} ${name}${n === 1 ? '' : 's'} ago`;
    }
  }
  return 'just now';
}

function debounce(fn, wait = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function itemUrl(id) {
  return `item.html?id=${encodeURIComponent(id)}`;
}

// Photo URL from the API ("/uploads/x.png") -> full URL on the backend.
function photoUrl(path) {
  if (!path) return '';
  return /^https?:/i.test(path) ? path : `${REQUORA_CONFIG.ASSET_BASE}${path}`;
}

/* ---------- Status system (same values as backend/utils/constants.js) ---------- */
const ITEM_STATUS_META = {
  pending_verification: { label: 'Pending Verification', icon: 'clock', tone: 'pending' },
  lost: { label: 'Lost', icon: 'search', tone: 'lost' },
  found: { label: 'Found', icon: 'check', tone: 'found' },
  claimed: { label: 'Claimed', icon: 'award', tone: 'claimed' },
  returned: { label: 'Returned', icon: 'checkCircle', tone: 'returned' },
  closed: { label: 'Closed', icon: 'xCircle', tone: 'closed' },
};

const CLAIM_STATUS_META = {
  pending: { label: 'Pending', icon: 'clock', tone: 'pending' },
  approved: { label: 'Approved', icon: 'check', tone: 'found' },
  rejected: { label: 'Rejected', icon: 'xCircle', tone: 'lost' },
  completed: { label: 'Completed', icon: 'checkCircle', tone: 'returned' },
  cancelled: { label: 'Cancelled', icon: 'xCircle', tone: 'closed' },
};

function badge(meta, fallbackLabel) {
  const m = meta || { label: fallbackLabel || 'Unknown', icon: 'info', tone: 'closed' };
  // Icon + words, never colour alone.
  return `<span class="badge badge-${m.tone}">${icon(m.icon, 13)}<span>${escapeHtml(m.label)}</span></span>`;
}
const statusBadge = (status) => badge(ITEM_STATUS_META[status], status);
const claimBadge = (status) => badge(CLAIM_STATUS_META[status], status);
const typeBadge = (type) =>
  type === 'found'
    ? `<span class="badge badge-type-found">${icon('check', 13)}<span>Found</span></span>`
    : `<span class="badge badge-type-lost">${icon('search', 13)}<span>Lost</span></span>`;

// Type + status badges, without repeating "Lost Lost" / "Found Found":
// when the status just restates the type, one badge is enough.
const itemBadges = (item) => typeBadge(item.type) + (item.status === item.type ? '' : statusBadge(item.status));

const statusLabel = (status) => (ITEM_STATUS_META[status] ? ITEM_STATUS_META[status].label : status);
const claimStatusLabel = (status) => (CLAIM_STATUS_META[status] ? CLAIM_STATUS_META[status].label : status);

// Fallback lists, replaced by GET /api/meta when it loads.
const FALLBACK_CATEGORIES = ['Electronics', 'ID / Cards', 'Bags', 'Clothing', 'Documents', 'Accessories', 'Keys', 'Books & Supplies', 'Other'];

let metaPromise = null;
function loadMeta() {
  if (!metaPromise) {
    metaPromise = apiRequest('/meta')
      .then((d) => d)
      .catch(() => ({ categories: FALLBACK_CATEGORIES, limits: null }));
  }
  return metaPromise;
}

function fillCategorySelect(select, categories, { placeholder } = {}) {
  const opts = (placeholder ? [`<option value="">${escapeHtml(placeholder)}</option>`] : []).concat(
    categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
  );
  select.innerHTML = opts.join('');
}

/* ---------- Toasts (non-blocking messages) ---------- */
function toast(message, type = 'success', timeout = 4500) {
  let region = document.getElementById('toast-region');
  if (!region) {
    region = document.createElement('div');
    region.id = 'toast-region';
    region.className = 'toast-region';
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'false');
    document.body.appendChild(region);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  const iconName = type === 'error' ? 'alert' : type === 'info' ? 'info' : 'checkCircle';
  el.innerHTML = `${icon(iconName, 18)}<span>${escapeHtml(message)}</span><button type="button" class="toast-close" aria-label="Dismiss message">${icon('x', 14)}</button>`;
  region.appendChild(el);
  const remove = () => {
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 200);
  };
  el.querySelector('.toast-close').addEventListener('click', remove);
  if (timeout) setTimeout(remove, timeout);
}

// A message that survives a page change (e.g. "Report deleted" after redirect).
function flash(message, type = 'success') {
  try {
    sessionStorage.setItem('requora_flash', JSON.stringify({ message, type }));
  } catch (e) {
    /* storage unavailable: skip */
  }
}
function showPendingFlash() {
  try {
    const raw = sessionStorage.getItem('requora_flash');
    if (!raw) return null;
    sessionStorage.removeItem('requora_flash');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

/* ---------- Page states ---------- */
function stateBlock({ iconName = 'search', title, text = '', actionHtml = '', tone = 'neutral' }) {
  return `
    <div class="state state-${tone}" role="${tone === 'error' ? 'alert' : 'status'}">
      <div class="state-icon">${icon(iconName, 28)}</div>
      <h3>${escapeHtml(title)}</h3>
      ${text ? `<p>${escapeHtml(text)}</p>` : ''}
      ${actionHtml ? `<div class="state-actions">${actionHtml}</div>` : ''}
    </div>`;
}

// Error state tuned to what actually went wrong.
function errorState(err, { retryId } = {}) {
  const retry = retryId ? `<button type="button" class="btn btn-outline btn-sm" id="${retryId}">${icon('refresh', 15)} Try again</button>` : '';
  if (err && err.status === 0) {
    return stateBlock({
      iconName: 'wifiOff',
      tone: 'error',
      title: 'Cannot reach the ReQuora server',
      text: `Make sure the backend is running (${REQUORA_CONFIG.ASSET_BASE}) and try again.`,
      actionHtml: retry,
    });
  }
  if (err && err.status === 401) {
    return stateBlock({ iconName: 'lock', tone: 'error', title: 'Please log in', text: 'You need to be logged in to see this.', actionHtml: '<a class="btn btn-primary btn-sm" href="login.html">Log in</a>' });
  }
  if (err && err.status === 403) {
    return stateBlock({ iconName: 'lock', tone: 'error', title: 'You do not have access', text: (err && err.message) || 'This page is not available to your account.', actionHtml: '<a class="btn btn-outline btn-sm" href="index.html">Back to home</a>' });
  }
  if (err && err.status === 404) {
    return stateBlock({ iconName: 'search', tone: 'error', title: 'Not found', text: (err && err.message) || 'That page or record could not be found.', actionHtml: '<a class="btn btn-outline btn-sm" href="browse.html">Browse reports</a>' });
  }
  return stateBlock({ iconName: 'alert', tone: 'error', title: 'Something went wrong', text: (err && err.message) || 'Please try again in a moment.', actionHtml: retry });
}

function skeletonCards(count = 6) {
  return Array.from({ length: count }, () => `
    <div class="card-item skeleton-card" aria-hidden="true">
      <div class="skeleton skeleton-img"></div>
      <div class="card-item-body">
        <div class="skeleton skeleton-line" style="width:40%"></div>
        <div class="skeleton skeleton-line lg" style="width:80%"></div>
        <div class="skeleton skeleton-line" style="width:60%"></div>
        <div class="skeleton skeleton-line" style="width:50%"></div>
      </div>
    </div>`).join('');
}

/* ---------- Item card (home, browse, dashboard) ---------- */
function itemMedia(item) {
  if (item.imageUrl) {
    return `<img src="${escapeHtml(photoUrl(item.imageUrl))}" alt="Photo of ${escapeHtml(item.title)}" loading="lazy" decoding="async">`;
  }
  const ic = CATEGORY_ICONS[item.category] || 'box';
  return `<div class="media-placeholder" role="img" aria-label="No photo provided for ${escapeHtml(item.title)}">${icon(ic, 40)}<span>No photo</span></div>`;
}

function itemCardHtml(item) {
  return `
    <article class="card-item type-${escapeHtml(item.type)}">
      <a class="card-item-media" href="${itemUrl(item.id)}" data-item-id="${escapeHtml(item.id)}" tabindex="-1" aria-hidden="true">${itemMedia(item)}</a>
      <div class="card-item-body">
        <div class="badge-row">${itemBadges(item)}</div>
        <h3 class="card-item-title"><a href="${itemUrl(item.id)}" data-item-id="${escapeHtml(item.id)}">${escapeHtml(item.title)}</a></h3>
        <p class="card-item-cat">${icon(CATEGORY_ICONS[item.category] || 'box', 15)}<span>${escapeHtml(item.category)}</span></p>
        <ul class="meta-list">
          <li>${icon('pin', 15)}<span>${escapeHtml(item.location)}</span></li>
          <li>${icon('calendar', 15)}<span>${item.type === 'lost' ? 'Lost' : 'Found'} ${escapeHtml(formatDate(item.date))}</span></li>
        </ul>
        <a class="btn btn-outline btn-sm card-item-btn" href="${itemUrl(item.id)}" data-item-id="${escapeHtml(item.id)}">View details ${icon('arrowRight', 15)}</a>
      </div>
    </article>`;
}

/* ---------- Pagination ---------- */
function renderPagination(container, pagination, onPage) {
  if (!container) return;
  if (!pagination || pagination.totalPages <= 1) {
    container.innerHTML = '';
    return;
  }
  const { page, totalPages } = pagination;
  const pages = [];
  const add = (n) => pages.push(n);
  for (let n = 1; n <= totalPages; n += 1) {
    if (n === 1 || n === totalPages || Math.abs(n - page) <= 1) add(n);
    else if (pages[pages.length - 1] !== '…') add('…');
  }
  container.innerHTML = `
    <nav class="pagination" aria-label="Pagination">
      <button type="button" class="page-btn" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="Previous page">${icon('chevronLeft', 16)}</button>
      ${pages.map((n) => (n === '…' ? '<span class="page-gap" aria-hidden="true">…</span>' : `<button type="button" class="page-btn ${n === page ? 'active' : ''}" data-page="${n}" ${n === page ? 'aria-current="page"' : ''} aria-label="Page ${n}">${n}</button>`)).join('')}
      <button type="button" class="page-btn" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''} aria-label="Next page">${icon('chevronRight', 16)}</button>
    </nav>`;
  container.querySelectorAll('[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const n = Number(btn.dataset.page);
      if (n >= 1 && n <= totalPages) onPage(n);
    });
  });
}

/* ---------- Forms ---------- */
function setLoading(button, loading, loadingText) {
  if (!button) return;
  if (loading) {
    button.dataset.label = button.innerHTML;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${escapeHtml(loadingText || 'Please wait…')}</span>`;
  } else {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    if (button.dataset.label) button.innerHTML = button.dataset.label;
  }
}

function clearFieldErrors(form) {
  form.querySelectorAll('.field-error').forEach((el) => el.remove());
  form.querySelectorAll('[aria-invalid="true"]').forEach((el) => {
    el.removeAttribute('aria-invalid');
    el.removeAttribute('aria-describedby');
  });
  form.querySelectorAll('.form-field.has-error').forEach((el) => el.classList.remove('has-error'));
}

// Shows `fields` ({ name: "message" }) under the matching inputs (by id or name).
// Returns messages that had no matching input so the caller can show them elsewhere.
function showFieldErrors(form, fields = {}) {
  clearFieldErrors(form);
  const orphan = [];
  let first = null;
  Object.entries(fields).forEach(([name, message]) => {
    const input = form.querySelector(`#${CSS.escape(name)}, [name="${CSS.escape(name)}"]`);
    const wrap = input && (input.closest('.form-field') || input.parentElement);
    if (!input || !wrap) {
      orphan.push(message);
      return;
    }
    const id = `err-${name}`;
    const p = document.createElement('p');
    p.className = 'field-error';
    p.id = id;
    p.innerHTML = `${icon('alert', 14)}<span>${escapeHtml(message)}</span>`;
    wrap.appendChild(p);
    wrap.classList.add('has-error');
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', id);
    if (!first) first = input;
  });
  if (first) first.focus({ preventScroll: false });
  return orphan;
}

function setFormMessage(el, text, type = 'error') {
  if (!el) return;
  if (!text) {
    el.innerHTML = '';
    el.className = 'form-msg';
    return;
  }
  el.className = `form-msg ${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `${icon(type === 'error' ? 'alert' : 'checkCircle', 18)}<span>${escapeHtml(text)}</span>`;
}

// Wires every .toggle-password button next to a password input.
function wirePasswordToggles(root = document) {
  root.querySelectorAll('[data-toggle-password]').forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = 'true';
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.togglePassword);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = icon(show ? 'eyeOff' : 'eye', 18);
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      btn.setAttribute('aria-pressed', show ? 'true' : 'false');
    });
  });
}

function passwordFieldHtml({ id, label, placeholder = '', autocomplete = 'current-password', hint = '' }) {
  return `
    <div class="form-field">
      <label for="${id}">${escapeHtml(label)}</label>
      <div class="input-wrap">
        <input type="password" id="${id}" name="${id}" autocomplete="${autocomplete}" placeholder="${escapeHtml(placeholder)}" required>
        <button type="button" class="input-action" data-toggle-password="${id}" aria-label="Show password" aria-pressed="false">${icon('eye', 18)}</button>
      </div>
      ${hint ? `<small class="field-hint">${escapeHtml(hint)}</small>` : ''}
    </div>`;
}

// Disable/enable an element visually while a request is in flight.
function busy(el, on) {
  if (!el) return;
  el.classList.toggle('is-busy', !!on);
  el.setAttribute('aria-busy', on ? 'true' : 'false');
}

/* ---------- Icons written in markup as <span data-icon="name"> ---------- */
function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    if (el.dataset.hydrated) return;
    el.innerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 18);
    el.dataset.hydrated = '1';
  });
}
