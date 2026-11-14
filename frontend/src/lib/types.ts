// Shapes returned by the Django API. Decimal values arrive as strings
// (e.g. "4131.00") so no precision is lost; convert with num() from format.ts.

export type Decimal = string;

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface Facility {
  id: string;
  facility_type: 'CWS' | 'HQ_DRY_MILL';
  code: string;
  name: string;
  district: string;
  sector: string;
  is_active: boolean;
}

export interface Farmer {
  id: string;
  farmer_code: string;
  full_name: string;
  gender: '' | 'M' | 'F' | 'O';
  national_id: string;
  phone: string;
  home_facility: string;
  home_facility_name: string;
  sector: string;
  cell: string;
  village: string;
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
  name: string;
  sub_process: string;
  is_active: boolean;
  grades: ProcessGradeConfig[];
  total_ratio: Decimal;
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

export type OriginType = 'OWN_CWS' | 'PARTNER_SUPPLIER';

export interface CoffeeSource {
  origin_type: OriginType;
  id: string;
  code: string;
  name: string;
}

export interface Supplier {
  id: string;
  name: string;
  tin: string;
  contact_name: string;
  phone: string;
  province: string;
  district: string;
  sector: string;
  notes: string;
  is_active: boolean;
}

export interface ExportGrade {
  id: string;
  code: string;
  name: string;
  display_order: number;
}

export interface HqStockReceipt {
  id: string;
  receipt_number: string;
  arrival_date: string;
  origin_type: OriginType;
  source_name: string;
  source_code: string;
  process: string;
  grade: string;
  lot_reference: string;
  delivery_note_no: string;
  delivery_note_qty_kg: Decimal | null;
  net_weight_kg: Decimal;
  weight_of_bags_kg: Decimal;
  pure_weight_kg: Decimal;
  variance_kg: Decimal | null;
  quality_status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  processing_status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
}

export interface DryMillBatch {
  id: string;
  batch_no: string;
  processing_date: string;
  origin_type: OriginType;
  source_name: string;
  source_code: string;
  process_product: string;
  parch_input_kg: Decimal;
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
  lines: Array<{ process_product: string; export_grade: string; grade_name: string; qty_kg: Decimal }>;
  total_qty_kg: Decimal;
}

export interface RankedKg {
  label: string;
  kg: Decimal;
}

export interface StockSummary {
  date: string;
  day: { net_weight_kg: Decimal; pure_weight_kg: Decimal; weight_of_bags_kg: Decimal; receipts: number };
  previous_date: string | null;
  change_vs_previous_pct: Decimal | null;
  season: { net_weight_kg: Decimal; pure_weight_kg: Decimal; weight_of_bags_kg: Decimal; receipts: number };
  by_process: RankedKg[];
  by_grade: RankedKg[];
  by_source: RankedKg[];
  options: { processes: string[]; grades: string[]; dates: string[] };
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
  by_grade: Array<{ code: string; name: string; kg: Decimal }>;
  by_source: RankedKg[];
  options: { sources: string[]; process_products: string[]; dates: string[] };
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
  by_client: RankedKg[];
  options: { process_products: string[] };
}
