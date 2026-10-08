const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const itemRoutes = require('./routes/items');
const adminRoutes = require('./routes/admin');
const claimRoutes = require('./routes/claims');

const { ok, notFoundHandler, errorHandler } = require('./utils/http');
const { UPLOAD_DIR } = require('./utils/imageFiles');
const adminService = require('./services/adminService');
const C = require('./utils/constants');

const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

// CORS_ORIGIN="https://my-site.netlify.app,https://other.example" restricts
// which websites may call the API. Unset = open (fine for local development).
function corsOptions() {
  const raw = process.env.CORS_ORIGIN;
  if (!raw) return {};
  const allowed = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return {
    origin(origin, cb) {
      // Requests with no Origin header (curl, same-origin) are always fine.
      if (!origin || allowed.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
  };
}

function createApp({ serveFrontend } = {}) {
  const app = express();

  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(cors(corsOptions()));
  app.use(express.json({ limit: '100kb' }));

  // Uploaded photos. Plain files only; never directory listings or dotfiles.
  app.use(
    '/uploads',
    express.static(UPLOAD_DIR, { dotfiles: 'deny', index: false, maxAge: '7d' })
  );

  // ---- API ----
  app.get('/api/health', (req, res) => ok(res, { status: 'ok', service: 'ReQuora API' }));

  // The lists the frontend uses for dropdowns/badges — one source of truth.
  app.get('/api/meta', (req, res) =>
    ok(res, {
      categories: C.CATEGORIES,
      itemTypes: C.ITEM_TYPES,
      itemStatuses: C.ITEM_STATUSES,
      claimStatuses: C.CLAIM_STATUSES,
      limits: C.LIMITS,
    })
  );

  // Public totals for the home page (counts only, nothing personal).
  app.get('/api/stats', (req, res) => ok(res, { stats: adminService.publicStats() }));

  app.use('/api/auth', authRoutes);
  app.use('/api/items', itemRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/claims', claimRoutes);

  // ---- Frontend (optional) ----
  // When the frontend folder sits next to this one, serve it too, so
  // http://localhost:5000 shows the whole site with a single command.
  const shouldServe =
    serveFrontend !== undefined
      ? serveFrontend
      : process.env.SERVE_FRONTEND !== 'false' && fs.existsSync(path.join(FRONTEND_DIR, 'index.html'));
  if (shouldServe) app.use(express.static(FRONTEND_DIR, { index: 'index.html' }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
