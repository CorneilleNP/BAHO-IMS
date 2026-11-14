-- 0006_rls.sql
-- Row-level security: one auth system (Supabase Auth JWT -> auth.uid())
-- drives both Postgres access control AND PowerSync's per-station sync
-- partitioning, per user_roles.facility_id.
--
-- Pattern: a user with any user_roles row where facility_id is null, or
-- whose role is an HQ/global role, sees everything ("global" access).
-- Otherwise a user only sees rows for facilities they are assigned to.
-- This file applies the pattern to the primary per-facility transactional
-- tables; replicate the same two policies for any further tables added.

create or replace function auth_user_facility_ids()
returns setof uuid
language sql stable
as $$
  select facility_id from user_roles where user_id = auth.uid() and facility_id is not null
$$;

create or replace function auth_user_is_global()
returns boolean
language sql stable
as $$
  select exists (
    select 1 from user_roles ur
    join roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and (ur.facility_id is null or r.code in ('ADMIN','HQ_FINANCE','HQ_DRY_MILL_OPERATOR','HQ_EXPORT_MANAGER'))
  )
$$;

-- Cherry reception & finance
alter table cherry_receipts enable row level security;
create policy cherry_receipts_access on cherry_receipts
  using (auth_user_is_global() or facility_id in (select auth_user_facility_ids()));

alter table cash_ledger_entries enable row level security;
create policy cash_ledger_entries_access on cash_ledger_entries
  using (auth_user_is_global() or facility_id in (select auth_user_facility_ids()));

alter table casual_laborers enable row level security;
create policy casual_laborers_access on casual_laborers
  using (auth_user_is_global() or facility_id in (select auth_user_facility_ids()));

alter table expense_receipts enable row level security;
create policy expense_receipts_access on expense_receipts
  using (auth_user_is_global() or facility_id in (select auth_user_facility_ids()));

-- CWS processing
alter table processing_lots enable row level security;
create policy processing_lots_access on processing_lots
  using (auth_user_is_global() or facility_id in (select auth_user_facility_ids()));

alter table process_types enable row level security;
create policy process_types_access on process_types
  using (auth_user_is_global() or facility_id in (select auth_user_facility_ids()));

alter table stock_movements enable row level security;
create policy stock_movements_access on stock_movements
  using (auth_user_is_global() or facility_id in (select auth_user_facility_ids()));

-- HQ dry mill & export: HQ-scoped tables, global roles only.
alter table hq_stock_receipts enable row level security;
create policy hq_stock_receipts_access on hq_stock_receipts
  using (auth_user_is_global());

alter table dry_mill_batches enable row level security;
create policy dry_mill_batches_access on dry_mill_batches
  using (auth_user_is_global());

alter table export_shipments enable row level security;
create policy export_shipments_access on export_shipments
  using (auth_user_is_global());

-- Reference/config data (roles, crop_years, admin_units, expense_categories,
-- process_grades, export_grades, service_types) intentionally has NO RLS:
-- it must sync unconditionally to every device for offline estimate
-- calculation and dropdown population, per the offline-sync design.
