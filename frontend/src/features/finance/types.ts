// Shapes of the /api/v1/finance/ endpoints. Decimals arrive as strings.
import type { Decimal } from '../../lib/types';

export interface ExpenseCategory {
  id: string;
  code: string;
  name: string;
  description: string;
  display_order: number;
}

export interface FundAllocation {
  id: string;
  allocation_number: string;
  facility: string;
  facility_name: string;
  allocated_on: string;
  amount: Decimal;
  reference: string;
  notes: string;
  created_by_name: string;
  created_at: string;
}

export interface Expense {
  id: string;
  expense_number: string;
  facility: string;
  facility_name: string;
  category: string;
  category_name: string;
  spent_on: string;
  amount: Decimal;
  description: string;
  quantity: Decimal | null;
  unit: string;
  unit_price: Decimal | null;
  paid_to: string;
  reference: string;
  created_by_name: string;
  created_at: string;
}

export type LedgerKind = 'ALLOCATION' | 'EXPENSE' | 'CHERRY' | 'LABOR';

export interface LedgerEntry {
  date: string;
  kind: LedgerKind;
  number: string;
  facility: string;
  facility_name: string;
  category: string;
  description: string;
  money_in: Decimal;
  money_out: Decimal;
  quantity: Decimal | null;
  unit: string;
  unit_price: Decimal | null;
  paid_to: string;
  reference: string;
  recorded_by: string;
  /** Running balance (ledger only). */
  balance?: Decimal;
}

export interface StationFinance {
  facility: string;
  label: string;
  opening_balance: Decimal;
  allocated: Decimal;
  expenses: Decimal;
  cherry_paid: Decimal;
  labor_paid: Decimal;
  spent: Decimal;
  balance: Decimal;
  owed_to_farmers: Decimal;
}

export interface TimelinePoint {
  period: string;
  allocated: Decimal;
  expenses: Decimal;
  cherry: Decimal;
  labor: Decimal;
  spent: Decimal;
  balance: Decimal;
}

export type FinanceGroup = 'day' | 'week' | 'month';

export interface FinanceSummary {
  stations: Array<{ id: string; name: string }>;
  opening_balance: Decimal;
  allocated: Decimal;
  expenses: Decimal;
  cherry_paid: Decimal;
  labor_paid: Decimal;
  spent: Decimal;
  balance: Decimal;
  owed_to_farmers: Decimal;
  by_category: Array<{ label: string; amount: Decimal; is_expense_category: boolean }>;
  by_station: StationFinance[];
  timeline: TimelinePoint[];
  group: FinanceGroup;
  recent: LedgerEntry[];
}

export interface FinanceLedger {
  stations: Array<{ id: string; name: string }>;
  date_from: string | null;
  date_to: string | null;
  opening_balance: Decimal;
  money_in: Decimal;
  money_out: Decimal;
  closing_balance: Decimal;
  owed_to_farmers: Decimal;
  entries: LedgerEntry[];
}
