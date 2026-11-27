// Finance helpers shared by the pages: money formatting, who may do what, labels.
import type { CurrentUser, RoleCode } from '../../lib/access';
import { num } from '../../lib/format';
import type { LedgerKind } from './types';

/** 1234567.5 -> "1,234,568" (negatives keep their "-"). */
export function money(value: string | number | null | undefined): string {
  const n = Math.round(num(value));
  return `${n < 0 ? '-' : ''}${Math.abs(n).toLocaleString('en-US')}`;
}

/** "1,234,568 RWF" (negatives keep their "-"). */
export function moneyRwf(value: string | number | null | undefined): string {
  return `${money(value)} RWF`;
}

function hasRole(user: CurrentUser | null, roles: RoleCode[]): boolean {
  return user?.roles.some((assignment) => roles.includes(assignment.role)) ?? false;
}

/** May record expenses (a station manager for their station, or HQ). */
export function canRecordExpense(user: CurrentUser | null): boolean {
  return hasRole(user, ['ADMIN', 'HQ_FINANCE', 'CWS_MANAGER']);
}

/** May give funds and correct / delete saved finance entries. */
export function isFinanceAdmin(user: CurrentUser | null): boolean {
  return hasRole(user, ['ADMIN', 'HQ_FINANCE']);
}

export const KIND_LABEL: Record<LedgerKind, string> = {
  ALLOCATION: 'Funds received',
  EXPENSE: 'Expense',
  CHERRY: 'Cherry payment',
  LABOR: 'Casual labor',
};

/** Today as YYYY-MM-DD in local time. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
