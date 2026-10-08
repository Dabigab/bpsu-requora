# ReQuora — BPSU Digital Lost & Found

Report, search and recover lost belongings across Bataan Peninsula State University.
Node.js + Express API (JSON-file database) and a plain HTML/CSS/JS frontend (no build step).

```
requora/
├── backend/        Express API
│   ├── routes/     thin HTTP layer (validation errors, status codes, auth guards)
│   ├── services/   business rules (items, claims, admin) — no Express, easy to test
│   ├── utils/      db (atomic JSON store), auth (JWT), upload checks, serializers, constants
│   ├── scripts/    doctor.js  (npm run doctor — checks your setup)
│   ├── tests/      node:test suites
│   └── seed.js     demo data
├── frontend/       static site (index, browse, item, report, login, register, dashboard, admin)
└── docker-compose.yml
```

## Run it (Windows / Mac / Linux)

Needs **Node.js 18 or newer** (https://nodejs.org).

```bash
cd backend
npm install            # first time only
npm run doctor         # optional: checks Node version, files, packages, .env
copy .env.example .env # Windows   (Mac/Linux: cp .env.example .env)  — skip if .env already exists
npm start
```

Open **http://localhost:5000** — the backend also serves the website, so this is all you need.
The first start creates `data/db.json` and the admin account from `.env`
(default `admin@bpsu.edu.ph` / `Admin@123` — change it in `.env` before real use).

If `npm start` says `Cannot find module './routes/...'`, the folder was only partly extracted.
Delete it, extract the **whole** zip again, then `npm install` and `npm start`.

### Demo data

```bash
cd backend
npm run seed
```

Wipes `data/db.json` and loads an admin, three demo users (password `Demo@1234`:
`maria.santos@`, `juan.delacruz@`, `ana.reyes@bpsu.edu.ph`), eight reports and three claims.

### Tests

```bash
cd backend
npm test
```

`services.test.js` and `utils.test.js` need no extra packages. `api.test.js` uses `supertest`
(installed by `npm install`) and drives every endpoint over real HTTP against a temporary database.

### Running the frontend separately

Normally unnecessary. To serve `frontend/` from another host, set `CORS_ORIGIN` on the backend and
set `PRODUCTION_BACKEND_URL` in `frontend/js/config.js`. Locally, any static server works
(`cd frontend && python -m http.server 5500`); the site then talks to the backend on port 5000.

## Configuration (`backend/.env`)

| Variable | Purpose |
|---|---|
| `PORT` | default 5000 |
| `JWT_SECRET` | **required in production** — long random string; in development a random one is used (logins end on restart) |
| `JWT_EXPIRES_IN` | default `7d` |
| `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | admin created on first start |
| `CORS_ORIGIN` | comma-separated websites allowed to call the API (unset = open, for local development) |
| `SERVE_FRONTEND` | serve `../frontend` from the backend (default yes) |
| `TRUST_PROXY` | `1` behind Render/Railway/nginx so rate limiting sees real IPs |

## How it works

**Statuses** (same in backend and frontend): `pending_verification` → `lost` / `found` → `claimed` → `returned`, or `closed`.
New reports start as *Pending Verification*; an admin verifies them. Old databases are migrated automatically.

**Claims**: `pending` → `approved` / `rejected` → `completed`, or `cancelled` by the claimant.
You cannot claim your own report, claim twice, or claim a returned/closed item. Only admins decide claims.
Appointments are weekdays 8:00–16:30 (Philippine time).

**Privacy**: guests see only a shortened reporter name ("Maria S."). Contact details go to the reporter,
admins and an approved claimant. Proof of ownership is visible to the claimant and admins only.

### API

All responses: `{ "success": true, "data": …, "message"? }` or `{ "success": false, "error": "CODE", "message": "…", "fields"? }`.

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health`, `/api/meta`, `/api/stats` | — | health, categories/limits, public counts |
| POST | `/api/auth/register`, `/api/auth/login` | — | create account / log in |
| GET, PUT | `/api/auth/me` | user | read / update profile |
| PUT | `/api/auth/password` | user | change password |
| GET | `/api/items` | optional | feed (`q,type,category,status,location,dateFrom,dateTo,sort,page,limit`) |
| GET | `/api/items/mine` | user | my reports |
| GET | `/api/items/:id` | optional | details + claim state for the viewer |
| POST | `/api/items` | user | report (multipart, optional `image`) |
| PUT, DELETE | `/api/items/:id` | owner/admin | edit / close / delete |
| POST | `/api/claims` | user | file a claim + appointment |
| GET | `/api/claims/mine`, `/api/claims/item/:itemId` | user / reporter or admin | |
| PUT | `/api/claims/:id/cancel` | claimant | cancel while pending |
| GET, PUT | `/api/claims`, `/api/claims/:id` | admin | list, approve/reject/complete |
| GET | `/api/admin/stats`, `/items`, `/users` | admin | dashboard data |
| POST | `/api/admin/items/:id/verify` | admin | verify a report |
| PUT, DELETE | `/api/admin/items/:id/status`, `/api/admin/items/:id` | admin | change status / delete |

## Security notes

Passwords hashed with bcrypt; JWT carries only the user id and role, and the server re-loads the user
on every request (deleted users and role changes take effect immediately). Admin routes check the role on
the server. Uploads: JPG/PNG/WEBP/GIF only, 5 MB, verified by file signature, stored under generated names,
removed when a report is deleted. Login, registration, reports and claims are rate limited.
Error responses never include stack traces.

## Docker

`docker compose up --build` → API on :5000, static site on :8080. Change `JWT_SECRET` and
`ADMIN_PASSWORD` in `docker-compose.yml` first.

## Known limits

- The JSON-file database suits a campus pilot, not many servers; swap `backend/utils/db.js` for a real
  database to scale (everything else only uses its exported functions).
- Rate limiting is in memory (resets on restart, per process).
- No email notifications; claim status is shown in the dashboard.
