# Insurance Claims Tracking System

Full-stack web application for managing insurance claims across insurers and claim types, replacing an Excel-based register with a real-time multi-user workflow.

## Stack

- Frontend: React + Tailwind CSS + Recharts (`frontend`)
- Backend: Node.js + Express + PostgreSQL (`backend`)
- Auth: JWT with role support (`Admin`, `Claims Officer`, `Read-Only`)

## Core Features Implemented

- Claims register with filters, pagination, sorting, global search, row aging color cues, inline status update, and quick remark add
- Claim detail form for create/edit with append-only remarks and status transition history
- Overall dashboard with KPI cards and charts (status, insurer, aging)
- Insurer dashboard section with insurer-specific KPIs, status breakdown, and worst-aging open claims
- Operations dashboard with alert panels:
  - Pending Assessment
  - Stuck >7 Days
  - Pending Documents
  - Not Released
- CSV export endpoint and UI trigger
- Excel import endpoint with warning flags for invalid/incomplete rows

## Business Rule Coverage

- `Days Open` is calculated from `Date Reported to Broker (ADT)` to current date, or to closure date for closed claims
- Aging buckets auto-derived: `0-7`, `8-14`, `15-30`, `30+`
- Closed statuses (`Closed`, `Repudiated`, `Declined`, `Paid`) set/hold closure date and stop day counting
- Remarks are append-only (`claim_remarks` table)
- Status changes are auto-logged (`claim_status_history` table)

## Backend Setup

1. Create PostgreSQL database (default expected name: `claims_tracking`).
2. Copy environment file:
   - `cp backend/.env.example backend/.env` (or create manually on Windows)
3. Update `backend/.env` values (`DATABASE_URL`, `JWT_SECRET`, `ADMIN_RESET_KEY`).
4. Install and run:

```bash
cd backend
npm install
npm run dev
```

The server initializes required tables automatically on startup.

If `DATABASE_URL` is unavailable, backend falls back to an in-memory Postgres-compatible database and persists local snapshots to `backend/.persist/in-memory-db-snapshot.json` so data survives restarts in local development.

## Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on Vite and proxies `/api` to `http://localhost:4000`.

## Self-hosted on your own domain (no Vercel)

Use any VPS or dedicated server (Ubuntu, Debian, etc.) with a domain pointing at it (**A** / **AAAA** records).

**Step-by-step (cPanel / subdomain example):** see [`deploy/STEP-BY-STEP-CPANEL.md`](deploy/STEP-BY-STEP-CPANEL.md) — includes `claims.adtinsurance.co.ke`-style setup, why “copy files only” is not enough, Postgres, Node/PM2, `dist` deploy, and Apache `/api` proxy.

### 1. PostgreSQL

Create a database and user. Set `DATABASE_URL` in `backend/.env` (for example `postgres://user:pass@127.0.0.1:5432/claims_tracking`). For production, avoid relying on the in-memory fallback; use a real Postgres instance.

### 2. Backend API

On the server:

```bash
cd /var/www/claims/backend   # or your path
npm ci --omit=dev
```

Create `backend/.env` with at least `PORT=4000`, `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `ADMIN_RESET_KEY`. Bind the API to localhost only (default); the reverse proxy will expose `/api` publicly.

Run with **systemd** or **PM2**, for example:

```bash
cd /var/www/claims/backend
NODE_ENV=production PORT=4000 node src/index.js
```

PM2 example: `pm2 start src/index.js --name claims-api --cwd /var/www/claims/backend`

### 3. Frontend (static build)

The SPA defaults to **`baseURL: /api`**, which matches same-origin hosting (no `VITE_API_BASE_URL` needed):

```bash
cd /var/www/claims/frontend
npm ci
npm run build
```

Deploy the contents of `frontend/dist/` to the directory your web server uses (see sample nginx config below).

### 4. Reverse proxy + HTTPS

Use **nginx** or **Caddy**. A minimal **nginx** layout:

- Serve `frontend/dist` as static files.
- Proxy **`/api`** to `http://127.0.0.1:4000` (Express already mounts routes under `/api`).

See [`deploy/nginx.sample.conf`](deploy/nginx.sample.conf). Replace `YOUR_DOMAIN`, adjust `root` to your `dist` path, install TLS (e.g. **Certbot** with Let’s Encrypt), then `nginx -t` and reload.

**cPanel / WHM + Apache:** Your stack matches this pattern: **httpd (Apache)** for the site, **PostgreSQL** for the app DB. cPanel **Server Information** often shows **MariaDB** as the default “database version”; that is normal—this app still needs a **Postgres** database (create one in cPanel if **PostgreSQL Databases** is available, or use a managed Postgres URL in **`DATABASE_URL`**). The app does **not** use MariaDB/MySQL. Enable **`mod_proxy`** / **`mod_proxy_http`** if needed, then see [`deploy/apache.sample.conf`](deploy/apache.sample.conf): `DocumentRoot` → `frontend/dist`, **`ProxyPass /api`** → your Node process (e.g. `http://127.0.0.1:4000/api`). Run Node via SSH (**PM2**, **systemd**, or cPanel **Node.js App** / **Application Manager** if your host provides it). **Shared hosting** (e.g. a package on a **shared IP** with **CloudLinux**): confirm the plan allows **long-running Node**, **SSH**, and **reverse proxy** rules—some Web_* plans only serve PHP/static unless you upgrade or use a **VPS**. **Disk space:** if root (`/`) is near full (e.g. 90%), free space before deploys or logs may fail.

### 5. DNS

Point your domain (or subdomain, e.g. `claims.example.com`) to the server’s public IP. After HTTPS works, open the site and complete **bootstrap admin** (or use your existing DB).

## Deploy frontend on Vercel

The repo includes [`vercel.json`](vercel.json) with **Services** entries `frontend` (Vite, `/`) and `backend` (Express, `/_/backend`), matching Vercel’s monorepo template.

**If the project framework is not “Services”:** In Vercel → Project → Settings → General, set **Root Directory** to `frontend` and **Framework Preset** to **Vite**, then you can remove `experimentalServices` and host the API separately.

1. Push this repository to GitHub and import it in [Vercel](https://vercel.com). If Vercel enables **Services** for this monorepo, keep the provided `vercel.json`.
2. In Vercel **Project → Settings → Environment Variables**, set **`VITE_API_BASE_URL`**:
   - **Combined deploy** (this repo’s `vercel.json` services): use your deployment origin plus the API prefix, e.g. `https://your-project.vercel.app/_/backend/api` (no trailing slash).
   - **API hosted elsewhere** (Railway, Render, etc.): use that URL with `/api`, e.g. `https://your-backend.up.railway.app/api`.
   Set `DATABASE_URL`, `JWT_SECRET`, and other vars from `backend/.env.example` on the Vercel project so the backend service can reach Postgres.
3. Redeploy after changing env vars so Vite picks them up at build time.

## Custom domain (go live)

Use your own domain (e.g. `claims.example.com` or `example.com`) with the same Vercel project.

1. **Add the domain in Vercel**  
   Project → **Settings** → **Domains** → enter your domain → follow the prompts. Vercel issues HTTPS automatically once DNS is correct.

2. **DNS at your registrar**  
   Use the records Vercel shows after you add the domain. Typical patterns:
   - **Subdomain** (e.g. `app.example.com`): **CNAME** to `cname.vercel-dns.com` (or the target Vercel gives you).
   - **Apex** (`example.com`): use the **A** records (or registrar **ALIAS/ANAME**) that Vercel shows for your project—do not guess IPs.

3. **Point the frontend at the API on that domain**  
   After the domain works, set **`VITE_API_BASE_URL`** for **Production** (and Preview if you use it) to the **HTTPS** API base your users will hit:
   - **Both services on this Vercel project:**  
     `https://YOUR_DOMAIN/_/backend/api`  
     (replace `YOUR_DOMAIN` with `claims.example.com` or `example.com`, no trailing slash.)
   - **API on another host** (Railway, Render, `api.example.com`, etc.):  
     `https://your-api-host.example.com/api`

   Save, then trigger a **new deployment** of the frontend (env is applied at build time).

4. **Backend env on Vercel**  
   Keep **`DATABASE_URL`**, **`JWT_SECRET`**, **`ADMIN_RESET_KEY`**, etc. on the backend service. No code change is required for a custom domain if URLs above are consistent.

5. **Optional: `www`**  
   Add both `example.com` and `www.example.com` in Vercel Domains if you want both; set one as the redirect target in Vercel so you have a single canonical URL, then use that canonical host in **`VITE_API_BASE_URL`**.

## API Highlights

- `POST /api/auth/bootstrap-admin` create first admin account
- `POST /api/auth/login` login
- `POST /api/auth/reset-admin-password` reset admin password using `ADMIN_RESET_KEY`
- `POST /api/auth/change-password` user password change (clears forced-change flag)
- `GET /api/users` admin user listing
- `PATCH /api/users/:id/role` admin role update
- `PATCH /api/users/:id/status` admin activate/deactivate user
- `POST /api/users/:id/reset-password` admin reset user password (forces next login change)
- `DELETE /api/users/:id` admin delete user
- `GET /api/users/audit` admin user audit trail
- `GET /api/claims` list/search/filter claims
- `POST /api/claims` create claim
- `PUT /api/claims/:id` update claim
- `PATCH /api/claims/:id/status` inline status update + optional remark
- `POST /api/claims/:id/remarks` append remark
- `GET /api/dashboard/overall`
- `GET /api/dashboard/insurer?insurer=...`
- `GET /api/dashboard/operations`
- `POST /api/claims/import-excel` import register from Excel
- `GET /api/claims-export.csv` export all claims as CSV

## Suggested Next Steps (Phase 2)

- Add file attachments (documents/photos)
- Add scheduler for 14-day/30-day escalation notifications (email/SMS)
- Add richer role-based data visibility controls
- Add automated tests (API + UI smoke tests)
