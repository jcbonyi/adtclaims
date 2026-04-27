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

## Deploy frontend on Vercel

The repo includes [`vercel.json`](vercel.json) with **Services** entries `frontend` (Vite, `/`) and `backend` (Express, `/_/backend`), matching Vercel’s monorepo template.

**If the project framework is not “Services”:** In Vercel → Project → Settings → General, set **Root Directory** to `frontend` and **Framework Preset** to **Vite**, then you can remove `experimentalServices` and host the API separately.

1. Push this repository to GitHub and import it in [Vercel](https://vercel.com). If Vercel enables **Services** for this monorepo, keep the provided `vercel.json`.
2. In Vercel **Project → Settings → Environment Variables**, set **`VITE_API_BASE_URL`**:
   - **Combined deploy** (this repo’s `vercel.json` services): use your deployment origin plus the API prefix, e.g. `https://your-project.vercel.app/_/backend/api` (no trailing slash).
   - **API hosted elsewhere** (Railway, Render, etc.): use that URL with `/api`, e.g. `https://your-backend.up.railway.app/api`.
   Set `DATABASE_URL`, `JWT_SECRET`, and other vars from `backend/.env.example` on the Vercel project so the backend service can reach Postgres.
3. Redeploy after changing env vars so Vite picks them up at build time.

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
