/* ============================================================
   ReQuora — "doctor": checks that the backend folder is complete
   Run:  npm run doctor
   It tells you exactly what is missing instead of a stack trace.
   ============================================================ */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const problems = [];
const notes = [];

function ok(msg) {
  console.log(`  [ok]   ${msg}`);
}
function bad(msg, fix) {
  console.log(`  [FAIL] ${msg}`);
  if (fix) console.log(`         -> ${fix}`);
  problems.push(msg);
}
function warn(msg) {
  console.log(`  [warn] ${msg}`);
  notes.push(msg);
}

console.log('\nReQuora backend check\n');

// 1. Node version
const major = Number(process.versions.node.split('.')[0]);
if (major >= 18) ok(`Node.js ${process.versions.node}`);
else bad(`Node.js ${process.versions.node} is too old`, 'Install Node.js 18 or newer from https://nodejs.org');

// 2. Project files
const requiredFiles = [
  'package.json',
  'app.js',
  'server.js',
  'seed.js',
  'routes/auth.js',
  'routes/items.js',
  'routes/claims.js',
  'routes/admin.js',
  'services/itemService.js',
  'services/claimService.js',
  'services/adminService.js',
  'utils/auth.js',
  'utils/constants.js',
  'utils/db.js',
  'utils/http.js',
  'utils/imageFiles.js',
  'utils/rateLimit.js',
  'utils/serialize.js',
  'utils/upload.js',
  'utils/validate.js',
];
const missingFiles = requiredFiles.filter((f) => !fs.existsSync(path.join(root, f)));
if (!missingFiles.length) ok(`All ${requiredFiles.length} project files are present`);
else {
  bad(
    `Missing project files: ${missingFiles.join(', ')}`,
    'Extract the full ReQuora zip again into a fresh folder (do not copy files one by one).'
  );
}

// 3. Installed packages
let deps = {};
try {
  deps = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8')).dependencies || {};
} catch (e) {
  bad('package.json could not be read', 'Re-extract the project zip.');
}
const missingPkgs = Object.keys(deps).filter((name) => {
  try {
    require.resolve(`${name}/package.json`, { paths: [root] });
    return false;
  } catch (e) {
    try {
      require.resolve(name, { paths: [root] });
      return false;
    } catch (e2) {
      return true;
    }
  }
});
if (!missingPkgs.length) ok(`All ${Object.keys(deps).length} npm packages are installed`);
else bad(`Packages not installed: ${missingPkgs.join(', ')}`, 'Run:  npm install   (inside the backend folder)');

// 4. .env
const envPath = path.join(root, '.env');
if (!fs.existsSync(envPath)) {
  bad('.env file not found', 'Run:  copy .env.example .env   (Windows)  or  cp .env.example .env   (Mac/Linux)');
} else {
  ok('.env file found');
  const env = fs.readFileSync(envPath, 'utf-8');
  const secret = (/^JWT_SECRET=(.*)$/m.exec(env) || [])[1];
  if (!secret || /replace_this|change_this/.test(secret)) warn('JWT_SECRET is missing or still the placeholder (set a long random value before deploying)');
  else ok('JWT_SECRET is set');
}

// 5. Writable folders
for (const dir of ['data', 'uploads']) {
  const p = path.join(root, dir);
  try {
    fs.mkdirSync(p, { recursive: true });
    fs.accessSync(p, fs.constants.W_OK);
    ok(`"${dir}" folder is writable`);
  } catch (e) {
    bad(`"${dir}" folder is not writable`, 'Check the folder permissions.');
  }
}

console.log('');
if (problems.length) {
  console.log(`Found ${problems.length} problem(s). Fix the items marked [FAIL] above, then run this check again.\n`);
  process.exit(1);
}
console.log(notes.length ? 'The backend is ready to start (with the warnings above).\n' : 'Everything looks good. Start the server with:  npm start\n');
