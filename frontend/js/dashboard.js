/* ReQuora — user dashboard: my reports, my claims, activity, profile */

const TABS = ['reports', 'claims', 'activity', 'profile'];
const OPEN = ['pending_verification', 'lost', 'found'];

let user = null;
let reportsPage = 1;
let myClaims = [];

const el = (id) => document.getElementById(id);

/* ---------- Stat cards ---------- */
function statCard(iconName, label, value, tone) {
  return `
    <div class="stat-card ${tone || ''}">
      <span class="stat-card-icon">${icon(iconName, 22)}</span>
      <div><div class="stat-card-value">${value}</div><div class="stat-card-label">${escapeHtml(label)}</div></div>
    </div>`;
}

async function loadStats() {
  const box = el('dash-stats');
  box.innerHTML = [1, 2, 3, 4].map(() => '<div class="stat-card skeleton-block" aria-hidden="true"></div>').join('');
  try {
    // limit=1: we only need pagination.total, not the rows.
    const count = async (query) => (await apiRequest('/items/mine', { auth: true, query: { limit: 1, ...query } })).pagination.total;
    const [lost, found, returned, claims] = await Promise.all([
      count({ type: 'lost' }),
      count({ type: 'found' }),
      count({ status: 'returned' }),
      apiRequest('/claims/mine', { auth: true }),
    ]);
    myClaims = claims.claims;
    const claimsReturned = myClaims.filter((c) => c.status === 'completed').length;
    box.innerHTML =
      statCard('search', 'My Lost Reports', lost, 'tone-lost') +
      statCard('check', 'My Found Reports', found, 'tone-found') +
      statCard('shield', 'My Claims', myClaims.length, 'tone-claim') +
      statCard('award', 'Returned Items', returned + claimsReturned, 'tone-returned');
    return true;
  } catch (err) {
    box.innerHTML = `<div class="grid-span">${errorState(err, { retryId: 'retry-stats' })}</div>`;
    const retry = el('retry-stats');
    if (retry) retry.addEventListener('click', refreshAll);
    return false;
  }
}

/* ---------- My reports ---------- */
function reportRowHtml(item) {
  const open = OPEN.includes(item.status);
  return `
    <article class="row-card" data-id="${escapeHtml(item.id)}">
      <a class="row-media" href="${escapeHtml(itemUrl(item.id))}" data-item-id="${escapeHtml(item.id)}" tabindex="-1" aria-hidden="true">
        ${
          item.imageUrl
            ? `<img src="${escapeHtml(photoUrl(item.imageUrl))}" alt="" loading="lazy">`
            : icon(CATEGORY_ICONS[item.category] || 'box', 28)
        }
      </a>
      <div class="row-main">
        <div class="badge-row">${itemBadges(item)}${
          item.pendingClaims ? `<span class="badge badge-pending">${item.pendingClaims} pending claim${item.pendingClaims === 1 ? '' : 's'}</span>` : ''
        }</div>
        <h3><a href="${escapeHtml(itemUrl(item.id))}" data-item-id="${escapeHtml(item.id)}">${escapeHtml(item.title)}</a></h3>
        <p class="muted">${icon('pin', 14)} ${escapeHtml(item.location)} · ${icon('calendar', 14)} ${escapeHtml(formatDate(item.date))} · ${escapeHtml(item.reference)}</p>
      </div>
      <div class="row-actions">
        <a class="btn btn-outline btn-sm" href="${escapeHtml(itemUrl(item.id))}" data-item-id="${escapeHtml(item.id)}">View</a>
        ${open ? `<button type="button" class="btn btn-ghost btn-sm" data-close="${escapeHtml(item.id)}">Close</button>` : ''}
        ${open ? `<button type="button" class="btn btn-danger-outline btn-sm" data-delete="${escapeHtml(item.id)}" aria-label="Delete ${escapeHtml(item.title)}">${icon('trash', 15)}</button>` : ''}
      </div>
    </article>`;
}

async function loadReports() {
  const panel = el('panel-reports');
  panel.setAttribute('aria-busy', 'true');
  panel.innerHTML = `<div class="list-stack">${skeletonCards(3)}</div>`;
  try {
    const data = await apiRequest('/items/mine', { auth: true, query: { page: reportsPage, limit: 8 } });
    reportsPage = data.pagination.page;
    if (!data.items.length) {
      panel.innerHTML = stateBlock({
        iconName: 'file',
        title: 'No reports yet',
        text: 'Lost or found something on campus? File a report and the office will help.',
        actionHtml: '<a class="btn btn-primary btn-sm" href="report.html">Report an item</a>',
      });
      return;
    }
    panel.innerHTML = `<div class="list-stack">${data.items.map(reportRowHtml).join('')}</div><div id="reports-pagination"></div>`;
    renderPagination(el('reports-pagination'), data.pagination, (n) => {
      reportsPage = n;
      loadReports();
    });
    wireReportActions(panel);
  } catch (err) {
    panel.innerHTML = errorState(err, { retryId: 'retry-reports' });
    const retry = el('retry-reports');
    if (retry) retry.addEventListener('click', loadReports);
  } finally {
    panel.setAttribute('aria-busy', 'false');
  }
}

function wireReportActions(panel) {
  panel.querySelectorAll('[data-close]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const yes = await confirmDialog({
        title: 'Close this report?',
        message: 'Close it when the item is sorted out. It will leave the public feed.',
        confirmText: 'Close report',
      });
      if (!yes) return;
      try {
        await apiRequest(`/items/${btn.dataset.close}`, { method: 'PUT', auth: true, body: { status: 'closed' } });
        toast('Report closed.', 'info');
        refreshAll();
      } catch (err) {
        toast(err.message, 'error');
      }
    })
  );
  panel.querySelectorAll('[data-delete]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const yes = await confirmDialog({
        title: 'Delete this report?',
        message: 'This permanently removes the report, its photo and any claims on it. This cannot be undone.',
        confirmText: 'Delete report',
        danger: true,
      });
      if (!yes) return;
      try {
        await apiRequest(`/items/${btn.dataset.delete}`, { method: 'DELETE', auth: true });
        toast('Report deleted.');
        refreshAll();
      } catch (err) {
        toast(err.message, 'error');
      }
    })
  );
}

/* ---------- My claims ---------- */
function claimRowHtml(c) {
  return `
    <article class="row-card">
      <div class="row-main">
        <div class="badge-row">${claimBadge(c.status)}${c.itemStatus ? statusBadge(c.itemStatus) : ''}</div>
        <h3><a href="${escapeHtml(itemUrl(c.itemId))}" data-item-id="${escapeHtml(c.itemId)}">${escapeHtml(c.itemTitle)}</a></h3>
        <p class="muted">${icon('calendar', 14)} ${escapeHtml(formatDate(c.appointmentDate))} at ${escapeHtml(formatTime12(c.appointmentTime))} · ${escapeHtml(c.reference)}</p>
        ${c.officeNotes ? `<p class="note-inline">${icon('info', 14)} <span>Office: ${escapeHtml(c.officeNotes)}</span></p>` : ''}
      </div>
      <div class="row-actions">
        <a class="btn btn-outline btn-sm" href="${escapeHtml(itemUrl(c.itemId))}" data-item-id="${escapeHtml(c.itemId)}">View item</a>
        ${c.status === 'pending' ? `<button type="button" class="btn btn-ghost btn-sm" data-cancel-claim="${escapeHtml(c.id)}">Cancel claim</button>` : ''}
      </div>
    </article>`;
}

function renderClaims() {
  const panel = el('panel-claims');
  if (!myClaims.length) {
    panel.innerHTML = stateBlock({
      iconName: 'shield',
      title: 'No claims yet',
      text: 'When you claim an item you recognise, you can follow its progress here.',
      actionHtml: '<a class="btn btn-primary btn-sm" href="browse.html?type=found">Browse found items</a>',
    });
    return;
  }
  panel.innerHTML = `<div class="list-stack">${myClaims.map(claimRowHtml).join('')}</div>`;
  panel.querySelectorAll('[data-cancel-claim]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const yes = await confirmDialog({
        title: 'Cancel your claim?',
        message: 'The office will no longer expect you on your appointment day.',
        confirmText: 'Cancel claim',
        cancelText: 'Keep claim',
        danger: true,
      });
      if (!yes) return;
      try {
        await apiRequest(`/claims/${btn.dataset.cancelClaim}/cancel`, { method: 'PUT', auth: true });
        toast('Claim cancelled.', 'info');
        refreshAll();
      } catch (err) {
        toast(err.message, 'error');
      }
    })
  );
}

/* ---------- Recent activity (built from real records only) ---------- */
async function renderActivity() {
  const panel = el('panel-activity');
  panel.innerHTML = '<div class="state"><span class="spinner dark" aria-hidden="true"></span><p>Loading activity…</p></div>';
  try {
    const data = await apiRequest('/items/mine', { auth: true, query: { limit: 10 } });
    const events = [];
    data.items.forEach((i) => events.push({ at: i.createdAt, icon: i.type === 'lost' ? 'search' : 'check', text: `You reported a ${i.type} item: ${i.title}`, href: itemUrl(i.id), id: i.id }));
    myClaims.forEach((c) => {
      events.push({ at: c.createdAt, icon: 'shield', text: `You filed a claim for ${c.itemTitle}`, href: itemUrl(c.itemId), id: c.itemId });
      if (c.updatedAt && c.status !== 'pending' && c.updatedAt !== c.createdAt) {
        events.push({ at: c.updatedAt, icon: c.status === 'rejected' ? 'xCircle' : 'checkCircle', text: `Your claim for ${c.itemTitle} is now ${claimStatusLabel(c.status).toLowerCase()}`, href: itemUrl(c.itemId), id: c.itemId });
      }
    });
    events.sort((a, b) => new Date(b.at) - new Date(a.at));
    if (!events.length) {
      panel.innerHTML = stateBlock({ iconName: 'clock', title: 'Nothing here yet', text: 'Your reports and claims will show up here as they happen.' });
      return;
    }
    panel.innerHTML = `<ol class="timeline">${events
      .slice(0, 12)
      .map(
        (e) => `<li><span class="timeline-dot">${icon(e.icon, 14)}</span>
          <div><a href="${escapeHtml(e.href)}" data-item-id="${escapeHtml(e.id)}">${escapeHtml(e.text)}</a><small>${escapeHtml(timeAgo(e.at))}</small></div></li>`
      )
      .join('')}</ol>`;
  } catch (err) {
    panel.innerHTML = errorState(err, { retryId: 'retry-activity' });
    const retry = el('retry-activity');
    if (retry) retry.addEventListener('click', renderActivity);
  }
}

/* ---------- Profile ---------- */
function renderProfile() {
  const panel = el('panel-profile');
  panel.innerHTML = `
    <div class="profile-grid">
      <section class="panel">
        <h2>Profile</h2>
        <div class="form-msg" id="profile-msg"></div>
        <form id="profile-form" novalidate>
          <div class="form-field"><label for="p-name">Full name</label><input id="p-name" name="name" maxlength="80" value="${escapeHtml(user.name)}" required autocomplete="name"></div>
          <div class="form-field"><label for="p-email">Email</label><input id="p-email" value="${escapeHtml(user.email)}" disabled><small class="field-hint">Your email is your login and cannot be changed here.</small></div>
          <div class="form-field"><label for="p-student">Student / employee ID <span class="optional">(optional)</span></label><input id="p-student" name="studentId" maxlength="30" value="${escapeHtml(user.studentId || '')}"></div>
          <div class="form-field"><label>Account type</label><p class="static-value">${escapeHtml(user.role)}</p></div>
          <button type="submit" class="btn btn-primary" id="profile-save">Save profile</button>
        </form>
      </section>
      <section class="panel">
        <h2>Change password</h2>
        <div class="form-msg" id="pw-msg"></div>
        <form id="pw-form" novalidate>
          <div id="pw-current-slot"></div>
          <div id="pw-new-slot"></div>
          <button type="submit" class="btn btn-primary" id="pw-save">Update password</button>
        </form>
      </section>
    </div>`;

  el('pw-current-slot').innerHTML = passwordFieldHtml({ id: 'currentPassword', label: 'Current password', autocomplete: 'current-password' });
  el('pw-new-slot').innerHTML = passwordFieldHtml({
    id: 'newPassword',
    label: 'New password',
    autocomplete: 'new-password',
    hint: '8 to 72 characters with at least one letter and one number.',
  });
  wirePasswordToggles(panel);

  const profileForm = el('profile-form');
  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldErrors(profileForm);
    const msg = el('profile-msg');
    setFormMessage(msg, '');
    const name = el('p-name').value.trim();
    if (name.length < 2) {
      showFieldErrors(profileForm, { name: 'Enter your full name (at least 2 characters).' });
      return;
    }
    const btn = el('profile-save');
    setLoading(btn, true, 'Saving…');
    try {
      const data = await apiRequest('/auth/me', { method: 'PUT', auth: true, body: { name, studentId: el('p-student').value.trim() } });
      user = data.user;
      updateStoredUser(user);
      setFormMessage(msg, 'Profile saved.', 'success');
      el('welcome').textContent = `Welcome, ${user.name.split(' ')[0]}`;
    } catch (err) {
      const orphan = showFieldErrors(profileForm, err.fields);
      setFormMessage(msg, orphan[0] || err.message, 'error');
    } finally {
      setLoading(btn, false);
    }
  });

  const pwForm = el('pw-form');
  pwForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldErrors(pwForm);
    const msg = el('pw-msg');
    setFormMessage(msg, '');
    const currentPassword = el('currentPassword').value;
    const newPassword = el('newPassword').value;
    const errors = {};
    if (!currentPassword) errors.currentPassword = 'Enter your current password.';
    if (newPassword.length < 8 || newPassword.length > 72 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      errors.newPassword = 'Use 8 to 72 characters with at least one letter and one number.';
    }
    if (Object.keys(errors).length) {
      showFieldErrors(pwForm, errors);
      return;
    }
    const btn = el('pw-save');
    setLoading(btn, true, 'Updating…');
    try {
      await apiRequest('/auth/password', { method: 'PUT', auth: true, body: { currentPassword, newPassword } });
      pwForm.reset();
      setFormMessage(msg, 'Password updated.', 'success');
    } catch (err) {
      const orphan = showFieldErrors(pwForm, err.fields);
      setFormMessage(msg, orphan[0] || err.message, 'error');
    } finally {
      setLoading(btn, false);
    }
  });
}

/* ---------- Tabs ---------- */
const loaded = {};

function selectTab(name, { focus = false } = {}) {
  if (!TABS.includes(name)) name = 'reports';
  TABS.forEach((t) => {
    const tab = el(`tab-${t}`);
    const on = t === name;
    tab.setAttribute('aria-selected', on ? 'true' : 'false');
    tab.tabIndex = on ? 0 : -1;
    el(`panel-${t}`).hidden = !on;
    if (on && focus) tab.focus();
  });
  window.history.replaceState(null, '', `#${name}`);
  if (name === 'claims') renderClaims();
  if (name === 'activity') renderActivity();
  if (name === 'profile' && !loaded.profile) {
    renderProfile();
    loaded.profile = true;
  }
}

function wireTabs() {
  const tabs = TABS.map((t) => el(`tab-${t}`));
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(tab.dataset.tab));
    tab.addEventListener('keydown', (e) => {
      const keys = { ArrowRight: 1, ArrowLeft: -1 };
      if (keys[e.key]) {
        e.preventDefault();
        selectTab(TABS[(i + keys[e.key] + TABS.length) % TABS.length], { focus: true });
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        selectTab(e.key === 'Home' ? TABS[0] : TABS[TABS.length - 1], { focus: true });
      }
    });
  });
}

async function refreshAll() {
  await Promise.all([loadStats(), loadReports()]);
  const active = TABS.find((t) => !el(`panel-${t}`).hidden);
  if (active === 'claims') renderClaims();
  if (active === 'activity') renderActivity();
}

document.addEventListener('DOMContentLoaded', async () => {
  initLayout('dashboard');
  if (!requireLogin()) return;

  user = (await refreshSession()) || getCurrentUser();
  if (!user) return;

  el('welcome').textContent = `Welcome, ${user.name.split(' ')[0]}`;
  wireTabs();
  const initial = window.location.hash.replace('#', '');
  await refreshAll();
  if (TABS.includes(initial) && initial !== 'reports') selectTab(initial);
});
