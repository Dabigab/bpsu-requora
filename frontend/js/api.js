/* ============================================================
   ReQuora — API client + session
   Every backend response looks like
     { success: true, data, message }   or
     { success: false, error, message, fields? }
   apiRequest() unwraps that, so pages just get the `data`.
   ============================================================ */

const API_BASE = REQUORA_CONFIG.API_BASE;

const SESSION_TOKEN_KEY = 'requora_token';
const SESSION_USER_KEY = 'requora_user';

/* ---------- Session (localStorage) ---------- */
function getToken() {
  try {
    return localStorage.getItem(SESSION_TOKEN_KEY);
  } catch (e) {
    return null;
  }
}

function getCurrentUser() {
  try {
    const raw = localStorage.getItem(SESSION_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    // corrupted value: treat as logged out instead of breaking every page
    clearSession();
    return null;
  }
}

function setSession(token, user) {
  try {
    localStorage.setItem(SESSION_TOKEN_KEY, token);
    localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
  } catch (e) {
    console.warn('Could not save the session (storage unavailable).');
  }
}

function updateStoredUser(user) {
  try {
    localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
  } catch (e) {
    /* ignore */
  }
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_TOKEN_KEY);
    localStorage.removeItem(SESSION_USER_KEY);
  } catch (e) {
    /* ignore */
  }
}

/* ---------- Errors ---------- */
class ApiClientError extends Error {
  constructor(status, code, message, fields, payload) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status; // 0 = could not reach the server
    this.code = code;
    this.fields = fields || {};
    this.payload = payload || null;
  }
}

let sessionExpiredHandled = false;

// A stored token that the server rejects means the session ended.
function handleSessionExpired(message) {
  if (sessionExpiredHandled) return;
  sessionExpiredHandled = true;
  clearSession();
  try {
    sessionStorage.setItem('requora_flash', JSON.stringify({ message: message || 'Your session has expired. Please log in again.', type: 'error' }));
  } catch (e) {
    /* ignore */
  }
  const here = window.location.pathname.split('/').pop() + window.location.search;
  window.location.href = `login.html?next=${encodeURIComponent(here)}`;
}

/* ---------- Requests ---------- */
async function apiRequest(path, { method = 'GET', body, auth = false, isForm = false, query } = {}) {
  const headers = { Accept: 'application/json' };
  if (!isForm && body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let url = `${API_BASE}${path}`;
  if (query) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.set(k, v);
    });
    const qs = params.toString();
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  }

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch (networkError) {
    throw new ApiClientError(0, 'NETWORK_ERROR', 'Cannot reach the ReQuora server. Check your connection and that the backend is running.');
  }

  let payload = null;
  try {
    payload = await res.json();
  } catch (e) {
    /* non-JSON response (for example an HTML error page) */
  }

  if (!res.ok || (payload && payload.success === false)) {
    const code = (payload && payload.error) || 'REQUEST_FAILED';
    const message = (payload && payload.message) || `The request failed (${res.status}).`;
    if (res.status === 401 && auth && (code === 'TOKEN_EXPIRED' || code === 'INVALID_TOKEN')) {
      handleSessionExpired(message);
    }
    throw new ApiClientError(res.status, code, message, payload && payload.fields, payload);
  }

  if (!payload || payload.success !== true) {
    throw new ApiClientError(res.status, 'BAD_RESPONSE', 'The server sent an unexpected response.');
  }
  const data = payload.data === undefined ? {} : payload.data;
  Object.defineProperty(data, '__message', { value: payload.message || '', enumerable: false });
  return data;
}

/* ---------- Short helpers used by the pages ---------- */
const api = {
  get: (path, query, auth = false) => apiRequest(path, { query, auth }),
  post: (path, body, auth = false) => apiRequest(path, { method: 'POST', body, auth }),
  put: (path, body, auth = true) => apiRequest(path, { method: 'PUT', body, auth }),
  del: (path) => apiRequest(path, { method: 'DELETE', auth: true }),
  upload: (path, formData) => apiRequest(path, { method: 'POST', body: formData, isForm: true, auth: true }),
};
