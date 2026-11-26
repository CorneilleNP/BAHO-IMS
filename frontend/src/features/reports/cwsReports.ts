/**
 * Detailed CWS reports (Excel): cherry reception and production.
 * Built in the browser from the same list endpoints the screens use, so the
 * server's role/station scoping applies (a clerk only gets their stations).
 */
import { exportWorkbook, fetchAllPages, type ReportInfo } from '../../lib/exportTable';
import { num } from '../../lib/format';
import { query } from '../../lib/useApi';
import type { CherryReceipt, CwsTransfer, Farmer } from '../../lib/types';
import type { LotWithVariance } from '../processing/variance';

export interface CwsReportFilters {
  dateFrom: string | null;
  dateTo: string | null;
  /** Facility id, or null for every station the user may see. */
  station: string | null;
  stationLabel: string;
}

const PAYMENT: Record<string, string> = { '': '', CASH: 'Cash', BANK: 'Bank', MOBILE_MONEY: 'Mobile money' };
const GENDER: Record<string, string> = { '': '', M: 'Male', F: 'Female', O: 'Other' };
const LOT_STATUS: Record<string, string> = { IN_PROGRESS: 'In progress', SORTED: 'Sorted', CLOSED: 'Closed' };

const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
const sum = <T>(rows: T[], pick: (row: T) => number) => round(rows.reduce((total, row) => total + pick(row), 0));

function info(title: string, f: CwsReportFilters, extra: ReportInfo = []): ReportInfo {
  return [
    ['Report', title],
    ['Station', f.stationLabel],
    ['Period', `${f.dateFrom ?? 'beginning'} to ${f.dateTo ?? 'today'}`],
    ...extra,
  ];
}

// ---- Cherry reception ------------------------------------------------------

interface GrnRow {
  r: CherryReceipt;
  farmer: Farmer | undefined;
  goodKg: number;
  goodPrice: number;
  goodAmount: number;
  floatKg: number;
  floatPrice: number;
  floatAmount: number;
  totalKg: number;
  transport: number;
  commission: number;
  total: number;
}

function grnRow(r: CherryReceipt, farmer: Farmer | undefined): GrnRow {
  const good = r.lines.find((l) => l.cherry_grade === 'GOOD');
  const float = r.lines.find((l) => l.cherry_grade === 'FLOAT');
  return {
    r,
    farmer,
    goodKg: num(good?.quantity_kg),
    goodPrice: num(good?.price_per_kg),
    goodAmount: num(good?.line_amount),
    floatKg: num(float?.quantity_kg),
    floatPrice: num(float?.price_per_kg),
    floatAmount: num(float?.line_amount),
    totalKg: num(r.total_kg),
    transport: r.lines.reduce((t, l) => t + num(l.transport_cost), 0),
    commission: r.lines.reduce((t, l) => t + num(l.commission), 0),
    total: num(r.total_amount),
  };
}

export async function downloadReceptionReport(f: CwsReportFilters): Promise<number> {
  const [receipts, farmers] = await Promise.all([
    fetchAllPages<CherryReceipt>(
      `/reception/receipts/${query({ facility: f.station, received_on__gte: f.dateFrom, received_on__lte: f.dateTo, ordering: 'received_on' })}`,
    ),
    fetchAllPages<Farmer>(`/farmers/${query({ home_facility: f.station })}`),
  ]);
  // Every delivery on its own row, by date (then GRN number): a farmer appears once per delivery.
  receipts.sort((a, b) => a.received_on.localeCompare(b.received_on) || a.grn_number.localeCompare(b.grn_number));
  const farmerById = new Map(farmers.map((farmer) => [farmer.id, farmer]));
  const rows = receipts.map((r) => grnRow(r, farmerById.get(r.farmer)));

  // One line per farmer.
  const byFarmer = new Map<string, GrnRow[]>();
  rows.forEach((row) => byFarmer.set(row.r.farmer, [...(byFarmer.get(row.r.farmer) ?? []), row]));
  const farmerRows = [...byFarmer.values()]
    .map((list) => ({ first: list[0], list }))
    .sort((a, b) => a.first.r.farmer_name.localeCompare(b.first.r.farmer_name));

  // One line per day and station.
  const byDay = new Map<string, GrnRow[]>();
  rows.forEach((row) => {
    const key = `${row.r.received_on}|${row.r.facility_name}`;
    byDay.set(key, [...(byDay.get(key) ?? []), row]);
  });
  const dayRows = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, list]) => list);

  const loc = (row: GrnRow) => row.r.farmer_location;
  await exportWorkbook(
    'cherry-reception-report',
    info('Cherry reception (detailed)', f, [
      ['GRNs', rows.length],
      ['Farmers', farmerRows.length],
      ['Good cherry (kg)', sum(rows, (x) => x.goodKg)],
      ['Float cherry (kg)', sum(rows, (x) => x.floatKg)],
      ['Total cherry (kg)', sum(rows, (x) => x.totalKg)],
      ['Transport (RWF)', sum(rows, (x) => x.transport)],
      ['Total paid / to pay (RWF)', sum(rows, (x) => x.total)],
    ]),
    [
      {
        name: 'Deliveries by date',
        rows,
        columns: [
          { header: 'GRN number', value: (x: GrnRow) => x.r.grn_number },
          { header: 'Date', value: (x: GrnRow) => x.r.received_on },
          { header: 'Station', value: (x: GrnRow) => x.r.facility_name },
          { header: 'Farmer code', value: (x: GrnRow) => x.r.farmer_code },
          { header: "Farmer's name", value: (x: GrnRow) => x.r.farmer_name },
          { header: 'First name', value: (x: GrnRow) => x.farmer?.first_name ?? '' },
          { header: 'Last name', value: (x: GrnRow) => x.farmer?.last_name ?? '' },
          { header: 'Gender', value: (x: GrnRow) => GENDER[x.farmer?.gender ?? ''] },
          { header: 'ID No', value: (x: GrnRow) => x.r.farmer_national_id },
          { header: 'TEL', value: (x: GrnRow) => x.r.farmer_phone },
          { header: 'Province', value: (x: GrnRow) => loc(x).province?.name ?? '' },
          { header: 'District', value: (x: GrnRow) => loc(x).district?.name ?? '' },
          { header: 'Sector', value: (x: GrnRow) => loc(x).sector?.name ?? '' },
          { header: 'Cell', value: (x: GrnRow) => loc(x).cell?.name ?? '' },
          { header: 'Village', value: (x: GrnRow) => loc(x).village?.name ?? '' },
          { header: 'Good cherry (kg)', value: (x: GrnRow) => x.goodKg },
          { header: 'Good price / kg', value: (x: GrnRow) => x.goodPrice || '' },
          { header: 'Good amount (RWF)', value: (x: GrnRow) => x.goodAmount },
          { header: 'Float cherry (kg)', value: (x: GrnRow) => x.floatKg },
          { header: 'Float price / kg', value: (x: GrnRow) => x.floatPrice || '' },
          { header: 'Float amount (RWF)', value: (x: GrnRow) => x.floatAmount },
          { header: 'Total cherry (kg)', value: (x: GrnRow) => x.totalKg },
          { header: 'Transport / kg', value: (x: GrnRow) => (x.totalKg ? round(x.transport / x.totalKg) : '') },
          { header: 'Total transport (RWF)', value: (x: GrnRow) => x.transport },
          { header: 'Commission (RWF)', value: (x: GrnRow) => x.commission },
          { header: 'TOTAL AMOUNT (RWF)', value: (x: GrnRow) => x.total },
          { header: 'Payment method', value: (x: GrnRow) => PAYMENT[x.r.payment_method] ?? x.r.payment_method },
          { header: 'Payment status', value: (x: GrnRow) => (x.r.payment_status === 'PAID' ? 'Paid' : 'Unpaid') },
          { header: 'Weighing clerk', value: (x: GrnRow) => x.r.created_by_name },
          { header: 'Notes', value: (x: GrnRow) => x.r.notes },
        ],
        totals: {
          'Good cherry (kg)': sum(rows, (x) => x.goodKg),
          'Good amount (RWF)': sum(rows, (x) => x.goodAmount),
          'Float cherry (kg)': sum(rows, (x) => x.floatKg),
          'Float amount (RWF)': sum(rows, (x) => x.floatAmount),
          'Total cherry (kg)': sum(rows, (x) => x.totalKg),
          'Total transport (RWF)': sum(rows, (x) => x.transport),
          'Commission (RWF)': sum(rows, (x) => x.commission),
          'TOTAL AMOUNT (RWF)': sum(rows, (x) => x.total),
        },
      },
      {
        name: 'Farmer totals',
        rows: farmerRows,
        columns: [
          { header: 'Farmer code', value: (g: (typeof farmerRows)[number]) => g.first.r.farmer_code },
          { header: "Farmer's name", value: (g: (typeof farmerRows)[number]) => g.first.r.farmer_name },
          { header: 'Gender', value: (g: (typeof farmerRows)[number]) => GENDER[g.first.farmer?.gender ?? ''] },
          { header: 'ID No', value: (g: (typeof farmerRows)[number]) => g.first.r.farmer_national_id },
          { header: 'TEL', value: (g: (typeof farmerRows)[number]) => g.first.r.farmer_phone },
          { header: 'Home station', value: (g: (typeof farmerRows)[number]) => g.first.farmer?.home_facility_name ?? '' },
          { header: 'Sector', value: (g: (typeof farmerRows)[number]) => g.first.r.farmer_location.sector?.name ?? '' },
          { header: 'Cell', value: (g: (typeof farmerRows)[number]) => g.first.r.farmer_location.cell?.name ?? '' },
          { header: 'Village', value: (g: (typeof farmerRows)[number]) => g.first.r.farmer_location.village?.name ?? '' },
          { header: 'Land (ha)', value: (g: (typeof farmerRows)[number]) => g.first.farmer?.land_area_ha ?? '' },
          { header: 'Deliveries (GRNs)', value: (g: (typeof farmerRows)[number]) => g.list.length },
          { header: 'First delivery', value: (g: (typeof farmerRows)[number]) => g.list[0].r.received_on },
          { header: 'Last delivery', value: (g: (typeof farmerRows)[number]) => g.list[g.list.length - 1].r.received_on },
          { header: 'Good cherry (kg)', value: (g: (typeof farmerRows)[number]) => sum(g.list, (x) => x.goodKg) },
          { header: 'Float cherry (kg)', value: (g: (typeof farmerRows)[number]) => sum(g.list, (x) => x.floatKg) },
          { header: 'Total cherry (kg)', value: (g: (typeof farmerRows)[number]) => sum(g.list, (x) => x.totalKg) },
          { header: 'Cherry amount (RWF)', value: (g: (typeof farmerRows)[number]) => sum(g.list, (x) => x.goodAmount + x.floatAmount) },
          { header: 'Transport (RWF)', value: (g: (typeof farmerRows)[number]) => sum(g.list, (x) => x.transport) },
          { header: 'TOTAL AMOUNT (RWF)', value: (g: (typeof farmerRows)[number]) => sum(g.list, (x) => x.total) },
          { header: 'Unpaid (RWF)', value: (g: (typeof farmerRows)[number]) => sum(g.list.filter((x) => x.r.payment_status !== 'PAID'), (x) => x.total) },
        ],
        totals: {
          'Deliveries (GRNs)': rows.length,
          'Good cherry (kg)': sum(rows, (x) => x.goodKg),
          'Float cherry (kg)': sum(rows, (x) => x.floatKg),
          'Total cherry (kg)': sum(rows, (x) => x.totalKg),
          'Cherry amount (RWF)': sum(rows, (x) => x.goodAmount + x.floatAmount),
          'Transport (RWF)': sum(rows, (x) => x.transport),
          'TOTAL AMOUNT (RWF)': sum(rows, (x) => x.total),
          'Unpaid (RWF)': sum(rows.filter((x) => x.r.payment_status !== 'PAID'), (x) => x.total),
        },
      },
      {
        name: 'By day',
        rows: dayRows,
        columns: [
          { header: 'Date', value: (list: GrnRow[]) => list[0].r.received_on },
          { header: 'Station', value: (list: GrnRow[]) => list[0].r.facility_name },
          { header: 'GRNs', value: (list: GrnRow[]) => list.length },
          { header: 'Farmers', value: (list: GrnRow[]) => new Set(list.map((x) => x.r.farmer)).size },
          { header: 'Good cherry (kg)', value: (list: GrnRow[]) => sum(list, (x) => x.goodKg) },
          { header: 'Float cherry (kg)', value: (list: GrnRow[]) => sum(list, (x) => x.floatKg) },
          { header: 'Total cherry (kg)', value: (list: GrnRow[]) => sum(list, (x) => x.totalKg) },
          { header: 'Cherry amount (RWF)', value: (list: GrnRow[]) => sum(list, (x) => x.goodAmount + x.floatAmount) },
          { header: 'Transport (RWF)', value: (list: GrnRow[]) => sum(list, (x) => x.transport) },
          { header: 'Commission (RWF)', value: (list: GrnRow[]) => sum(list, (x) => x.commission) },
          { header: 'TOTAL AMOUNT (RWF)', value: (list: GrnRow[]) => sum(list, (x) => x.total) },
        ],
        totals: {
          GRNs: rows.length,
          'Good cherry (kg)': sum(rows, (x) => x.goodKg),
          'Float cherry (kg)': sum(rows, (x) => x.floatKg),
          'Total cherry (kg)': sum(rows, (x) => x.totalKg),
          'Cherry amount (RWF)': sum(rows, (x) => x.goodAmount + x.floatAmount),
          'Transport (RWF)': sum(rows, (x) => x.transport),
          'Commission (RWF)': sum(rows, (x) => x.commission),
          'TOTAL AMOUNT (RWF)': sum(rows, (x) => x.total),
        },
      },
    ],
  );
  return rows.length;
}

// ---- CWS production (processing lots + transfers) ---------------------------

type LotResult = LotWithVariance['results'][number];

export async function downloadProductionReport(f: CwsReportFilters): Promise<number> {
  const [lots, transfers] = await Promise.all([
    fetchAllPages<LotWithVariance>(
      `/processing/lots/${query({ facility: f.station, lot_date__gte: f.dateFrom, lot_date__lte: f.dateTo, ordering: 'lot_date' })}`,
    ),
    fetchAllPages<CwsTransfer>(
      `/transfers/cws/${query({ facility: f.station, transfer_date__gte: f.dateFrom, transfer_date__lte: f.dateTo, ordering: 'transfer_date' })}`,
    ),
  ]);
  const gradeRows = lots.flatMap((lot) => lot.results.map((result) => ({ lot, result })));
  const transferRows = transfers.flatMap((t) => t.lines.map((line) => ({ t, line })));

  // Totals per grade over every lot.
  const byGrade = new Map<string, Array<{ lot: LotWithVariance; result: LotResult }>>();
  gradeRows.forEach((row) => byGrade.set(row.result.grade_name, [...(byGrade.get(row.result.grade_name) ?? []), row]));
  const gradeTotals = [...byGrade.entries()].map(([grade, list]) => {
    const measured = list.filter((x) => x.result.actual_kg !== null);
    const est = sum(list, (x) => num(x.result.estimated_kg));
    const cmp = sum(measured, (x) => num(x.result.estimated_kg));
    const act = sum(measured, (x) => num(x.result.actual_kg));
    return { grade, lots: list.length, est, cmp, act, variance: round(act - cmp), pct: cmp ? round(((act - cmp) / cmp) * 100) : null };
  });

  const input = sum(lots, (l) => num(l.cherry_input_kg));
  const actual = sum(gradeRows, (x) => num(x.result.actual_kg));
  await exportWorkbook(
    'cws-production-report',
    info('CWS production (detailed)', f, [
      ['Processing lots', lots.length],
      ['Cherry input (kg)', input],
      ['Estimated parchment (kg)', sum(lots, (l) => num(l.total_estimated_kg))],
      ['Actual parchment sorted (kg)', actual],
      ['Out-turn %', input ? round((actual / input) * 100) : 0],
      ['Lots awaiting actuals', lots.filter((l) => l.total_actual_kg === null || l.status === 'IN_PROGRESS').length],
      ['Transfers to dry mill', transfers.length],
      ['Parchment sent to dry mill (kg)', sum(transferRows, (x) => num(x.line.net_weight_kg))],
    ]),
    [
      {
        name: 'Lots',
        rows: lots,
        columns: [
          { header: 'Lot number', value: (l: LotWithVariance) => l.lot_number },
          { header: 'Date', value: (l: LotWithVariance) => l.lot_date },
          { header: 'Station', value: (l: LotWithVariance) => l.facility_name },
          { header: 'Process / sub-process', value: (l: LotWithVariance) => l.process_label },
          { header: 'Cherry input (kg)', value: (l: LotWithVariance) => l.cherry_input_kg },
          { header: 'Estimated (kg)', value: (l: LotWithVariance) => l.total_estimated_kg },
          { header: 'Actual (kg)', value: (l: LotWithVariance) => l.total_actual_kg ?? '' },
          { header: 'Estimate with actuals (kg)', value: (l: LotWithVariance) => l.variance.compared_estimated_kg ?? '' },
          { header: 'Variance (kg)', value: (l: LotWithVariance) => l.variance.variance_kg ?? '' },
          { header: 'Variance %', value: (l: LotWithVariance) => l.variance.variance_pct ?? '' },
          { header: 'Out-turn %', value: (l: LotWithVariance) => l.total_outturn_pct ?? '' },
          { header: 'Status', value: (l: LotWithVariance) => LOT_STATUS[l.status] ?? l.status },
        ],
        totals: {
          'Cherry input (kg)': input,
          'Estimated (kg)': sum(lots, (l) => num(l.total_estimated_kg)),
          'Actual (kg)': actual,
        },
      },
      {
        name: 'Lots by grade',
        rows: gradeRows,
        columns: [
          { header: 'Lot number', value: (x: { lot: LotWithVariance; result: LotResult }) => x.lot.lot_number },
          { header: 'Date', value: (x: { lot: LotWithVariance; result: LotResult }) => x.lot.lot_date },
          { header: 'Station', value: (x: { lot: LotWithVariance; result: LotResult }) => x.lot.facility_name },
          { header: 'Process / sub-process', value: (x: { lot: LotWithVariance; result: LotResult }) => x.lot.process_label },
          { header: 'Cherry input (kg)', value: (x: { lot: LotWithVariance; result: LotResult }) => x.lot.cherry_input_kg },
          { header: 'Grade', value: (x: { lot: LotWithVariance; result: LotResult }) => x.result.grade_name },
          { header: 'Ratio used', value: (x: { lot: LotWithVariance; result: LotResult }) => x.result.ratio_used },
          { header: 'Estimated (kg)', value: (x: { lot: LotWithVariance; result: LotResult }) => x.result.estimated_kg },
          { header: 'Actual (kg)', value: (x: { lot: LotWithVariance; result: LotResult }) => x.result.actual_kg ?? '' },
          { header: 'Variance (kg)', value: (x: { lot: LotWithVariance; result: LotResult }) => x.result.variance_kg ?? '' },
          { header: 'Variance %', value: (x: { lot: LotWithVariance; result: LotResult }) => x.result.variance_pct ?? '' },
          { header: 'Out-turn %', value: (x: { lot: LotWithVariance; result: LotResult }) => x.result.outturn_pct ?? '' },
          { header: 'Lot status', value: (x: { lot: LotWithVariance; result: LotResult }) => LOT_STATUS[x.lot.status] ?? x.lot.status },
        ],
        totals: {
          'Estimated (kg)': sum(gradeRows, (x) => num(x.result.estimated_kg)),
          'Actual (kg)': actual,
        },
      },
      {
        name: 'By grade',
        rows: gradeTotals,
        columns: [
          { header: 'Grade', value: (g: (typeof gradeTotals)[number]) => g.grade },
          { header: 'Lots', value: (g: (typeof gradeTotals)[number]) => g.lots },
          { header: 'Estimated (kg)', value: (g: (typeof gradeTotals)[number]) => g.est },
          { header: 'Estimate with actuals (kg)', value: (g: (typeof gradeTotals)[number]) => g.cmp },
          { header: 'Actual (kg)', value: (g: (typeof gradeTotals)[number]) => g.act },
          { header: 'Variance (kg)', value: (g: (typeof gradeTotals)[number]) => g.variance },
          { header: 'Variance %', value: (g: (typeof gradeTotals)[number]) => g.pct ?? '' },
        ],
        totals: {
          'Estimated (kg)': sum(gradeTotals, (g) => g.est),
          'Estimate with actuals (kg)': sum(gradeTotals, (g) => g.cmp),
          'Actual (kg)': sum(gradeTotals, (g) => g.act),
          'Variance (kg)': sum(gradeTotals, (g) => g.variance),
        },
      },
      {
        name: 'Transfers to dry mill',
        rows: transferRows,
        columns: [
          { header: 'Delivery note', value: (x: (typeof transferRows)[number]) => x.t.delivery_note_no },
          { header: 'Date', value: (x: (typeof transferRows)[number]) => x.t.transfer_date },
          { header: 'Station', value: (x: (typeof transferRows)[number]) => x.t.facility_name },
          { header: 'Process', value: (x: (typeof transferRows)[number]) => x.line.process_name },
          { header: 'Sub-process', value: (x: (typeof transferRows)[number]) => x.line.sub_process_name },
          { header: 'Grade', value: (x: (typeof transferRows)[number]) => x.line.grade_code || x.line.grade },
          { header: 'Moisture %', value: (x: (typeof transferRows)[number]) => x.line.moisture_content_pct ?? '' },
          { header: 'Bags', value: (x: (typeof transferRows)[number]) => x.line.number_of_bags },
          { header: 'Gross weight (kg)', value: (x: (typeof transferRows)[number]) => x.line.gross_weight_kg },
          { header: 'Weight of bags (kg)', value: (x: (typeof transferRows)[number]) => x.line.weight_of_bags_kg },
          { header: 'Net weight (kg)', value: (x: (typeof transferRows)[number]) => x.line.net_weight_kg },
          { header: 'Status', value: (x: (typeof transferRows)[number]) => (x.t.status === 'SUBMITTED' ? 'Submitted' : 'Draft') },
          { header: 'Notes', value: (x: (typeof transferRows)[number]) => x.t.notes },
        ],
        totals: {
          Bags: sum(transferRows, (x) => x.line.number_of_bags),
          'Gross weight (kg)': sum(transferRows, (x) => num(x.line.gross_weight_kg)),
          'Weight of bags (kg)': sum(transferRows, (x) => num(x.line.weight_of_bags_kg)),
          'Net weight (kg)': sum(transferRows, (x) => num(x.line.net_weight_kg)),
        },
      },
    ],
  );
  return lots.length + transfers.length;
}
