# Baho Coffee — Information Management System

Real-time, offline-first system replacing Baho Coffee's per-station Excel
workbooks: cherry reception from farmers, CWS wet-processing with live
estimate-vs-actual tracking, HQ dry mill + export, and the per-CWS cash/
expense ledger — with full farmer-to-export traceability.

Full architecture, data model, and phased build plan:
`.claude/plans/` (or ask Claude to re-summarize — the plan was reviewed
and approved before this code was written).

## What exists right now

- **`packages/db/migrations/`** — the complete Postgres schema (6 files,
  all modules: identity, reception/finance, processing, HQ dry mill/
  export, reporting views, row-level security). Syntax-validated against
  Postgres's real parser (`packages/db/validate.mjs`, uses `pgsql-parser`)
  since no live Postgres instance was available in the dev sandbox this
  was built in — **these migrations have not yet been run against a real
  database.** Run them (via `psql` or the Supabase CLI) against a real
  Postgres/Supabase instance and look for runtime errors before trusting
  them further (foreign key ordering across files, in particular).
- **`packages/db/seed/0001_dev_seed.sql`** — minimal dev data: one crop
  year, five facilities (HQ + 4 CWS seen in the source workbooks), and
  Gitoki's real Fully-Washed process/grade/ratio configuration.
- **`packages/shared-types/`** — hand-written TypeScript types mirroring
  every table, plus `calculateEstimate`/`calculateOutturnPct` — the exact
  formulas the Postgres generated columns also compute, so client and
  server never disagree.
- **`apps/web/`** — a React + TypeScript + Vite app with two working
  screens (`npm run dev:web` from the repo root, then visit `/reception`
  or `/processing`):
  - **Cherry Reception**: farmer selection, Good/Float cherry lines with
    live-computed line amounts and totals.
  - **Processing Lots**: the standout feature from the original ask —
    type a cherry input quantity and every grade's estimated output
    recalculates instantly (client-side, no save step), matching the
    "ESTIMATE ON TABLES" behavior from the real Gitoki workbook. Enter an
    actual sorted quantity per grade and its out-turn % appears
    immediately too.

  Both screens currently run on **local mock data** (`apps/web/src/mock/`)
  — there is no live backend yet. Wiring to Supabase + PowerSync per the
  sync-rules below is the next concrete step (Phase 0/1 of the plan).
- **`packages/sync-rules/sync-rules.yaml`** — PowerSync bucket
  definitions: reference/config tables sync to every device unconditionally
  (needed for offline estimate calc); per-station transactional tables are
  filtered by the signed-in user's assigned facilities; HQ-only tables are
  gated on a `is_global` JWT claim.
- **`supabase/config.toml`** — local Supabase dev config, pointed at
  `packages/db/migrations` as the single source of truth for schema.
- **`tools/excel-migration/migrate_cherry_receipts.py`** — a working ETL
  script, already run against the real `BUGOYI CWS- FINANCE REPORT`
  workbook as a smoke test: **3,222 receipts, 1,010 unique farmers,
  0 rows skipped**, producing valid SQL (review its header comment for
  known limitations — farmer de-dup is by name+phone only, and GRNs
  become a composite code per the plan's offline-safe numbering scheme
  rather than reusing the sheet's small integer).

## Setup

This machine had no system Node.js install and no admin rights for the
MSI installer, and sits behind a corporate TLS-inspecting proxy. See
`scripts/dev-env.sh` for how that was worked around (portable Node zip +
an exported Windows root-CA bundle for npm/pip). On a normal dev machine
none of that should be necessary — just:

```bash
npm install          # from repo root; installs all workspaces
npm run dev:web       # starts the Vite dev server
npm run build:web     # type-checks + production build
```

```bash
cd packages/db && node validate.mjs   # syntax-check all migrations
```

```bash
python tools/excel-migration/migrate_cherry_receipts.py \
  "<path to a Bugoyi-format workbook>.xlsx" BUGOYI 2026 > import.sql
# review import.sql, then: psql <db-url> -f import.sql
```

## Honest gaps / next steps

- **No live database has run these migrations yet.** This is the single
  highest-priority next step — provision a Supabase project (local via
  Docker, or cloud) and apply `packages/db/migrations/*.sql` in order.
- **No PowerSync instance is wired up** — `sync-rules.yaml` is written
  but untested against a real PowerSync service.
- **No auth** is wired into the web app yet (Supabase Auth JWT + the
  `facility_id`/`role` custom claims the RLS policies and sync rules
  depend on).
- Open assumptions/risks from the plan (roles list, GRN numbering
  scheme sign-off, currency, historical migration scope, station
  hardware) still need the user's confirmation — see the approved plan.
