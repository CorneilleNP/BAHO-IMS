export type PaymentMethod = 'CASH' | 'BANK' | 'MOBILE_MONEY';
export type PaymentStatus = 'PAID' | 'PARTIAL' | 'UNPAID';
export type CherryGrade = 'GOOD' | 'FLOAT';

export interface CherryReceipt {
  id: string;
  grn_number: string;
  facility_id: string;
  farmer_id: string;
  crop_year_id: string;
  received_at: string;
  payment_method?: PaymentMethod | null;
  payment_status: PaymentStatus;
  notes?: string | null;
}

export interface CherryReceiptLine {
  id: string;
  cherry_receipt_id: string;
  cherry_grade: CherryGrade;
  quantity_kg: number;
  farm_price_per_kg: number;
  transport_cost: number;
  commission: number;
  /** generated server-side as quantity_kg * farm_price_per_kg */
  line_amount: number;
}

export interface CherryPayment {
  id: string;
  cherry_receipt_id: string;
  paid_at: string;
  amount: number;
  method: PaymentMethod;
}

export type LedgerDirection = 'IN' | 'OUT';
export type LedgerSourceType = 'CHERRY_PURCHASE' | 'EXPENSE' | 'BANK_DEPOSIT' | 'OTHER';

export interface ExpenseCategory {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

export interface CashLedgerEntry {
  id: string;
  facility_id: string;
  crop_year_id: string;
  entry_date: string;
  voucher_no?: string | null;
  payee_name?: string | null;
  description?: string | null;
  direction: LedgerDirection;
  amount: number;
  source_type: LedgerSourceType;
  expense_category_id?: string | null;
  linked_cherry_receipt_id?: string | null;
}
