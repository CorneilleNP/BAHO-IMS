// Shapes returned by the Django API. Decimal values arrive as strings
// (e.g. "4131.00") so no precision is lost; convert with num() from format.ts.

export type Decimal = string;

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface Facility extends Located {
  id: string;
  facility_type: 'CWS' | 'HQ_DRY_MILL';
  code: string;
  name: string;
  is_active: boolean;
}

export interface Farmer extends Located {
  id: string;
  farmer_code: string;
  full_name: string;
  gender: '' | 'M' | 'F' | 'O';
  national_id: string;
  phone: string;
  home_facility: string;
  home_facility_name: string;
  household_size: number | null;
  land_area_ha: Decimal | null;
  is_active: boolean;
}

export type CherryGrade = 'GOOD' | 'FLOAT';
export type PaymentMethod = '' | 'CASH' | 'BANK' | 'MOBILE_MONEY';

export interface CherryReceipt {
  id: string;
  grn_number: string;
  facility: string;
  facility_name: string;
  farmer: string;
  farmer_name: string;
  farmer_code: string;
  farmer_phone: string;
  farmer_national_id: string;
  farmer_location: LocationPath;
  created_by_name: string;
  received_on: string;
  payment_method: PaymentMethod;
  payment_status: 'PAID' | 'UNPAID';
  notes: string;
  lines: Array<{
    cherry_grade: CherryGrade;
    quantity_kg: Decimal;
    price_per_kg: Decimal;
    transport_cost: Decimal;
    commission: Decimal;
    line_amount: Decimal;
  }>;
  total_kg: Decimal;
  total_amount: Decimal;
}

export interface ProcessGradeConfig {
  id: string;
  code: string;
  name: string;
  display_order: number;
  ratio: Decimal; // 0–1
}

export interface ProcessType {
  id: string;
  facility: string;
  facility_name: string;
  process: string;
  process_name: string;
  sub_process_id: string | null;
  name: string;
  sub_process: string;
  is_active: boolean;
  grades: ProcessGradeConfig[];
  total_ratio: Decimal;
}

/** A catalogue process's grade (no ratio - that's per-station, see ProcessGradeConfig). */
export interface CatalogProcessGrade {
  id: string;
  code: string;
  name: string;
  display_order: number;
}

export interface ProcessingLot {
  id: string;
  lot_number: string;
  facility: string;
  facility_name: string;
  process_type: string;
  process_label: string;
  lot_date: string;
  cherry_input_kg: Decimal;
  status: 'IN_PROGRESS' | 'SORTED' | 'CLOSED';
  results: Array<{
    grade: string;
    grade_code: string;
    grade_name: string;
    ratio_used: Decimal;
    estimated_kg: Decimal;
    actual_kg: Decimal | null;
    outturn_pct: Decimal | null;
  }>;
  total_estimated_kg: Decimal;
  total_actual_kg: Decimal | null;
  total_outturn_pct: Decimal | null;
}

export interface LotSummary {
  lots: number;
  open_lots: number;
  cherry_input_kg: Decimal;
  estimated_kg: Decimal;
  actual_kg: Decimal;
  outturn_pct: Decimal;
  change_vs_previous_day_pct: Decimal | null;
  last_day: string | null;
  by_grade: Array<{ code: string; name: string; estimated_kg: Decimal; actual_kg: Decimal }>;
  by_station: RankedKg[];
  by_process: RankedKg[];
  /** Sorted at the station vs already delivered to HQ dry mill, by station/process/grade. Always all-time. */
  cws_stock: Array<{
    facility_name: string;
    process_name: string;
    sub_process_name: string;
    grade: string;
    processed_kg: Decimal;
    delivered_kg: Decimal;
    balance_kg: Decimal;
  }>;
}

export type OriginType = 'OWN_CWS' | 'PARTNER_SUPPLIER';

export interface CoffeeSource {
  origin_type: OriginType;
  id: string;
  code: string;
  name: string;
}

export interface Supplier extends Located {
  id: string;
  name: string;
  tin: string;
  contact_name: string;
  phone: string;
  notes: string;
  is_active: boolean;
}

export interface ExportGrade {
  id: string;
  code: string;
  name: string;
  display_order: number;
}

export type QualityStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';
export type ProcessingStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

/** Every column of the BAHO STOCK UPDATE sheet + the calculated stock position. */
export interface HqStockReceipt {
  id: string;
  receipt_number: string;
  arrival_date: string;
  crop_year: string;
  origin_type: OriginType;
  source_facility: string | null;
  source_supplier: string | null;
  source_name: string;
  source_code: string;
  source_raw: string;
  item_type: 'PARCH' | 'GREEN';
  process: string | null;
  process_name: string;
  sub_process: string | null;
  sub_process_name: string;
  process_raw: string;
  grade: string;
  lot_reference: string;
  purchase_contract_number: string;
  weighing_status: 'PENDING' | 'DONE';
  delivery_note_no: string;
  delivery_note_qty_kg: Decimal | null;
  gross_weight_kg: Decimal | null;
  net_weight_kg: Decimal;
  number_of_bags: number | null;
  tare_per_bag_kg: Decimal | null;
  weight_of_bags_kg: Decimal;
  pure_weight_kg: Decimal;
  variance_kg: Decimal | null;
  wrn_number: string;
  warehouse_cell: string;
  stock_card_number: string;
  quality_status: QualityStatus;
  quality_comment: string;
  processing_status: ProcessingStatus;
  processing_date: string | null;
  processed_kg: Decimal;
  adjusted_kg: Decimal;
  stock_balance_kg: Decimal;
  import_batch: string;
  source_row: number | null;
  created_by_name: string;
  updated_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface StockAdjustment {
  id: string;
  qty_kg: Decimal;
  reason: string;
  adjusted_on: string;
  created_by_name: string;
  created_at: string;
}

export interface HqStockReceiptDetail extends HqStockReceipt {
  movements: Array<{ batch: string; batch_no: string; processing_date: string; qty_kg: Decimal }>;
  adjustments: StockAdjustment[];
}

export interface HistoryEntry {
  date: string;
  user: string;
  type: 'created' | 'changed' | 'deleted' | 'voided';
  changes: Array<{ field: string; old: unknown; new: unknown }>;
}

export interface StockTotals {
  receipts: number;
  net_weight_kg: Decimal;
  weight_of_bags_kg: Decimal;
  pure_weight_kg: Decimal;
  processed_kg: Decimal;
  adjusted_kg: Decimal;
  stock_balance_kg: Decimal;
}

// --- Process catalogue (5 processes and their sub-processes) -----------------------

export interface CatalogProcess {
  id: string;
  code: string;
  name: string;
  display_order: number;
  sub_processes: number;
  receipts: number;
  net_weight_kg: Decimal;
}

export interface CatalogSubProcess {
  id: string;
  name: string;
  process: string | null;
  process_name: string;
  suggested_process: { id: string; name: string } | null;
  is_active: boolean;
  aliases: string[];
  receipts: number;
  net_weight_kg: Decimal;
}

export interface DryMillBatch {
  id: string;
  batch_no: string;
  processing_date: string;
  origin_type: OriginType | 'MIXED';
  source_name: string;
  source_code: string;
  process_product: string;
  parch_input_kg: Decimal;
  inputs: Array<{
    receipt: string;
    receipt_number: string;
    source_name: string;
    process_name: string;
    sub_process_name: string;
    grade: string;
    qty_kg: Decimal;
  }>;
  outputs: Array<{ export_grade: string; grade_name: string; qty_kg: Decimal }>;
  green_output_kg: Decimal;
  outturn_pct: Decimal;
  status: 'IN_PROGRESS' | 'COMPLETED';
}

export interface Client {
  id: string;
  name: string;
  country: string;
  contact_name: string;
  is_active: boolean;
}

export interface ExportShipment {
  id: string;
  shipment_no: string;
  client: string;
  client_name: string;
  delivery_to_naeb_date: string;
  status: 'PLANNED' | 'SHIPPED' | 'DELIVERED';
  lines: Array<{
    process: string | null;
    process_name: string;
    sub_process: string | null;
    sub_process_name: string;
    source_facility: string | null;
    source_supplier: string | null;
    source_name: string;
    process_product: string;
    export_grade: string;
    grade_name: string;
    qty_kg: Decimal;
  }>;
  total_qty_kg: Decimal;
}

export interface RankedKg {
  label: string;
  kg: Decimal;
}

interface StockFigures {
  net_weight_kg: Decimal;
  pure_weight_kg: Decimal;
  weight_of_bags_kg: Decimal;
  processed_kg: Decimal;
  adjusted_kg: Decimal;
  stock_balance_kg: Decimal;
  receipts: number;
}

export interface StockSummary {
  date: string;
  day: StockFigures;
  previous_date: string | null;
  change_vs_previous_pct: Decimal | null;
  season: StockFigures;
  awaiting_quality: StockFigures;
  by_process: RankedKg[];
  by_sub_process: RankedKg[];
  by_grade: RankedKg[];
  balance_by_grade: RankedKg[];
  by_source: RankedKg[];
  options: { processes: Array<{ id: string; name: string }>; grades: string[]; dates: string[] };
}

export interface ProcessingSummary {
  totals: {
    batches: number;
    parch_input_kg: Decimal;
    green_output_kg: Decimal;
    outturn_pct: Decimal;
    hg_kg: Decimal;
    hg_outturn_pct: Decimal;
  };
  change_vs_previous_day_pct: Decimal | null;
  last_day: string | null;
  /** HQ parchment received vs milled vs in stock (all dates), same process/sub-process/grade/source filters. */
  stock: {
    receipts: number;
    received_kg: Decimal;
    milled_kg: Decimal;
    adjusted_kg: Decimal;
    balance_kg: Decimal;
    available_to_mill_kg: Decimal;
    balance_pct: Decimal;
  };
  by_grade: Array<{ code: string; name: string; kg: Decimal }>;
  by_source: RankedKg[];
  by_process: RankedKg[];
  options: { sources: string[]; processes: Array<{ id: string; name: string }>; grades: string[]; process_products: string[] };
}

export interface ExportSummary {
  exported_kg: Decimal;
  produced_kg: Decimal;
  stock_balance_kg: Decimal;
  by_grade: Array<{
    id: string;
    code: string;
    name: string;
    exported_kg: Decimal;
    produced_kg: Decimal;
    balance_kg: Decimal;
  }>;
  by_process: Array<{
    id: string;
    name: string;
    produced_kg: Decimal;
    exported_kg: Decimal;
    balance_kg: Decimal;
  }>;
  by_source: Array<{
    label: string;
    produced_kg: Decimal;
    exported_kg: Decimal;
    balance_kg: Decimal;
  }>;
  by_client: RankedKg[];
  options: { processes: Array<{ id: string; name: string }>; sources: string[]; process_products: string[] };
}

interface CherryGradeFigures {
  kg: Decimal;
  amount: Decimal;
  /** Full cost per kg: cherry price + transport + commission, same total paid to the farmer. */
  avg_cost_per_kg: Decimal;
}

export interface CwsSummary {
  receipts: number;
  total_kg: Decimal;
  total_amount: Decimal;
  good: CherryGradeFigures;
  float: CherryGradeFigures;
  by_station: RankedKg[];
  recent_farmers: Array<{
    id: string;
    farmer_code: string;
    full_name: string;
    phone: string;
    home_facility_name: string;
    location_label: string;
    household_size: number | null;
    land_area_ha: Decimal | null;
    created_at: string;
  }>;
}

// --- Rwanda locations (one shared hierarchy) -----------------------------------

export const LOCATION_LEVELS = ['PROVINCE', 'DISTRICT', 'SECTOR', 'CELL', 'VILLAGE'] as const;
export type LocationLevel = (typeof LOCATION_LEVELS)[number];

export interface LocationUnit {
  id: string;
  parent: string | null;
  level: LocationLevel;
  name: string;
  has_children: boolean;
}

type LocationRef = { id: string; name: string } | null;

export interface LocationPath {
  province: LocationRef;
  district: LocationRef;
  sector: LocationRef;
  cell: LocationRef;
  village: LocationRef;
}

export interface TransferWeighing {
  id?: string;
  bags: number;
  weight_kg: Decimal;
}

/** One process/sub-process/grade on a delivery note (a truck can carry several). */
export interface CwsTransferLine {
  id: string;
  process: string;
  process_name: string;
  sub_process: string | null;
  sub_process_name: string;
  grade: string;
  grade_code: string;
  moisture_content_pct: Decimal | null;
  number_of_bags: number;
  gross_weight_kg: Decimal;
  weight_of_bags_kg: Decimal;
  net_weight_kg: Decimal;
  weighings: TransferWeighing[];
}

/** What dry mill sees for a line before it has confirmed its own weighing - none of the station's figures. */
export interface CwsTransferLineBlind {
  id: string;
  process_name: string;
  sub_process_name: string;
  grade_code: string;
}

/** A CWS's own record of a delivery note it loaded for dry mill (blind to dry mill until confirmed). */
export interface CwsTransfer {
  id: string;
  delivery_note_no: string;
  facility: string;
  facility_name: string;
  transfer_date: string;
  status: 'DRAFT' | 'SUBMITTED';
  notes: string;
  lines: CwsTransferLine[];
  created_at: string;
}

export type VarianceStatus = 'MATCH' | 'STOCK_LOSS' | 'STOCK_GAIN';

/** Station minus ours, for each figure - null until the receipt is locked. */
export interface TransferLineVariance {
  number_of_bags: number;
  gross_weight_kg: Decimal;
  weight_of_bags_kg: Decimal;
  net_weight_kg: Decimal;
}

/** Dry mill's own, independent weighing of one of the CWS's lines. */
export interface DryMillTransferReceiptLine {
  id: string;
  cws_line: CwsTransferLine | CwsTransferLineBlind;
  moisture_content_pct: Decimal | null;
  number_of_bags: number;
  gross_weight_kg: Decimal;
  weight_of_bags_kg: Decimal;
  net_weight_kg: Decimal;
  variance_status: VarianceStatus | '';
  variance_kg: Decimal | null;
  variance: TransferLineVariance | null;
  stock_receipt_number: string;
  weighings: TransferWeighing[];
}

/** HQ dry mill's own, independent record of the same delivery note, line by line.
 * PENDING = still weighing, blind to the station's figures. LOCKED = weighing
 * frozen and variance revealed, comment not yet written. CONFIRMED = final. */
export interface DryMillTransferReceipt {
  id: string;
  delivery_note_no: string;
  facility_name: string;
  transfer_date: string;
  status: 'PENDING' | 'LOCKED' | 'CONFIRMED';
  comment: string;
  is_locked: boolean;
  confirmed_by_name: string;
  confirmed_at: string | null;
  unlocked_by_name: string;
  unlocked_at: string | null;
  lines: DryMillTransferReceiptLine[];
  created_at: string;
}

/** Transfers dashboard: confirmed CWS -> dry mill reconciliation totals, one row per line. */
export interface TransferSummary {
  count: number;
  gross_weight_kg: Decimal;
  weight_of_bags_kg: Decimal;
  net_weight_kg: Decimal;
  stock_loss_kg: Decimal;
  stock_gain_kg: Decimal;
  rows: Array<{
    delivery_note_no: string;
    facility_name: string;
    transfer_date: string;
    process_name: string;
    sub_process_name: string;
    grade: string;
    cws_net_kg: Decimal;
    dry_mill_net_kg: Decimal;
    variance_kg: Decimal;
    variance_status: VarianceStatus;
    comment: string;
  }>;
}

/** Fields every located record (farmer, supplier, station) returns. */
export interface Located {
  location: string | null;
  location_path: LocationPath;
  location_label: string;
}
