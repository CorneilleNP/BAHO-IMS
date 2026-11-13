-- 0003_processing.sql
-- Module B: CWS wet processing. Process types, grades and ratios are
-- station-configurable (not hardcoded enums) because they vary per CWS.

create table process_types (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references facilities(id),
  code text not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (facility_id, code)
);
create index idx_process_types_facility on process_types(facility_id);

-- Grade sets differ by process (A1/A2/A3/HPC for washed vs HG/HPC for naturals).
create table process_grades (
  id uuid primary key default gen_random_uuid(),
  process_type_id uuid not null references process_types(id) on delete cascade,
  code text not null,
  name text not null,
  display_order int not null default 0,
  is_active boolean not null default true,
  unique (process_type_id, code)
);
create index idx_process_grades_process_type on process_grades(process_type_id);

-- Versioned so a mid-season ratio change doesn't rewrite the history of
-- lots already estimated under the old ratio.
create table process_grade_ratios (
  id uuid primary key default gen_random_uuid(),
  process_type_id uuid not null references process_types(id) on delete cascade,
  process_grade_id uuid not null references process_grades(id) on delete cascade,
  crop_year_id uuid not null references crop_years(id),
  ratio numeric(7,5) not null check (ratio >= 0 and ratio <= 1),
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);
create index idx_pgr_lookup on process_grade_ratios(process_type_id, process_grade_id, crop_year_id);

-- The "Washed no 1" / "B.HONEY" sub-process labels, which vary per station.
create table sub_processes (
  id uuid primary key default gen_random_uuid(),
  process_type_id uuid not null references process_types(id) on delete cascade,
  facility_id uuid not null references facilities(id),
  name text not null,
  is_active boolean not null default true
);
create index idx_sub_processes_process_type on sub_processes(process_type_id);

create type lot_status as enum ('IN_PROGRESS','SORTED','CLOSED');

create table processing_lots (
  id uuid primary key default gen_random_uuid(),
  lot_number text unique not null,
  facility_id uuid not null references facilities(id),
  process_type_id uuid not null references process_types(id),
  sub_process_id uuid references sub_processes(id),
  crop_year_id uuid not null references crop_years(id),
  batch_no text,
  lot_date date not null,
  cherry_input_kg numeric(10,2) not null check (cherry_input_kg >= 0),
  status lot_status not null default 'IN_PROGRESS',
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users(id),
  device_id text,
  is_deleted boolean not null default false
);
create trigger trg_processing_lots_updated_at before update on processing_lots
  for each row execute function set_updated_at();
create index idx_processing_lots_facility on processing_lots(facility_id);
create index idx_processing_lots_process on processing_lots(process_type_id);
create index idx_processing_lots_crop_year on processing_lots(crop_year_id);

-- Many-to-many join: the key farmer-to-lot traceability link. A lot can
-- draw cherry from multiple receipts and a receipt can feed multiple lots.
create table processing_lot_cherry_sources (
  id uuid primary key default gen_random_uuid(),
  processing_lot_id uuid not null references processing_lots(id) on delete cascade,
  cherry_receipt_id uuid not null references cherry_receipts(id),
  allocated_qty_kg numeric(10,2) not null check (allocated_qty_kg >= 0),
  created_at timestamptz not null default now()
);
create index idx_plcs_lot on processing_lot_cherry_sources(processing_lot_id);
create index idx_plcs_receipt on processing_lot_cherry_sources(cherry_receipt_id);

-- Written at entry time with both the ratio AND the cherry input snapshotted,
-- so estimated_qty_kg can be a true generated column (same-row only) and the
-- figure a clerk saw at entry time never silently changes if the lot's
-- cherry_input_kg is corrected later.
create table processing_lot_estimates (
  id uuid primary key default gen_random_uuid(),
  processing_lot_id uuid not null references processing_lots(id) on delete cascade,
  process_grade_id uuid not null references process_grades(id),
  cherry_input_kg_snapshot numeric(10,2) not null,
  ratio_used numeric(7,5) not null,
  estimated_qty_kg numeric(10,2) generated always as (round(cherry_input_kg_snapshot * ratio_used, 2)) stored,
  calculated_at timestamptz not null default now(),
  unique (processing_lot_id, process_grade_id)
);
create index idx_ple_lot on processing_lot_estimates(processing_lot_id);

create table processing_lot_actuals (
  id uuid primary key default gen_random_uuid(),
  processing_lot_id uuid not null references processing_lots(id) on delete cascade,
  process_grade_id uuid not null references process_grades(id),
  cherry_input_kg_snapshot numeric(10,2) not null,
  actual_qty_kg numeric(10,2) not null check (actual_qty_kg >= 0),
  outturn_pct numeric(6,3) generated always as (
    case when cherry_input_kg_snapshot > 0
      then round((actual_qty_kg / cherry_input_kg_snapshot) * 100, 3)
      else 0
    end
  ) stored,
  sorted_at timestamptz not null default now(),
  created_by_user_id uuid references users(id),
  unique (processing_lot_id, process_grade_id)
);
create index idx_pla_lot on processing_lot_actuals(processing_lot_id);

-- UNIFIED STOCK LEDGER: traceability + reporting backbone for the whole
-- chain (CWS cherry/parchment and HQ parchment/green/export movements).
-- qty_kg is signed from facility_id's perspective (+ increases its stock,
-- - decreases it), so every balance is just SUM(qty_kg) — no duplicated
-- stored balance columns to keep in sync across modules.
create type stock_movement_type as enum (
  'CHERRY_IN','PARCHMENT_PRODUCED','PARCHMENT_TRANSFER_OUT','PARCHMENT_TRANSFER_IN',
  'HQ_RECEIVED','DRY_MILL_CONSUMED','GREEN_PRODUCED','EXPORT_SHIPPED',
  'CLIENT_SERVICE_IN','CLIENT_SERVICE_OUT','ADJUSTMENT'
);
create type stock_item_type as enum ('CHERRY','PARCHMENT','GREEN');

create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  movement_type stock_movement_type not null,
  facility_id uuid not null references facilities(id),
  counterparty_facility_id uuid references facilities(id),
  item_type stock_item_type not null,
  process_grade_id uuid references process_grades(id),
  export_grade_id uuid, -- FK added in 0004_hq_dry_mill_export.sql once export_grades exists
  qty_kg numeric(12,2) not null,
  reference_table text not null,
  reference_id uuid not null,
  movement_date date not null,
  crop_year_id uuid not null references crop_years(id),
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  device_id text,
  is_deleted boolean not null default false
);
create index idx_stock_movements_facility on stock_movements(facility_id, movement_date);
create index idx_stock_movements_reference on stock_movements(reference_table, reference_id);
create index idx_stock_movements_grade on stock_movements(process_grade_id);
create index idx_stock_movements_crop_year on stock_movements(crop_year_id);
