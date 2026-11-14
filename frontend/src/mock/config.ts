import type { Facility, Farmer, ProcessGrade, ProcessGradeRatio, ProcessType } from '../types';

// Stand-in for data that PowerSync will keep synced to every device
// (facilities, process config, farmers). Wired to real Supabase/PowerSync
// queries once a backend project is provisioned — see apps/web/README.md.

export const facilities: Facility[] = [
  { id: 'fac-gitoki', facility_type: 'CWS', code: 'GITOKI', name: 'Gitoki CWS', is_active: true },
  { id: 'fac-bugoyi', facility_type: 'CWS', code: 'BUGOYI', name: 'Bugoyi CWS', is_active: true },
  { id: 'fac-hq', facility_type: 'HQ_DRY_MILL', code: 'HQ', name: 'Baho Coffee HQ Dry Mill', is_active: true },
];

export const processTypes: ProcessType[] = [
  { id: 'pt-fw', facility_id: 'fac-gitoki', code: 'FW', name: 'Fully Washed', is_active: true },
  { id: 'pt-anaerobic-fw', facility_id: 'fac-gitoki', code: 'ANAEROBIC_FW', name: 'Anaerobic Full Washed', is_active: true },
  { id: 'pt-normal-natural', facility_id: 'fac-gitoki', code: 'NORMAL_NATURAL', name: 'Normal Natural', is_active: true },
  { id: 'pt-honey', facility_id: 'fac-gitoki', code: 'HONEY', name: 'Honey & Honey Anaerobic', is_active: true },
];

// Grades + ratios below mirror the real "ESTIMATE RATIO" row read directly
// from BBAHO GITOKI CWS PRODUCTION REPORT SEASON 2026 (FW sheet: A1=0.14,
// A2=0.04, A3=0.025, HPC/A4=0.015 -> total 0.22 of cherry input).
export const processGrades: ProcessGrade[] = [
  { id: 'pg-fw-a1', process_type_id: 'pt-fw', code: 'A1', name: 'A1', display_order: 1, is_active: true },
  { id: 'pg-fw-a2', process_type_id: 'pt-fw', code: 'A2', name: 'A2', display_order: 2, is_active: true },
  { id: 'pg-fw-a3', process_type_id: 'pt-fw', code: 'A3', name: 'A3', display_order: 3, is_active: true },
  { id: 'pg-fw-hpc', process_type_id: 'pt-fw', code: 'HPC', name: 'HPC/A4', display_order: 4, is_active: true },
  { id: 'pg-nn-hg', process_type_id: 'pt-normal-natural', code: 'HG', name: 'HG', display_order: 1, is_active: true },
  { id: 'pg-nn-hpc', process_type_id: 'pt-normal-natural', code: 'HPC', name: 'HPC', display_order: 2, is_active: true },
];

export const processGradeRatios: ProcessGradeRatio[] = [
  { id: 'r-fw-a1', process_type_id: 'pt-fw', process_grade_id: 'pg-fw-a1', crop_year_id: 'cy-2026', ratio: 0.14, effective_from: '2026-01-01' },
  { id: 'r-fw-a2', process_type_id: 'pt-fw', process_grade_id: 'pg-fw-a2', crop_year_id: 'cy-2026', ratio: 0.04, effective_from: '2026-01-01' },
  { id: 'r-fw-a3', process_type_id: 'pt-fw', process_grade_id: 'pg-fw-a3', crop_year_id: 'cy-2026', ratio: 0.025, effective_from: '2026-01-01' },
  { id: 'r-fw-hpc', process_type_id: 'pt-fw', process_grade_id: 'pg-fw-hpc', crop_year_id: 'cy-2026', ratio: 0.015, effective_from: '2026-01-01' },
  { id: 'r-nn-hg', process_type_id: 'pt-normal-natural', process_grade_id: 'pg-nn-hg', crop_year_id: 'cy-2026', ratio: 0.30, effective_from: '2026-01-01' },
  { id: 'r-nn-hpc', process_type_id: 'pt-normal-natural', process_grade_id: 'pg-nn-hpc', crop_year_id: 'cy-2026', ratio: 0.03, effective_from: '2026-01-01' },
];

export const farmers: Farmer[] = [
  { id: 'f-1', farmer_code: 'GTK-0001', full_name: 'MBONAYEZU JOSEPH', phone: '0721343545', is_active: true },
  { id: 'f-2', farmer_code: 'GTK-0002', full_name: 'NTAWIHEBA JEAN', phone: '0788000000', is_active: true },
  { id: 'f-3', farmer_code: 'GTK-0003', full_name: 'BANGUWIHA JEAN BAPTISTE', phone: '0782393773', is_active: true },
];
