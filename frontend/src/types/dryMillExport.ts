export type OriginType = 'OWN_CWS' | 'PARTNER_SUPPLIER';
export type HqItemType = 'PARCH' | 'GREEN';
export type QualityStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';
export type HqProcessingStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface Supplier {
  id: string;
  name: string;
  tin?: string | null;
  phone?: string | null;
}

export interface HqStockReceipt {
  id: string;
  facility_id: string;
  arrival_date: string;
  origin_type: OriginType;
  source_facility_id?: string | null;
  source_supplier_id?: string | null;
  item_type: HqItemType;
  process_type_id?: string | null;
  process_grade_id?: string | null;
  net_weight: number;
  weight_of_bags: number;
  /** generated server-side as net_weight - weight_of_bags */
  pure_weight: number;
  quality_status: QualityStatus;
  processing_status: HqProcessingStatus;
  crop_year_id: string;
}

export interface ExportGrade {
  id: string;
  code: string;
  name: string;
  group_tag?: string | null;
  display_order: number;
}

export type DryMillBatchStatus = 'IN_PROGRESS' | 'COMPLETED';

export interface DryMillBatch {
  id: string;
  batch_no: string;
  facility_id: string;
  processing_date: string;
  origin_type: OriginType;
  input_grade?: string | null;
  parchment_input_qty: number;
  green_output_qty: number;
  /** generated server-side */
  outturn_pct: number;
  status: DryMillBatchStatus;
  crop_year_id: string;
}

export interface DryMillBatchGradeOutput {
  id: string;
  dry_mill_batch_id: string;
  export_grade_id: string;
  qty_kg: number;
  outturn_pct?: number | null;
}

export interface Client {
  id: string;
  name: string;
  country?: string | null;
  contact?: string | null;
}

export type ShipmentStatus = 'PLANNED' | 'SHIPPED' | 'DELIVERED';

export interface ExportShipment {
  id: string;
  client_id: string;
  delivery_to_naeb_date?: string | null;
  exported_quantity?: number | null;
  crop_year_id: string;
  lot_description?: string | null;
  status: ShipmentStatus;
}

export interface ExportShipmentLine {
  id: string;
  export_shipment_id: string;
  export_grade_id: string;
  dry_mill_batch_id?: string | null;
  qty_kg: number;
}

export type CommitmentStatus = 'OPEN' | 'PARTIALLY_FULFILLED' | 'FULFILLED' | 'CANCELLED';

export interface CommittedExportVolume {
  id: string;
  client_id: string;
  process_type_id?: string | null;
  volume_kg: number;
  full_composition?: string | null;
  shipping_period?: string | null;
  crop_year_id: string;
  status: CommitmentStatus;
}

export interface ServiceType {
  id: string;
  code: string;
  name: string;
}

export type ClientServicePaymentStatus = 'YES' | 'NO' | 'PARTIAL';

export interface ClientMillingService {
  id: string;
  client_id: string;
  service_date: string;
  service_type_id: string;
  quantity_kg: number;
  rate_per_kg: number;
  /** generated server-side as quantity_kg * rate_per_kg */
  total_amount: number;
  payment_status: ClientServicePaymentStatus;
}

export interface PssSample {
  id: string;
  sample_date: string;
  origin_facility_id?: string | null;
  origin_supplier_id?: string | null;
  grade_label?: string | null;
  quantity_kg?: number | null;
  defect_pct?: number | null;
  client_id?: string | null;
}
