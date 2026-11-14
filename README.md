# Baho Coffee — Information Management System

Replaces Baho Coffee's per-station Excel workbooks: cherry reception from
farmers, CWS wet processing (estimate vs actual), HQ dry mill and export,
and the per-CWS cash/expense ledger, with farmer-to-export traceability.

```
baho IMS/
├── backend/     Django 5.2 + Django REST Framework + PostgreSQL (the API)
├── frontend/    React 19 + TypeScript + Vite + Mantine (the web app)
├── docs/        notes; docs/legacy holds the superseded Supabase/PowerSync config
└── scripts/     db.ps1 (local Postgres), dev-env.sh (portable Node/Postgres paths)
```

## Status

| Part | State |
|---|---|
| Backend: `core`, `organization`, `accounts` | Done: email + JWT login, roles per facility, facilities, crop years, address tree, Django admin, 18 tests |
| Backend: farmers, reception, inventory, processing, finance, labor, drymill, sales, reporting, imports, notifications | App skeletons only: next to build, translating `backend/legacy/sql/` |
| Frontend: sign-in | Real login against the database (JWT), session kept across reloads, pages protected, menu limited by role (CWS roles → CWS, HQ dry mill/export → Dry Mill, ADMIN/HQ finance → both) |
| Frontend: business screens | Still on mock data; switch to the API screen by screen |

## Running it locally (Windows, no admin rights needed)

### 1. Database (portable PostgreSQL 17 in `~/tools`)

Run one command at a time:

```powershell
.\scripts\db.cmd start      # start Postgres (needed after every reboot)
.\scripts\db.cmd status     # check it is running
.\scripts\db.cmd tables     # list tables and row counts
.\scripts\db.cmd psql       # SQL shell (type \q to quit)
.\scripts\db.cmd pgadmin    # graphical tool: add server localhost:5432, user/pass postgres
.\scripts\db.cmd stop       # stop Postgres
```

`db.cmd` wraps `db.ps1` so it works even though this machine blocks
PowerShell scripts (execution policy).

### 2. Backend → http://localhost:8000

```powershell
cd backend
.venv\Scripts\activate                     # first time: python -m venv .venv; pip install -r requirements/dev.txt
copy .env.example .env                      # first time only, then set DJANGO_SECRET_KEY
python manage.py migrate
python manage.py seed_dev                   # dev data: 5 facilities, crop year 2026, 7 users
python manage.py runserver
```

- API docs (Swagger): http://localhost:8000/api/docs/
- Django admin: http://localhost:8000/admin/ (`admin@baho.local` / `BahoDev2026!`)
- Tests: `pytest` · Lint: `ruff check .` · Format: `ruff format .`

Dev users created by `seed_dev` (all with password `BahoDev2026!`):

| Email | Role | Facility |
|---|---|---|
| admin@baho.local | ADMIN | all |
| hq.finance@baho.local | HQ_FINANCE | all |
| drymill@baho.local | HQ_DRY_MILL_OPERATOR | all |
| export@baho.local | HQ_EXPORT_MANAGER | all |
| clerk.gitoki@baho.local | CWS_CLERK | GITOKI |
| manager.gitoki@baho.local | CWS_MANAGER | GITOKI |
| clerk.bugoyi@baho.local | CWS_CLERK | BUGOYI |

### 3. Frontend → http://localhost:5173

```powershell
cd frontend
$env:PATH="$HOME\tools\node;$env:PATH"; $env:NODE_EXTRA_CA_CERTS="$HOME\tools\ca-bundle.pem"
npm install
npm run dev          # /api is proxied to the Django server on :8000
```

## Backend conventions

Each domain app in `backend/baho/<app>/` has:

- `models.py`: tables. Transactional models extend `AuditedModel` (UUID id, created/updated by, device id, soft delete).
- `services.py`: **all writes**, each multi-row write in `transaction.atomic`.
- `selectors.py`: **all reads/queries**.
- `api/`: thin serializers, views and urls that call services/selectors.
- `tests/`: pytest; shared fixtures in `backend/conftest.py`.

Access control lives in `baho/core/access.py` (roles + facility scoping) and
`baho/core/mixins.py` (`FacilityScopedViewSetMixin`). A station clerk only
sees their own station; ADMIN and HQ roles see everything. JWT claims are
for the UI only: the server always re-checks roles from the database.

## Reference material

- `backend/legacy/sql/`: original Postgres schema design (all modules). It ran
  cleanly on Postgres 17 except `0006_rls.sql` (Supabase-only `auth.uid()`).
  Use it as the spec when writing the remaining Django models.
- `backend/legacy/excel_migration/`: Excel → SQL import script (to be ported to `baho/imports`).
