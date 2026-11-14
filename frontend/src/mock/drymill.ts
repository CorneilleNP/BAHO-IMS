// Mock HQ dry-mill data shaped like hq_stock_receipts / dry_mill_batches /
// export_shipments, seeded with the real aggregate figures from Baho's
// existing Power BI "Baho Dry Mill Stock Update", "Parchment Processing"
// and "Export Updates" dashboards, so this view is recognizable rather
// than arbitrary placeholder numbers. Replace with live Supabase/PowerSync
// queries once the backend is provisioned (see README "Honest gaps").

export interface StockBySource {
  source: string;
  netWeightKg: number;
}

export const netWeightKpis = {
  netWeightKg: 1_826_913,
  pureWeightKg: 1_789_885,
  weightOfBagsKg: 5_143,
};

export const netWeightByProcess = [
  { process: 'FW', kg: 990_355 },
  { process: 'NATURAL N', kg: 141_924 },
  { process: 'FW SEASON B', kg: 88_830 },
  { process: 'FW DF', kg: 40_758 },
  { process: 'FOREST WASHED', kg: 29_148 },
  { process: 'HONEY BLACK', kg: 28_476 },
  { process: 'NAT 300', kg: 22_028 },
  { process: 'WASHED NO 1', kg: 21_625 },
  { process: 'ANAEROBIC W', kg: 21_169 },
  { process: 'N NAT', kg: 20_367 },
];

export const netWeightByGrade = [
  { grade: 'A1', kg: 869_411 },
  { grade: 'HG', kg: 523_601 },
  { grade: 'A3', kg: 171_907 },
  { grade: 'A2', kg: 130_677 },
  { grade: 'A4', kg: 61_913 },
  { grade: 'HPC', kg: 41_806 },
  { grade: 'FLOAT', kg: 6_400 },
  { grade: 'HC', kg: 4_234 },
];

export const netWeightBySource: StockBySource[] = [
  { source: 'HUMURE', netWeightKg: 411_616 },
  { source: 'KINAZI', netWeightKg: 244_866 },
  { source: 'GITOKI', netWeightKg: 202_965 },
  { source: 'BUMBOGO', netWeightKg: 123_186 },
  { source: 'MUGANZA', netWeightKg: 94_023 },
  { source: 'NGOMA', netWeightKg: 63_068 },
  { source: 'BUHETA', netWeightKg: 49_136 },
  { source: 'FUGI', netWeightKg: 43_831 },
  { source: 'MATYAZO', netWeightKg: 38_823 },
  { source: 'KAMEEBE', netWeightKg: 28_371 },
];

export interface HqStockReceiptRow {
  id: string;
  arrivalDate: string;
  source: string;
  process: string;
  grade: string;
  deliveryNoteQtyKg: number;
  netWeightKg: number;
  weightOfBagsKg: number;
  qualityStatus: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  processingStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
}

export const recentStockReceipts: HqStockReceiptRow[] = [
  { id: 'r1', arrivalDate: '2026-09-15', source: 'KINAZI', process: 'NATURAL N', grade: 'HG', deliveryNoteQtyKg: 4200, netWeightKg: 4229, weightOfBagsKg: 10, qualityStatus: 'ACCEPTED', processingStatus: 'NOT_STARTED' },
  { id: 'r2', arrivalDate: '2026-09-15', source: 'KINAZI', process: 'EX NAT', grade: 'HG', deliveryNoteQtyKg: 4215, netWeightKg: 4234, weightOfBagsKg: 12, qualityStatus: 'ACCEPTED', processingStatus: 'COMPLETED' },
  { id: 'r3', arrivalDate: '2026-09-16', source: 'KINAZI', process: 'FW', grade: 'A1', deliveryNoteQtyKg: 4120, netWeightKg: 4131, weightOfBagsKg: 10, qualityStatus: 'ACCEPTED', processingStatus: 'COMPLETED' },
  { id: 'r4', arrivalDate: '2026-09-17', source: 'GITOKI', process: 'FW', grade: 'A3', deliveryNoteQtyKg: 7558, netWeightKg: 7558, weightOfBagsKg: 26, qualityStatus: 'ACCEPTED', processingStatus: 'COMPLETED' },
  { id: 'r5', arrivalDate: '2026-09-17', source: 'HUMURE', process: 'FW', grade: 'A2', deliveryNoteQtyKg: 10131, netWeightKg: 10131, weightOfBagsKg: 28, qualityStatus: 'ACCEPTED', processingStatus: 'NOT_STARTED' },
];

// Parchment Processing dashboard (BAHO DRY MILL STOCK STATUS workbook,
// " PARCH PROCESSING UPDATE" sheet)
export const parchProcessingKpis = {
  inputsQuantityKg: 1_351_014,
  greenOutputQuantityKg: 967_567,
  parchToGreenOutturnPct: 71.62,
  standard15Kg: 699_544,
  hgOutturnPct: 51.92,
  grade1314Kg: 64_566,
  gtrKg: 97_153,
  cstKg: 55_397,
  chipsKg: 44_323,
  triageKg: 4_173,
};

export const greenOutputByOrigin = [
  { origin: 'HUMURE', kg: 198_061 },
  { origin: 'KINAZI', kg: 142_623 },
  { origin: 'GITOKI', kg: 117_389 },
  { origin: 'NYAKIZU', kg: 64_003 },
  { origin: 'NGOMA', kg: 41_894 },
  { origin: 'BUMBOGO', kg: 41_576 },
  { origin: 'AGRINOS/KAYENZI', kg: 38_767 },
  { origin: 'MUGANZA', kg: 37_573 },
];

export interface DryMillBatchRow {
  id: string;
  batchNo: string;
  processingDate: string;
  origin: string;
  inputGrade: string;
  sourceStation?: string;
  processProduct?: string;
  outputBreakdown?: string;
  parchInputKg: number;
  greenOutputKg: number;
  outturnPct: number;
  status: 'IN_PROGRESS' | 'COMPLETED';
}

export const recentDryMillBatches: DryMillBatchRow[] = [
  { id: 'b1', batchNo: '46160-GTK-A1', processingDate: '2026-09-10', origin: 'GITOKI', sourceStation: 'GITOKI', processProduct: 'FULLWASHED A1', inputGrade: 'FULLWASHED A1', outputBreakdown: '17+: 3,200kg • 15+: 2,800kg • 13/14: 1,100kg', parchInputKg: 10_422, greenOutputKg: 8_282, outturnPct: 79.47, status: 'COMPLETED' },
  { id: 'b2', batchNo: '46175-GTK-A1', processingDate: '2026-09-11', origin: 'GITOKI', sourceStation: 'GITOKI', processProduct: 'FULLWASHED A1', inputGrade: 'FULLWASHED A1', outputBreakdown: '17+: 9,400kg • 15+: 8,300kg • GTR: 2,900kg', parchInputKg: 30_260, greenOutputKg: 25_611, outturnPct: 84.64, status: 'COMPLETED' },
  { id: 'b3', batchNo: '46175-HUM-A1', processingDate: '2026-09-11', origin: 'HUMURE', sourceStation: 'HUMURE', processProduct: 'FULLWASHED A1', inputGrade: 'FULLWASHED A1', outputBreakdown: '15+: 5,800kg • 13/14: 2,600kg • CST: 1,000kg', parchInputKg: 13_065, greenOutputKg: 10_583, outturnPct: 81.00, status: 'COMPLETED' },
  { id: 'b4', batchNo: '46160-HUM-A3', processingDate: '2026-09-10', origin: 'HUMURE', sourceStation: 'HUMURE', processProduct: 'FULLWASHED A3', inputGrade: 'FULLWASHED A3', outputBreakdown: '15+: 2,150kg • GTR: 1,400kg • 12-/Triage: 800kg', parchInputKg: 9_366, greenOutputKg: 5_243, outturnPct: 55.98, status: 'COMPLETED' },
];

// Export Updates dashboard
export const exportKpis = {
  exportedQuantityKg: 593_500,
  stockBalanceQuantityKg: 374_067,
  exp17Kg: 2_769,
  exp15Kg: 519_243,
  exp1314Kg: 33_585,
  expGtrKg: 24_493,
  expCstKg: 14_010,
  bal17Kg: 0,
  bal15Kg: 180_301,
  bal1314Kg: 30_981,
  balGtrKg: 72_660,
  balCstKg: 41_387,
  balChipsKg: 44_323,
  balTriageKg: 4_173,
};

export const exportedByClient = [
  { client: 'VOLCAFE', kg: 184_960 },
  { client: 'RTC', kg: 76_800 },
  { client: 'TOUTON', kg: 57_600 },
  { client: 'ECOFARM', kg: 41_400 },
  { client: 'MURAHO TC', kg: 35_700 },
  { client: 'JA', kg: 26_400 },
  { client: 'DOUQUE', kg: 21_600 },
  { client: 'IRAN', kg: 19_200 },
];

export interface ExportShipmentRow {
  id: string;
  deliveryToNaebDate: string;
  client: string;
  exportedQtyKg: number;
  productSummary?: string;
  exportedProcesses?: Array<{ process: string; grade: string; qtyKg: number }>;
  status: 'PLANNED' | 'SHIPPED' | 'DELIVERED';
}

export const recentExportShipments: ExportShipmentRow[] = [
  { id: 'e1', deliveryToNaebDate: '2026-09-02', client: 'RTC', exportedQtyKg: 38_400, productSummary: 'FULLWASHED A1 / 15+: 18,400kg • NATURAL A1 / 13/14: 20,000kg', exportedProcesses: [{ process: 'FULLWASHED A1', grade: '15+', qtyKg: 18400 }, { process: 'NATURAL A1', grade: '13/14', qtyKg: 20000 }], status: 'DELIVERED' },
  { id: 'e2', deliveryToNaebDate: '2026-09-06', client: 'MURAHO TC', exportedQtyKg: 16_500, productSummary: 'FULLWASHED A1 / GTR 15+: 16,500kg', exportedProcesses: [{ process: 'FULLWASHED A1', grade: 'GTR 15+', qtyKg: 16500 }], status: 'DELIVERED' },
  { id: 'e3', deliveryToNaebDate: '2026-09-08', client: 'IRAN', exportedQtyKg: 19_200, productSummary: 'FW HG / 15+: 19,200kg', exportedProcesses: [{ process: 'FW HG', grade: '15+', qtyKg: 19200 }], status: 'SHIPPED' },
  { id: 'e4', deliveryToNaebDate: '2026-09-11', client: 'TOUTON', exportedQtyKg: 38_400, productSummary: 'SEMI-WASHED A1 / 13/14: 38,400kg', exportedProcesses: [{ process: 'SEMI-WASHED A1', grade: '13/14', qtyKg: 38400 }], status: 'SHIPPED' },
];

export const exportGrades = ['15+', 'GTR 15+', 'CRS 15+', '13/14', '13/14 - GTR', '13/14 - CRS', 'Chips', 'Inkuburano'];
export const dryMillOrigins = ['GITOKI', 'HUMURE', 'KINAZI', 'BUGOYI', 'NYAKIZU', 'BUMBOGO'];
export const clients = ['VOLCAFE', 'RTC', 'TOUTON', 'ECOFARM', 'MURAHO TC', 'JA', 'DOUQUE', 'IRAN', 'SUNDONG'];
