import type { PaymentStatus } from '../../lib/types';

export const PAYMENT_LABEL: Record<PaymentStatus, string> = { PAID: 'Paid', PARTIAL: 'Partly paid', UNPAID: 'Not paid' };
export const PAYMENT_COLOR: Record<PaymentStatus, string> = { PAID: 'teal', PARTIAL: 'orange', UNPAID: 'red' };
export const METHOD_LABEL: Record<string, string> = { CASH: 'Cash', BANK: 'Bank', MOBILE_MONEY: 'Mobile money' };
