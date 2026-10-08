/* ReQuora — login and register pages (one script, picks the form it finds) */

const byId = (id) => document.getElementById(id);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PASSWORD_RULES = {
  len: (p) => p.length >= 8 && p.length <= 72,
  letter: (p) => /[A-Za-z]/.test(p),
  digit: (p) => /\d/.test(p),
};

function goAfterAuth() {
  const next = safeNext(new URLSearchParams(window.location.search).get('next'));
  window.location.href = next;
}

// Keeps the ?next= target when moving between login and register.
function carryNextToLinks() {
  const next = new URLSearchParams(window.location.search).get('next');
  if (!next) return;
  ['to-register', 'to-login'].forEach((id) => {
    const a = byId(id);
    if (a) a.href = `${a.getAttribute('href').split('?')[0]}?next=${encodeURIComponent(next)}`;
  });
}

function wirePasswordRules() {
  const list = byId('pw-rules');
  const input = byId('password');
  if (!list || !input) return;
  const update = () => {
    list.querySelectorAll('[data-rule]').forEach((li) => {
      const ok = PASSWORD_RULES[li.dataset.rule](input.value);
      li.classList.toggle('ok', ok);
      li.dataset.state = ok ? 'ok' : 'todo';
    });
  };
  input.addEventListener('input', update);
  update();
}

async function submitAuth(form, path, payload, loadingText) {
  const msg = byId('form-msg');
  const btn = byId('submit-btn');
  setFormMessage(msg, '');
  setLoading(btn, true, loadingText);
  try {
    const data = await apiRequest(path, { method: 'POST', body: payload });
    setSession(data.token, data.user);
    flash(path.endsWith('register') ? `Welcome to ReQuora, ${data.user.name.split(' ')[0]}!` : `Welcome back, ${data.user.name.split(' ')[0]}!`, 'success');
    goAfterAuth();
  } catch (err) {
    setLoading(btn, false);
    const orphan = showFieldErrors(form, err.fields);
    setFormMessage(msg, orphan[0] || err.message, 'error');
  }
}

function initLogin(form) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearFieldErrors(form);
    const email = byId('email').value.trim();
    const password = byId('password').value;
    const errors = {};
    if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address.';
    if (!password) errors.password = 'Enter your password.';
    if (Object.keys(errors).length) {
      showFieldErrors(form, errors);
      return;
    }
    submitAuth(form, '/auth/login', { email, password }, 'Logging in…');
  });
}

function initRegister(form) {
  wirePasswordRules();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearFieldErrors(form);
    const name = byId('name').value.trim();
    const email = byId('email').value.trim();
    const password = byId('password').value;
    const errors = {};
    if (name.length < 2) errors.name = 'Enter your full name (at least 2 characters).';
    if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address.';
    if (!Object.values(PASSWORD_RULES).every((rule) => rule(password))) {
      errors.password = 'Use 8 to 72 characters with at least one letter and one number.';
    }
    if (Object.keys(errors).length) {
      showFieldErrors(form, errors);
      return;
    }
    const payload = { name, email, password, role: byId('role').value };
    const studentId = byId('studentId').value.trim();
    if (studentId) payload.studentId = studentId;
    submitAuth(form, '/auth/register', payload, 'Creating account…');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initLayout(document.getElementById('login-form') ? 'login' : 'register');

  // Already logged in: no reason to see the form again.
  if (getToken() && getCurrentUser()) {
    goAfterAuth();
    return;
  }

  const isLogin = !!byId('login-form');
  const slot = byId('password-slot');
  slot.innerHTML = passwordFieldHtml({
    id: 'password',
    label: 'Password',
    placeholder: isLogin ? 'Your password' : 'Create a password',
    autocomplete: isLogin ? 'current-password' : 'new-password',
  });
  wirePasswordToggles(slot);
  carryNextToLinks();

  if (isLogin) initLogin(byId('login-form'));
  else initRegister(byId('register-form'));
});
