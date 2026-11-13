-- 0002_reception_finance.sql
-- Module A: cherry reception from farmers + per-CWS cash/expense ledger.

create table expense_categories (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  is_active boolean not null default true
);

insert into expense_categories (code, name) values
  ('CASUAL_LABOR_COFFEE','Casual Labor for Coffee'),
  ('CASUAL_LABOR_OTHER','Casual Labor for Other Activities'),
  ('ELECTRICITY','Electricity'),
  ('MISSION_FEES','Mission Fees'),
  ('CLEANING','Cleaning Expense'),
  ('TELEPHONE_INTERNET','Telephone/Internet'),
  ('MANPOWER_CHERRY','Manpower for Cherry'),
  ('MANPOWER_PARCHMENT','Manpower for Parchment'),
  ('PACKAGING_MATERIAL','Packaging Material/Imifuka'),
  ('STAFF_WELFARE','Staff Welfare'),
  ('TRANSPORT_COURIER','Transport Expenses/Courier'),
  ('CSR','Corporate Social Responsibility'),
  ('PARCHMENT_TRANSPORT','Parchment Transport'),
  ('DISTRICT_TAXES','District Taxes'),
  ('RENTING_EQUIPMENT','Renting Equipment'),
  ('NURSERY_COSTS','Coffee Nursery Costs'),
  ('REPAIR_MAINTENANCE','Repair & Maintenance');

-- CHERRY RECEIPTS: one row per farmer delivery (= one GRN in the current Excel).
create type payment_method as enum ('CASH','BANK','MOBILE_MONEY');
create type payment_status as enum ('PAID','PARTIAL','UNPAID');

create table cherry_receipts (
  id uuid primary key default gen_random_uuid(),
  grn_number text unique not null,
  facility_id uuid not null references facilities(id),
  farmer_id uuid not null references farmers(id),
  crop_year_id uuid not null references crop_years(id),
  received_at timestamptz not null,
  received_by_user_id uuid references users(id),
  payment_method payment_method,
  payment_status payment_status not null default 'UNPAID',
  notes text,
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users(id),
  device_id text,
  is_deleted boolean not null default false
);
create trigger trg_cherry_receipts_updated_at before update on cherry_receipts
  for each row execute function set_updated_at();
create index idx_cherry_receipts_facility on cherry_receipts(facility_id);
create index idx_cherry_receipts_farmer on cherry_receipts(farmer_id);
create index idx_cherry_receipts_crop_year on cherry_receipts(crop_year_id);
create index idx_cherry_receipts_received_at on cherry_receipts(received_at);

-- Normalizes the Excel's duplicated Good/Float column pairs into rows —
-- extensible if a third cherry quality grade is introduced later.
create type cherry_grade as enum ('GOOD','FLOAT');

create table cherry_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  cherry_receipt_id uuid not null references cherry_receipts(id) on delete cascade,
  cherry_grade cherry_grade not null,
  quantity_kg numeric(10,2) not null check (quantity_kg >= 0),
  farm_price_per_kg numeric(10,2) not null check (farm_price_per_kg >= 0),
  transport_cost numeric(10,2) not null default 0,
  commission numeric(10,2) not null default 0,
  line_amount numeric(12,2) generated always as (quantity_kg * farm_price_per_kg) stored,
  created_at timestamptz not null default now(),
  unique (cherry_receipt_id, cherry_grade)
);
create index idx_cherry_receipt_lines_receipt on cherry_receipt_lines(cherry_receipt_id);

-- Proper partial-payment ledger instead of a single paid/unpaid flag.
create table cherry_payments (
  id uuid primary key default gen_random_uuid(),
  cherry_receipt_id uuid not null references cherry_receipts(id) on delete cascade,
  paid_at timestamptz not null default now(),
  amount numeric(12,2) not null check (amount > 0),
  method payment_method not null,
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now()
);
create index idx_cherry_payments_receipt on cherry_payments(cherry_receipt_id);

-- CASH LEDGER: append-only, replaces "Expenses Made" + folds in bank deposits
-- as a source_type. Running balance is never stored — see 0005 view.
create type ledger_direction as enum ('IN','OUT');
create type ledger_source_type as enum ('CHERRY_PURCHASE','EXPENSE','BANK_DEPOSIT','OTHER');

create table cash_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references facilities(id),
  crop_year_id uuid not null references crop_years(id),
  entry_date date not null,
  voucher_no text,
  payee_name text,
  payee_phone text,
  payee_email text,
  description text,
  direction ledger_direction not null,
  amount numeric(12,2) not null check (amount > 0),
  source_type ledger_source_type not null,
  expense_category_id uuid references expense_categories(id),
  linked_cherry_receipt_id uuid references cherry_receipts(id),
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  device_id text,
  is_deleted boolean not null default false
);
create index idx_cash_ledger_facility_date on cash_ledger_entries(facility_id, entry_date);
create index idx_cash_ledger_category on cash_ledger_entries(expense_category_id);
create index idx_cash_ledger_crop_year on cash_ledger_entries(crop_year_id);

create table bank_transfers (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references facilities(id),
  transfer_date date not null,
  depositor_name text,
  amount_from_hq numeric(12,2) not null default 0,
  amount_from_other_station numeric(12,2) not null default 0,
  notes text,
  cash_ledger_entry_id uuid references cash_ledger_entries(id),
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now()
);
create index idx_bank_transfers_facility on bank_transfers(facility_id);

-- CASUAL LABOR
create table casual_laborers (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references facilities(id),
  full_name text not null,
  national_id text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_casual_laborers_facility on casual_laborers(facility_id);

create type pay_period_status as enum ('OPEN','CLOSED','PAID');

create table labor_pay_periods (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references facilities(id),
  period_start date not null,
  period_end date not null,
  status pay_period_status not null default 'OPEN',
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);

-- Normalized day-rows replace the wide day-of-month attendance grid.
create table labor_attendance (
  id uuid primary key default gen_random_uuid(),
  laborer_id uuid not null references casual_laborers(id) on delete cascade,
  pay_period_id uuid not null references labor_pay_periods(id) on delete cascade,
  work_date date not null,
  present boolean not null default true,
  daily_rate_applied numeric(10,2) not null,
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  unique (laborer_id, work_date)
);
create index idx_labor_attendance_period on labor_attendance(pay_period_id);
create index idx_labor_attendance_laborer on labor_attendance(laborer_id);

-- EXPENSE RECEIPTS: merges the EBM / non-EBM sheets (Rwandan tax compliance)
-- with a has_ebm flag rather than two parallel tables.
create table expense_receipts (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references facilities(id),
  cash_ledger_entry_id uuid references cash_ledger_entries(id),
  has_ebm boolean not null default false,
  supplier_tin text,
  supplier_name text not null,
  items_description text,
  receipt_number text,
  receipt_date date not null,
  amount numeric(12,2) not null,
  vat_amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);
create index idx_expense_receipts_facility on expense_receipts(facility_id);
create index idx_expense_receipts_ledger_entry on expense_receipts(cash_ledger_entry_id);
