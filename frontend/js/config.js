/* ============================================================
   ReQuora — deployment config
   The ONE place to point the frontend at a different backend.

   - Opened from this computer (localhost / 127.0.0.1): it talks to
     the backend on port 5000 (or the same address, when the backend
     itself is serving the site on http://localhost:5000).
   - Deployed: set PRODUCTION_BACKEND_URL below to your backend URL.
     While it still says YOUR-BACKEND-URL, the site assumes the
     backend serves the pages too (same address).
   ============================================================ */

const PRODUCTION_BACKEND_URL = 'https://YOUR-BACKEND-URL.onrender.com';

const REQUORA_CONFIG = (function () {
  const { hostname, port, protocol, origin } = window.location;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || protocol === 'file:';

  let backendOrigin;
  if (window.REQUORA_BACKEND_URL) {
    backendOrigin = window.REQUORA_BACKEND_URL; // optional manual override
  } else if (isLocal) {
    if (protocol === 'file:') backendOrigin = 'http://localhost:5000';
    else if (port === '5000') backendOrigin = origin;
    else backendOrigin = `http://${hostname}:5000`;
  } else if (PRODUCTION_BACKEND_URL.includes('YOUR-BACKEND-URL')) {
    backendOrigin = origin;
  } else {
    backendOrigin = PRODUCTION_BACKEND_URL;
  }
  backendOrigin = backendOrigin.replace(/\/+$/, '');

  return {
    // Base address of the backend (no trailing slash) — used to build photo URLs.
    ASSET_BASE: backendOrigin,
    // REST API base — everything in js/api.js calls this.
    API_BASE: `${backendOrigin}/api`,
  };
})();
