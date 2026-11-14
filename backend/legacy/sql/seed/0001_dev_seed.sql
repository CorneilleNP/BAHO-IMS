-- 0001_dev_seed.sql
-- Minimal dev/test seed data: one crop year, the HQ facility, and a
-- handful of CWS stations seen in the source workbooks. NOT for
-- production — production facility/crop-year data should be entered by
-- an admin through the app once the schema is live.

insert into crop_years (label, start_date, end_date, is_active) values
  ('2026', '2026-01-01', '2026-12-31', true);

insert into facilities (facility_type, code, name, district, is_active) values
  ('HQ_DRY_MILL', 'HQ', 'Baho Coffee HQ Dry Mill', 'Kigali', true),
  ('CWS', 'BUGOYI', 'Bugoyi CWS', 'Rutsiro', true),
  ('CWS', 'GITOKI', 'Gitoki CWS', 'Rutsiro', true),
  ('CWS', 'KINAZI', 'Kinazi CWS', 'Huye', true),
  ('CWS', 'HUMURE', 'Humure CWS', 'Kirehe', true);

-- Example process types + grades for Gitoki, matching the real workbook.
insert into process_types (facility_id, code, name)
select id, 'FW', 'Fully Washed' from facilities where code = 'GITOKI';

insert into process_types (facility_id, code, name)
select id, 'ANAEROBIC_FW', 'Anaerobic Full Washed' from facilities where code = 'GITOKI';

insert into process_types (facility_id, code, name)
select id, 'NORMAL_NATURAL', 'Normal Natural' from facilities where code = 'GITOKI';

insert into process_types (facility_id, code, name)
select id, 'ANAEROBIC_NATURAL', 'Anaerobic Natural' from facilities where code = 'GITOKI';

insert into process_types (facility_id, code, name)
select id, 'HONEY', 'Honey & Honey Anaerobic' from facilities where code = 'GITOKI';

-- Grades for the washed processes (A1/A2/A3/HPC).
insert into process_grades (process_type_id, code, name, display_order)
select id, g.code, g.name, g.ord
from process_types pt
cross join (values ('A1','A1',1), ('A2','A2',2), ('A3','A3',3), ('HPC','HPC/A4',4)) as g(code, name, ord)
where pt.code in ('FW', 'ANAEROBIC_FW') and pt.facility_id = (select id from facilities where code = 'GITOKI');

-- Grades for the natural/honey processes (HG/HPC).
insert into process_grades (process_type_id, code, name, display_order)
select id, g.code, g.name, g.ord
from process_types pt
cross join (values ('HG','HG',1), ('HPC','HPC',2)) as g(code, name, ord)
where pt.code in ('NORMAL_NATURAL', 'ANAEROBIC_NATURAL', 'HONEY') and pt.facility_id = (select id from facilities where code = 'GITOKI');

-- Example ratios for FW at Gitoki (A1=0.14, A2=0.04, A3=0.025, HPC=0.015),
-- matching the "ESTIMATE RATIO" row observed in the real workbook.
insert into process_grade_ratios (process_type_id, process_grade_id, crop_year_id, ratio, effective_from)
select pt.id, pg.id, cy.id, r.ratio, cy.start_date
from process_types pt
join process_grades pg on pg.process_type_id = pt.id
cross join (select id, start_date from crop_years where label = '2026') cy
join (values ('A1', 0.14), ('A2', 0.04), ('A3', 0.025), ('HPC', 0.015)) as r(code, ratio)
  on r.code = pg.code
where pt.code = 'FW' and pt.facility_id = (select id from facilities where code = 'GITOKI');
