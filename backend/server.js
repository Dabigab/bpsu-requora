/* ------------------------------------------------------------
   Start-up with friendly diagnostics.
   If a file or package is missing, Node normally prints a long,
   confusing stack trace. We catch that and explain what to do.
   ------------------------------------------------------------ */
function explainMissingModule(err) {
  const match = /Cannot find module '([^']+)'/.exec(err.message || '');
  const missing = match ? match[1] : 'unknown';
  const requiredBy = Array.isArray(err.requireStack) && err.requireStack.length ? err.requireStack[0] : 'unknown file';
  const isLocalFile = missing.startsWith('.') || missing.startsWith('/') || /^[A-Za-z]:\\/.test(missing);

  console.error('\n==============================================================');
  console.error(' ReQuora could not start: something it needs is missing.');
  console.error('==============================================================');
  console.error(` Missing : ${missing}`);
  console.error(` Needed by: ${requiredBy}\n`);

  if (isLocalFile) {
    console.error(' This is one of ReQuora\'s OWN files, so it is missing from your folder');
    console.error(' (usually a partly extracted zip, or a file that was moved or renamed).');
    console.error(' Fix: extract the full project zip again into a fresh folder, then run');
    console.error('      npm install   and   npm start   inside the "backend" folder.');
    console.error(' Check with:  npm run doctor');
  } else {
    console.error(' This is an npm package that has not been installed in this folder.');
    console.error(' Fix: open a terminal in the "backend" folder and run');
    console.error('      npm install');
    console.error(' Then start again with:  npm start');
  }
  console.error('');
}

let createApp;
let db;
let bcrypt;
try {
  require('dotenv').config();
  bcrypt = require('bcryptjs');
  db = require('./utils/db');
  createApp = require('./app');
} catch (err) {
  if (err && err.code === 'MODULE_NOT_FOUND') {
    explainMissingModule(err);
    process.exit(1);
  }
  throw err;
}

const { assertAuthConfig } = require('./utils/auth');

const PORT = Number(process.env.PORT) || 5000;

async function seedAdmin() {
  db.ensureDB();
  const email = (process.env.ADMIN_EMAIL || 'admin@bpsu.edu.ph').toLowerCase();
  if (!db.findUserByEmail(email)) {
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    db.createUser({
      name: process.env.ADMIN_NAME || 'BPSU Lost and Found Admin',
      email,
      studentId: null,
      passwordHash,
      role: 'admin',
    });
    console.log(`Created the admin account: ${email}`);
    if (!process.env.ADMIN_PASSWORD) {
      console.warn('[ReQuora] Using the default admin password. Set ADMIN_PASSWORD in .env before going live.');
    }
  }
}

async function start() {
  assertAuthConfig(); // stops here with a clear message if production is misconfigured
  await seedAdmin();

  const app = createApp();
  const server = app.listen(PORT, () => {
    console.log(`ReQuora API running on http://localhost:${PORT}`);
    console.log(`Open the website at http://localhost:${PORT} (health check: /api/health)`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\nPort ${PORT} is already in use. Close the other program using it,`);
      console.error('or set a different PORT in backend/.env (for example PORT=5001).\n');
    } else {
      console.error('Server error:', err);
    }
    process.exit(1);
  });

  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err) => {
  console.error('\nReQuora failed to start:', err.message);
  process.exit(1);
});

// A bug in one request must never take the whole server down silently.
process.on('unhandledRejection', (reason) => console.error('[ReQuora] Unhandled promise rejection:', reason));
