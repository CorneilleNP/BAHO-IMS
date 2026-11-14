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
| Accounts & organization | Email + JWT login, roles per station, facilities, crop years |
| Farmers & cherry reception | Register farmers (auto code), record GRNs with Good/Float lines (auto GRN number) |
| CWS processing | Register processes with grade estimate ratios; lots with fixed estimates, actuals, out-turn |
| HQ dry mill | Partner suppliers, stock receipts (pure weight by the DB), parchment → green batches |
| Export | Clients, shipments with product lines, status |
| Dashboards | Stock / processing / export summaries calculated by the server from real records |
| Not built yet | Cash ledger & expenses (`finance`), casual labor (`labor`), stock ledger (`inventory`), Excel import (`imports`), SMS (`notifications`) |

**No mock data.** The frontend reads and writes only through the API. `seed_dev`
loads configuration only (stations, users, export grades, Gitoki's real Fully
Washed ratios); every farmer, GRN, lot, stock receipt, batch and shipment is
registered through the screens. 52 backend tests.

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
- Start over with empty data: `python manage.py reset_dev_data --yes` (dev only:
  deletes all registered records and restarts GRN/lot/batch numbering, keeps users and configuration)

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

## Rwanda locations (one shared hierarchy)

All 5 provinces, 30 districts, 416 sectors, 2,149 cells and 14,837 villages
are loaded by migration into `organization.AdminUnit` (data:
`backend/baho/organization/data/`, MIT, see `NOTICE.txt`). Farmers, suppliers
and stations each store **one** `location` (the most precise unit known: a
village, or just a district) and the API returns `location_path` +
`location_label` for display. Use `LocationFieldsMixin` for any new model with
a location; never add free-text province/district columns.

## Processes (5) and sub-processes

Baho runs five processes: Fully Washed, Anaerobic Fully Washed, Normal Natural,
Anaerobic Natural, Honey & Honey Anaerobic. Every other label ("WASHED NO 1",
"ECLIPSE NAT"…) is a **sub-process** of one of them. New labels (from imports or
the "+" in the receipt wizard) start *Not assigned*; on **Dry Mill › Processes**
select them and assign them to a process (or "Use suggestions"), merge spelling
duplicates (the other names become aliases), rename or deactivate. Stock
receipts follow their sub-process.

## HQ stock: every sheet column + stock deduction

A stock receipt holds every column of the BAHO STOCK UPDATE sheet. Its stock
position is **calculated, never typed**:

    balance = pure weight − kg taken by dry mill batches + adjustments

- A dry mill batch says what was milled (process, optionally sub-process /
  grade / source, and kg). It is deducted from the **available stock** for that
  selection automatically, oldest accepted parchment first; nobody picks
  receipts, and it can never take more than is available.
- Processing status (Not started / Partially processed / Completed) and
  processing date follow automatically.
- Corrections after milling are **stock adjustments** with a reason; weights lock.
- Voiding a batch gives its stock back; a receipt with movements can't be voided.
- Shipments can't exceed the green coffee in stock per grade.
- Every change to a receipt or batch is in its history (who, when, old → new).

### Importing the sheet

```powershell
cd backend
.venv\Scripts\python.exe manage.py import_stock_update "..\dataset\<file>.csv"            # dry run + report
.venv\Scripts\python.exe manage.py import_stock_update "..\dataset\<file>.csv" --commit --user admin@baho.local
```

Rules: Ngororero is always Baho; other BAHO sources become CWS stations,
PARTNER/UBUNTU/AGRINOS become suppliers (Kayenzi → Agrinos Ltd); FLOOT→FLOAT,
HHPC→HPC; blank quality → Pending. The sheet is receipts only: the columns
"Processing Status", "Processing Date", "Stock processed (Kg)" and "Stock Balance (Kg)"
are ignored (added by mistake); stock is only deducted by dry mill batches /
the processing report.
Re-running skips rows already imported. **`reset_dev_data` deletes imported
receipts too** — re-import afterwards.

## Voiding records

GRNs, processing lots (unless closed), stock receipts, dry mill batches and
planned shipments can be **voided** with a mandatory reason
(`POST …/<id>/void/`). Voiding is a soft delete: the record leaves lists and
dashboard totals, stays in the database with `void_reason` for audit, and its
number is never reused. Nothing is ever hard-deleted from the app.

## Frontend shared components (`frontend/src/components`, `frontend/src/lib`)

| Use | Instead of |
|---|---|
| `PageHeader` | hand-made title rows |
| `DataTable` (skeleton, error and empty state built in) | raw `<Table>` lists |
| `TableSkeleton`, `ChartSkeleton`, `FormSkeleton`, `PageSkeleton`, `KpiCard loading` | spinners |
| `LocationPicker` (Province → … → Village, with village search) | location text inputs |
| `StationSelect` + `useMyStations()` | per-page station dropdowns |
| `SourceSelect` + `sourceFields()` | per-page CWS/supplier dropdowns |
| `ChartCard` | per-page bar charts |
| `toast.success / error` (bottom-right) | success banners |
| `ErrorMessage` (form validation), `EmptyState` | ad-hoc alerts |
| `FormWizard` + `useDraft` (steps, checks, review, draft kept) | long single-page forms |
| `ProcessPicker` (5 processes → sub-process, add new) | free-text process names |
| `DateRangeFilter` (Today, Last 7 days, This month, Last month, This season) | separate from/to inputs |
| `DataTable exportName` + `fetchAll` → **Export ▸ Excel (.xlsx) / CSV** of every row matching the filters | copy-paste to Excel |
| `confirmAction({ … requireReason })`, `VoidButton` | deleting without asking |
| `useApi` / `useList` / `query()` | `fetch` in components |
| `useSubmit` (`run`, `fail`, `saving`, `error`) | per-form saving/error state |

## Reference material

- `backend/legacy/sql/`: original Postgres schema design (all modules). It ran
  cleanly on Postgres 17 except `0006_rls.sql` (Supabase-only `auth.uid()`).
  Use it as the spec when writing the remaining Django models.
- `backend/legacy/excel_migration/`: Excel → SQL import script (to be ported to `baho/imports`).
