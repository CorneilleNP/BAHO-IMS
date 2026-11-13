-- 0004_hq_dry_mill_export.sql
-- Module C: HQ dry mill (parchment -> green), export, client milling
-- services and pre-shipment quality samples. HQ-only (facility_type =
-- 'HQ_DRY_MILL'), aggregating across all CWS + partner suppliers.

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tin text,
  phone text,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create type origin_type as enum ('OWN_CWS','PARTNER_SUPPLIER');
create type hq_item_type as enum ('PARCH','GREEN');
create type quality_status as enum ('PENDING','ACCEPTED','REJECTED');
create type hq_processing_status as enum ('NOT_STARTED','IN_PROGRESS','COMPLETED');

-- BAHO STOCK UPDATE: inbound parchment/green receiving log at the HQ warehouse.
create table hq_stock_receipts (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references facilities(id),
  arrival_date date not null,
  origin_type origin_type not null,
  source_facility_id uuid references facilities(id),
  source_supplier_id uuid references suppliers(id),
  item_type hq_item_type not null,
  process_type_id uuid references process_types(id),
  process_grade_id uuid references process_grades(id),
  delivery_note_qty numeric(10,2),
  delivery_note_no text,
  weighing_status text,
  purchase_contract_number text,
  net_weight numeric(10,2) not null,
  wrn_number text,
  warehouse_cell_number text,
  stock_card_number text,
  weight_of_bags numeric(10,2) not null default 0,
  pure_weight numeric(10,2) generated always as (net_weight - weight_of_bags) stored,
  quality_status quality_status not null default 'PENDING',
  processing_status hq_processing_status not null default 'NOT_STARTED',
  processing_date date,
  crop_year_id uuid not null references crop_years(id),
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  device_id text,
  is_deleted boolean not null default false,
  check (
    (origin_type = 'OWN_CWS' and source_facility_id is not null) or
    (origin_type = 'PARTNER_SUPPLIER' and source_supplier_id is not null)
  )
);
create trigger trg_hq_stock_receipts_updated_at before update on hq_stock_receipts
  for each row execute function set_updated_at();
create index idx_hq_stock_receipts_facility on hq_stock_receipts(facility_id, arrival_date);
create index idx_hq_stock_receipts_source_facility on hq_stock_receipts(source_facility_id);

-- Configurable final export grade lookup (17+, Standard 15&16, 13/14, GTR, CST, Triage, Chips).
create table export_grades (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  group_tag text,
  display_order int not null default 0,
  is_active boolean not null default true
);
insert into export_grades (code, name, group_tag, display_order) values
  ('17PLUS','17+','HG',1),
  ('STD1516','Standard 15&16','HG',2),
  ('1314','13/14',null,3),
  ('GTR','GTR',null,4),
  ('CST','CST (CR)',null,5),
  ('TRIAGE','12-/Triage',null,6),
  ('CHIPS','Chips',null,7);

alter table stock_movements
  add constraint fk_stock_movements_export_grade
  foreign key (export_grade_id) references export_grades(id);

create type dry_mill_batch_status as enum ('IN_PROGRESS','COMPLETED');

-- PARCH PROCESSING UPDATE: parchment -> green conversion, same
-- estimate/outturn pattern as CWS wet processing, one stage downstream.
create table dry_mill_batches (
  id uuid primary key default gen_random_uuid(),
  batch_no text unique not null,
  facility_id uuid not null references facilities(id),
  processing_date date not null,
  cleaned_processing_date date,
  completion_date date,
  origin_type origin_type not null,
  input_grade text,
  parchment_input_qty numeric(10,2) not null check (parchment_input_qty >= 0),
  green_output_qty numeric(10,2) not null default 0,
  outturn_pct numeric(6,3) generated always as (
    case when parchment_input_qty > 0
      then round((green_output_qty / parchment_input_qty) * 100, 3)
      else 0
    end
  ) stored,
  status dry_mill_batch_status not null default 'IN_PROGRESS',
  crop_year_id uuid not null references crop_years(id),
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  device_id text,
  is_deleted boolean not null default false
);
create trigger trg_dry_mill_batches_updated_at before update on dry_mill_batches
  for each row execute function set_updated_at();
create index idx_dry_mill_batches_facility on dry_mill_batches(facility_id);
create index idx_dry_mill_batches_crop_year on dry_mill_batches(crop_year_id);

create table dry_mill_batch_grade_outputs (
  id uuid primary key default gen_random_uuid(),
  dry_mill_batch_id uuid not null references dry_mill_batches(id) on delete cascade,
  export_grade_id uuid not null references export_grades(id),
  qty_kg numeric(10,2) not null check (qty_kg >= 0),
  outturn_pct numeric(6,3),
  unique (dry_mill_batch_id, export_grade_id)
);
create index idx_dmbgo_batch on dry_mill_batch_grade_outputs(dry_mill_batch_id);

-- Traceability continues: a dry mill batch's parchment input can be
-- sourced from an HQ receipt (own CWS or partner) or directly from a
-- CWS processing lot where the chain is modeled end-to-end.
create table dry_mill_input_sources (
  id uuid primary key default gen_random_uuid(),
  dry_mill_batch_id uuid not null references dry_mill_batches(id) on delete cascade,
  hq_stock_receipt_id uuid references hq_stock_receipts(id),
  processing_lot_id uuid references processing_lots(id),
  allocated_qty_kg numeric(10,2) not null check (allocated_qty_kg >= 0),
  check (hq_stock_receipt_id is not null or processing_lot_id is not null)
);
create index idx_dmis_batch on dry_mill_input_sources(dry_mill_batch_id);
create index idx_dmis_receipt on dry_mill_input_sources(hq_stock_receipt_id);
create index idx_dmis_lot on dry_mill_input_sources(processing_lot_id);

create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text,
  contact text,
  tin text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create type shipment_status as enum ('PLANNED','SHIPPED','DELIVERED');

create table export_shipments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  delivery_to_naeb_date date,
  exported_quantity numeric(12,2),
  crop_year_id uuid not null references crop_years(id),
  lot_description text,
  status shipment_status not null default 'PLANNED',
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_export_shipments_updated_at before update on export_shipments
  for each row execute function set_updated_at();
create index idx_export_shipments_client on export_shipments(client_id);
create index idx_export_shipments_crop_year on export_shipments(crop_year_id);

create table export_shipment_lines (
  id uuid primary key default gen_random_uuid(),
  export_shipment_id uuid not null references export_shipments(id) on delete cascade,
  export_grade_id uuid not null references export_grades(id),
  dry_mill_batch_id uuid references dry_mill_batches(id),
  qty_kg numeric(10,2) not null check (qty_kg >= 0)
);
create index idx_esl_shipment on export_shipment_lines(export_shipment_id);
create index idx_esl_batch on export_shipment_lines(dry_mill_batch_id);

create type commitment_status as enum ('OPEN','PARTIALLY_FULFILLED','FULFILLED','CANCELLED');

create table committed_export_volumes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  process_type_id uuid references process_types(id),
  volume_kg numeric(12,2) not null,
  full_composition text,
  shipping_period text,
  crop_year_id uuid not null references crop_years(id),
  status commitment_status not null default 'OPEN',
  created_at timestamptz not null default now()
);
create index idx_committed_export_client on committed_export_volumes(client_id);

create table service_types (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  is_active boolean not null default true
);
insert into service_types (code, name) values
  ('HULLING_GRAVITY','Hulling & Gravity'),
  ('COLOR_SORT_R1','Color Sorter - Round 1'),
  ('COLOR_SORT_R2','Color Sorter - Round 2'),
  ('COLOR_CLEAN_ONLY','Color - Cleaning Only');

create type client_service_payment_status as enum ('YES','NO','PARTIAL');

-- Fee-for-service milling done for 3rd-party clients who bring their own
-- coffee, separate from Baho-owned coffee flowing through the stock ledger.
create table client_milling_services (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  service_date date not null,
  process_type_id uuid references process_types(id),
  grade_label text,
  service_type_id uuid not null references service_types(id),
  quantity_kg numeric(10,2) not null check (quantity_kg >= 0),
  rate_per_kg numeric(10,2) not null check (rate_per_kg >= 0),
  total_amount numeric(12,2) generated always as (quantity_kg * rate_per_kg) stored,
  payment_status client_service_payment_status not null default 'NO',
  created_at timestamptz not null default now()
);
create index idx_client_milling_client on client_milling_services(client_id);

-- PSS: pre-shipment sample / quality control tracking for export lot approval.
create table pss_samples (
  id uuid primary key default gen_random_uuid(),
  sample_date date not null,
  origin_facility_id uuid references facilities(id),
  origin_supplier_id uuid references suppliers(id),
  grade_label text,
  grn_or_batch_ref text,
  quantity_kg numeric(10,2),
  defect_pct numeric(5,2),
  crop_status text,
  client_id uuid references clients(id),
  lots_number text,
  sample_ref text,
  sales_ref text,
  comments text,
  shipment_month text,
  created_at timestamptz not null default now()
);
create index idx_pss_samples_client on pss_samples(client_id);
