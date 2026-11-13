export interface ProcessType {
  id: string;
  facility_id: string;
  code: string;
  name: string;
  is_active: boolean;
}

export interface ProcessGrade {
  id: string;
  process_type_id: string;
  code: string;
  name: string;
  display_order: number;
  is_active: boolean;
}

/** Versioned by crop_year + effective_from/to so ratio changes don't rewrite history. */
export interface ProcessGradeRatio {
  id: string;
  process_type_id: string;
  process_grade_id: string;
  crop_year_id: string;
  ratio: number;
  effective_from: string;
  effective_to?: string | null;
}

export interface SubProcess {
  id: string;
  process_type_id: string;
  facility_id: string;
  name: string;
  is_active: boolean;
}

export type LotStatus = 'IN_PROGRESS' | 'SORTED' | 'CLOSED';

export interface ProcessingLot {
  id: string;
  lot_number: string;
  facility_id: string;
  process_type_id: string;
  sub_process_id?: string | null;
  crop_year_id: string;
  batch_no?: string | null;
  lot_date: string;
  cherry_input_kg: number;
  status: LotStatus;
}

export interface ProcessingLotCherrySource {
  id: string;
  processing_lot_id: string;
  cherry_receipt_id: string;
  allocated_qty_kg: number;
}

/** Written at entry time with the ratio snapshotted, so a later ratio
 * change never silently alters a figure a clerk already saw. */
export interface ProcessingLotEstimate {
  id: string;
  processing_lot_id: string;
  process_grade_id: string;
  cherry_input_kg_snapshot: number;
  ratio_used: number;
  /** generated server-side as cherry_input_kg_snapshot * ratio_used */
  estimated_qty_kg: number;
}

export interface ProcessingLotActual {
  id: string;
  processing_lot_id: string;
  process_grade_id: string;
  cherry_input_kg_snapshot: number;
  actual_qty_kg: number;
  /** generated server-side */
  outturn_pct: number;
}

export type StockMovementType =
  | 'CHERRY_IN'
  | 'PARCHMENT_PRODUCED'
  | 'PARCHMENT_TRANSFER_OUT'
  | 'PARCHMENT_TRANSFER_IN'
  | 'HQ_RECEIVED'
  | 'DRY_MILL_CONSUMED'
  | 'GREEN_PRODUCED'
  | 'EXPORT_SHIPPED'
  | 'CLIENT_SERVICE_IN'
  | 'CLIENT_SERVICE_OUT'
  | 'ADJUSTMENT';

export type StockItemType = 'CHERRY' | 'PARCHMENT' | 'GREEN';

/** Signed from facility_id's perspective: + increases its stock, - decreases it. */
export interface StockMovement {
  id: string;
  movement_type: StockMovementType;
  facility_id: string;
  counterparty_facility_id?: string | null;
  item_type: StockItemType;
  process_grade_id?: string | null;
  export_grade_id?: string | null;
  qty_kg: number;
  reference_table: string;
  reference_id: string;
  movement_date: string;
  crop_year_id: string;
}

/**
 * Pure function mirroring processing_lot_estimates.estimated_qty_kg's
 * server-side generated-column formula, used for instant client-side
 * (and offline) display the moment a clerk types cherry_input_kg.
 */
export function calculateEstimate(cherryInputKg: number, ratio: number): number {
  return Math.round(cherryInputKg * ratio * 100) / 100;
}

/** Mirrors processing_lot_actuals.outturn_pct's generated-column formula. */
export function calculateOutturnPct(actualQtyKg: number, cherryInputKg: number): number {
  if (cherryInputKg <= 0) return 0;
  return Math.round((actualQtyKg / cherryInputKg) * 100 * 1000) / 1000;
}
