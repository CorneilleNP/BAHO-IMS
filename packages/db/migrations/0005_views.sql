-- 0005_views.sql
-- Reporting views. No balances or rollups are stored columns anywhere in
-- this schema — they are always computed here so there is nothing to keep
-- in sync across modules and nothing to conflict on during offline sync.

-- Running cash balance per facility (replaces the stored "Balance" column
-- in the old Excel "Expenses Made" sheet).
create view cash_ledger_balance_v as
select
  e.*,
  sum(case when direction = 'IN' then amount else -amount end)
    over (partition by facility_id order by entry_date, created_at
          rows between unbounded preceding and current row) as running_balance
from cash_ledger_entries e
where not is_deleted;

-- Generic stock balance: qty_kg in stock_movements is signed from
-- facility_id's perspective, so balance is always a plain SUM.
create view facility_grade_balance_v as
select
  facility_id,
  item_type,
  process_grade_id,
  export_grade_id,
  crop_year_id,
  sum(qty_kg) as balance_kg
from stock_movements
where not is_deleted
group by facility_id, item_type, process_grade_id, export_grade_id, crop_year_id;

-- Lot-level estimate vs actual by grade, the core real-time view backing
-- the CWS processing lot entry screen.
create view processing_lot_estimate_vs_actual_v as
select
  pl.id as processing_lot_id,
  pl.lot_number,
  pl.facility_id,
  pl.process_type_id,
  pl.cherry_input_kg,
  pl.status,
  pg.id as process_grade_id,
  pg.code as grade_code,
  pg.display_order,
  pe.estimated_qty_kg,
  pa.actual_qty_kg,
  pa.outturn_pct
from processing_lots pl
join process_grades pg on pg.process_type_id = pl.process_type_id and pg.is_active
left join processing_lot_estimates pe
  on pe.processing_lot_id = pl.id and pe.process_grade_id = pg.id
left join processing_lot_actuals pa
  on pa.processing_lot_id = pl.id and pa.process_grade_id = pg.id
where not pl.is_deleted;

-- Cost per kg report, replacing the manually-maintained COST_TABLE sheet.
create view station_cost_per_kg_v as
with cherry_totals as (
  select
    cr.facility_id,
    cr.crop_year_id,
    sum(crl.quantity_kg) as total_cherry_kg,
    sum(crl.line_amount) as total_cherry_cost,
    sum(crl.transport_cost) as total_transport_cost,
    sum(crl.commission) as total_commission
  from cherry_receipts cr
  join cherry_receipt_lines crl on crl.cherry_receipt_id = cr.id
  where not cr.is_deleted
  group by cr.facility_id, cr.crop_year_id
),
expense_totals as (
  select facility_id, crop_year_id, sum(amount) as total_expenses
  from cash_ledger_entries
  where direction = 'OUT' and source_type = 'EXPENSE' and not is_deleted
  group by facility_id, crop_year_id
)
select
  ct.facility_id,
  ct.crop_year_id,
  ct.total_cherry_kg,
  ct.total_cherry_cost,
  ct.total_transport_cost,
  ct.total_commission,
  coalesce(et.total_expenses, 0) as total_operational_costs,
  case when ct.total_cherry_kg > 0 then
    round(
      (ct.total_cherry_cost + ct.total_transport_cost + ct.total_commission + coalesce(et.total_expenses, 0))
      / ct.total_cherry_kg,
    2)
  else 0 end as cost_per_kg
from cherry_totals ct
left join expense_totals et
  on et.facility_id = ct.facility_id and et.crop_year_id = ct.crop_year_id;

-- End-to-end traceability: walk the FK graph from farmer to export client.
create view traceability_v as
select
  f.id as farmer_id,
  f.full_name as farmer_name,
  cr.id as cherry_receipt_id,
  cr.grn_number,
  pl.id as processing_lot_id,
  pl.lot_number,
  dmb.id as dry_mill_batch_id,
  dmb.batch_no,
  es.id as export_shipment_id,
  c.name as client_name
from farmers f
join cherry_receipts cr on cr.farmer_id = f.id and not cr.is_deleted
join processing_lot_cherry_sources plcs on plcs.cherry_receipt_id = cr.id
join processing_lots pl on pl.id = plcs.processing_lot_id and not pl.is_deleted
left join dry_mill_input_sources dmis on dmis.processing_lot_id = pl.id
left join dry_mill_batches dmb on dmb.id = dmis.dry_mill_batch_id
left join export_shipment_lines esl on esl.dry_mill_batch_id = dmb.id
left join export_shipments es on es.id = esl.export_shipment_id
left join clients c on c.id = es.client_id;

-- Dashboard rollups mirroring the existing Power BI views: net weight by
-- process, by grade, by source/CWS, driven off hq_stock_receipts.
create view hq_net_weight_by_process_v as
select process_type_id, sum(pure_weight) as net_weight_kg
from hq_stock_receipts
where not is_deleted
group by process_type_id;

create view hq_net_weight_by_grade_v as
select process_grade_id, sum(pure_weight) as net_weight_kg
from hq_stock_receipts
where not is_deleted
group by process_grade_id;

create view hq_net_weight_by_source_v as
select
  coalesce(source_facility_id::text, source_supplier_id::text) as source_id,
  origin_type,
  sum(pure_weight) as net_weight_kg
from hq_stock_receipts
where not is_deleted
group by source_facility_id, source_supplier_id, origin_type;
