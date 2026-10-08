/* ============================================================
   ReQuora — page layout (header, footer) and access guards
   Header and footer are built here, so every page shares one
   copy and nothing depends on extra files being fetched.
   ============================================================ */

/* Some static-file servers (e.g. `npx serve`) 301-redirect
   "item.html?id=x" to "/item" and drop the query string. Stashing the
   id right before navigating lets item.js find it anyway. */
function rememberItemId(id) {
  try {
    sessionStorage.setItem('requora_last_item_id', id);
  } catch (e) {
    /* storage unavailable: the query string still works on most servers */
  }
}

document.addEventListener('click', (e) => {
  const link = e.target.closest && e.target.closest('[data-item-id]');
  if (link) rememberItemId(link.dataset.itemId);
});

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function headerHtml(user) {
  const nav = [
    ['home', 'index.html', 'Home'],
    ['browse', 'browse.html', 'Browse'],
  ];
  if (user) nav.push(['dashboard', 'dashboard.html', 'My Dashboard']);
  if (user && user.role === 'admin') nav.push(['admin', 'admin.html', 'Admin']);

  const links = nav.map(([key, href, label]) => `<a href="${href}" data-nav="${key}">${label}</a>`).join('');

  const account = user
    ? `<a class="user-chip" href="dashboard.html" title="Open my dashboard">
         <span class="avatar" aria-hidden="true">${escapeHtml(initials(user.name))}</span>
         <span class="user-chip-name">${escapeHtml(String(user.name).split(' ')[0])}</span>
       </a>
       <button type="button" class="btn btn-ghost btn-sm" id="site-logout-btn">${icon('logout', 16)} Log out</button>`
    : `<a href="login.html" class="btn btn-ghost btn-sm" data-nav="login">Log in</a>
       <a href="register.html" class="btn btn-outline btn-sm" data-nav="register">Sign up</a>`;

  return `
    <a class="skip-link" href="#main">Skip to main content</a>
    <header class="site-header">
      <div class="container header-inner">
        <a href="index.html" class="brand" aria-label="ReQuora home">
          <img class="brand-seal" src="assets/bpsu-logo.png" alt="" width="44" height="44">
          <span class="brand-text">
            <span class="brand-name">ReQuora</span>
            <span class="brand-tag">BPSU Digital Lost &amp; Found</span>
          </span>
        </a>
        <button type="button" class="nav-toggle" id="nav-toggle" aria-expanded="false" aria-controls="site-nav" aria-label="Open menu">${icon('menu', 22)}</button>
        <nav class="site-nav" id="site-nav" aria-label="Main">
          <div class="nav-links">${links}</div>
          <div class="nav-actions">
            <a href="report.html" class="btn btn-gold btn-sm" data-nav="report">${icon('plus', 16)} Report an item</a>
            ${account}
          </div>
        </nav>
      </div>
    </header>`;
}

function footerHtml() {
  return `
    <footer class="site-footer">
      <div class="container footer-grid">
        <div class="footer-brand">
          <div class="footer-logo">
            <img src="assets/bpsu-logo.png" alt="" width="40" height="40">
            <span>ReQuora</span>
          </div>
          <p>The digital lost &amp; found of Bataan Peninsula State University. Report, search and recover belongings across campus.</p>
        </div>
        <div>
          <h4>ReQuora</h4>
          <ul>
            <li><a href="browse.html">Browse Lost &amp; Found</a></li>
            <li><a href="report.html?type=lost">Report a lost item</a></li>
            <li><a href="report.html?type=found">Report a found item</a></li>
            <li><a href="dashboard.html">My dashboard</a></li>
          </ul>
        </div>
        <div>
          <h4>Lost &amp; Found Office</h4>
          <ul>
            <li>Security Services Office</li>
            <li>Main Gate Security Post</li>
            <li>Mon–Fri, 8:00 AM – 5:00 PM</li>
          </ul>
        </div>
        <div>
          <h4>The University</h4>
          <ul>
            <li><a href="https://bpsu.edu.ph" target="_blank" rel="noopener noreferrer">bpsu.edu.ph</a></li>
            <li><a href="#" data-modal="vision-mission">Mission &amp; Vision</a></li>
            <li>City of Balanga, Bataan</li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom"><div class="container">&copy; ${new Date().getFullYear()} ReQuora — Bataan Peninsula State University. Built for the university community.</div></div>
    </footer>`;
}

function wireNavToggle() {
  const toggle = document.getElementById('nav-toggle');
  const nav = document.getElementById('site-nav');
  if (!toggle || !nav) return;
  const set = (open) => {
    nav.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    toggle.innerHTML = icon(open ? 'x' : 'menu', 22);
  };
  toggle.addEventListener('click', () => set(!nav.classList.contains('open')));
  nav.addEventListener('click', (e) => {
    if (e.target.closest('a')) set(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('open')) {
      set(false);
      toggle.focus();
    }
  });
}

/**
 * Builds the header/footer, wires dialogs and shows any pending message.
 * @param {string} [activeNav] data-nav value of the current page
 * @returns the logged-in user (from localStorage) or null
 */
function initLayout(activeNav) {
  const user = getCurrentUser();

  const headerMount = document.getElementById('site-header');
  const footerMount = document.getElementById('site-footer');
  if (headerMount) headerMount.innerHTML = headerHtml(user);
  if (footerMount) footerMount.innerHTML = footerHtml();

  hydrateIcons();

  const main = document.querySelector('main');
  if (main && !main.id) main.id = 'main';
  if (main) main.setAttribute('tabindex', '-1');

  if (activeNav) {
    const link = document.querySelector(`[data-nav="${activeNav}"]`);
    if (link) link.setAttribute('aria-current', 'page');
  }

  wireNavToggle();
  wireVisionMissionLinks();
  const logoutBtn = document.getElementById('site-logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', showLogoutModal);

  const pending = showPendingFlash();
  if (pending) toast(pending.message, pending.type);
  return user;
}

/* ---------- Access guards ---------- */

// Confirms with the server that the stored login is still valid and refreshes
// the stored user (so a changed role or name shows up). Returns the user or null.
async function refreshSession() {
  if (!getToken()) return null;
  try {
    const data = await apiRequest('/auth/me', { auth: true });
    updateStoredUser(data.user);
    return data.user;
  } catch (err) {
    return null; // 401 is handled by apiRequest (redirects to login)
  }
}

// Sends visitors who are not logged in to the login page, then back afterwards.
function requireLogin() {
  if (getToken() && getCurrentUser()) return true;
  const here = window.location.pathname.split('/').pop() + window.location.search;
  flash('Please log in to continue.', 'info');
  window.location.href = `login.html?next=${encodeURIComponent(here)}`;
  return false;
}

// Admin pages: the browser check is only a convenience. The server enforces
// admin access on every request regardless of what is stored here.
async function requireAdminPage(mainEl) {
  if (!requireLogin()) return null;
  const user = await refreshSession();
  if (!user || user.role !== 'admin') {
    if (mainEl) {
      mainEl.innerHTML = `<div class="container section">${stateBlock({
        iconName: 'lock',
        tone: 'error',
        title: 'Administrators only',
        text: 'This area is for the Lost and Found Office. Your account does not have admin access.',
        actionHtml: '<a class="btn btn-primary btn-sm" href="index.html">Back to home</a>',
      })}</div>`;
    }
    return null;
  }
  return user;
}

// Only follow same-site "next" targets (prevents redirecting to another website).
function safeNext(raw, fallback = 'dashboard.html') {
  if (!raw) return fallback;
  return /^[a-z0-9_-]+\.html(\?[\w=&%.-]*)?$/i.test(raw) ? raw : fallback;
}
