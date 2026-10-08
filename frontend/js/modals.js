/* ============================================================
   ReQuora — modal system
   One accessible dialog structure used everywhere:
     - confirmDialog()  replaces the browser's confirm()/alert()
     - openDialog()     any custom dialog (claim review, edit report…)
     - the log-out confirmation and BPSU Mission & Vision dialogs
   Behaviour: Esc closes, Tab stays inside, focus returns to the
   button that opened it, the page behind cannot scroll.
   ============================================================ */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const modalFocusStack = [];

function trapKeys(backdrop, id) {
  backdrop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal(id);
      return;
    }
    if (e.key !== 'Tab') return;
    const items = [...backdrop.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
}

/** Builds a modal once and appends it to <body>. Returns the backdrop element. */
function createModal(id, innerHtml, labelId, { dismissOnBackdrop = true } = {}) {
  const existing = document.getElementById(id);
  if (existing) return existing;

  const backdrop = document.createElement('div');
  backdrop.id = id;
  backdrop.className = 'modal-backdrop';
  backdrop.hidden = true;
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  if (labelId) backdrop.setAttribute('aria-labelledby', labelId);
  backdrop.innerHTML = innerHtml;
  document.body.appendChild(backdrop);

  if (dismissOnBackdrop) {
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) closeModal(id);
    });
  }
  trapKeys(backdrop, id);
  return backdrop;
}

function openModal(id, focusSelector) {
  const backdrop = document.getElementById(id);
  if (!backdrop) return;
  modalFocusStack.push(document.activeElement);
  backdrop.hidden = false;
  document.body.classList.add('modal-open');
  const target = (focusSelector && backdrop.querySelector(focusSelector)) || backdrop.querySelector(FOCUSABLE);
  if (target) target.focus();
}

function closeModal(id) {
  const backdrop = document.getElementById(id);
  if (!backdrop || backdrop.hidden) return;
  backdrop.hidden = true;
  backdrop.dispatchEvent(new CustomEvent('modal:closed'));

  if (!document.querySelector('.modal-backdrop:not([hidden])')) document.body.classList.remove('modal-open');
  const back = modalFocusStack.pop();
  if (back && document.contains(back) && typeof back.focus === 'function') back.focus();
}

let dialogCounter = 0;

/**
 * Opens a throw-away dialog and resolves when it is closed.
 *   title, bodyHtml   content
 *   actions           [{ label, value, variant: 'primary'|'danger'|'ghost', validate?(panel) }]
 *   size              'sm' | 'md' | 'lg'
 *   onOpen(panel)     wire up inputs after render
 *   collect(panel)    returns extra data included in the result
 * Resolves { action, data } — action is null when dismissed (Esc / X / backdrop).
 */
function openDialog({ title, bodyHtml = '', actions = [], size = 'md', onOpen, collect, focus, tone = '' }) {
  dialogCounter += 1;
  const id = `dialog-${dialogCounter}`;
  const titleId = `${id}-title`;

  const buttons = actions
    .map(
      (a, i) =>
        `<button type="button" class="btn ${a.variant === 'danger' ? 'btn-danger' : a.variant === 'primary' ? 'btn-primary' : 'btn-ghost'}" data-action-index="${i}">${a.label}</button>`
    )
    .join('');

  const backdrop = createModal(
    id,
    `<div class="modal-panel modal-${size} ${tone}">
       <button type="button" class="modal-close" data-dialog-close aria-label="Close dialog">${icon('x', 18)}</button>
       <h3 id="${titleId}" class="modal-title">${escapeHtml(title)}</h3>
       <div class="modal-body">${bodyHtml}</div>
       ${buttons ? `<div class="modal-actions">${buttons}</div>` : ''}
     </div>`,
    titleId
  );

  const panel = backdrop.querySelector('.modal-panel');

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      closeModal(id);
      setTimeout(() => backdrop.remove(), 0);
      resolve(result);
    };

    backdrop.addEventListener('modal:closed', () => finish({ action: null, data: {} }));
    backdrop.querySelector('[data-dialog-close]').addEventListener('click', () => finish({ action: null, data: {} }));

    backdrop.querySelectorAll('[data-action-index]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = actions[Number(btn.dataset.actionIndex)];
        if (action.validate && action.validate(panel) === false) return;
        finish({ action: action.value, data: collect ? collect(panel) : {} });
      });
    });

    if (onOpen) onOpen(panel, (result) => finish(result));
    openModal(id, focus);
  });
}

/** Styled replacement for window.confirm(). Resolves true / false. */
async function confirmDialog({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', danger = false }) {
  const { action } = await openDialog({
    title,
    size: 'sm',
    tone: danger ? 'modal-danger' : '',
    bodyHtml: `<p>${escapeHtml(message)}</p>`,
    actions: [
      { label: escapeHtml(cancelText), value: 'cancel', variant: 'ghost' },
      { label: escapeHtml(confirmText), value: 'confirm', variant: danger ? 'danger' : 'primary' },
    ],
    focus: '[data-action-index="0"]', // the safe choice is focused first
  });
  return action === 'confirm';
}

/* ------------------------------------------------------------
   Log-out confirmation
   ------------------------------------------------------------ */
function showLogoutModal() {
  confirmDialog({
    title: 'Log out of ReQuora?',
    message: 'You are about to end your session. You can log back in at any time.',
    confirmText: 'Log out',
    cancelText: 'Stay logged in',
    danger: true,
  }).then((yes) => {
    if (!yes) return;
    clearSession();
    flash('You have been logged out.', 'info');
    window.location.href = 'index.html';
  });
}

/* ------------------------------------------------------------
   BPSU Mission & Vision (opened from the footer on every page)
   ------------------------------------------------------------ */
const BPSU_VISION = 'An inclusive and sustainable University recognized for its global academic excellence by 2030.';
const BPSU_MISSION =
  'To develop innovative leaders and empowered communities by delivering ' +
  'transformative instruction, research, extension, and production through ' +
  'Change Drivers and responsive policies.';

function showVisionMissionModal() {
  openDialog({
    title: 'Mission & Vision',
    size: 'lg',
    bodyHtml: `
      <div class="vm-head"><img src="assets/bpsu-logo.png" alt="" width="56" height="56"><span>Bataan Peninsula State University</span></div>
      <div class="vm-block"><h4>Vision</h4><p>${escapeHtml(BPSU_VISION)}</p></div>
      <div class="vm-block"><h4>Mission</h4><p>${escapeHtml(BPSU_MISSION)}</p></div>`,
    actions: [{ label: 'Close', value: 'close', variant: 'primary' }],
  });
}

function wireVisionMissionLinks(root = document) {
  root.querySelectorAll('[data-modal="vision-mission"]').forEach((link) => {
    if (link.dataset.wired === 'true') return;
    link.dataset.wired = 'true';
    link.addEventListener('click', (e) => {
      e.preventDefault();
      showVisionMissionModal();
    });
  });
}
