import { Text } from '@mantine/core';
import { kg, num } from '../../lib/format';
import type { Decimal, ProcessingLot } from '../../lib/types';

/**
 * Estimate vs actual, as served by the API: actual − estimate in kg and as a %
 * of the estimate. null until the actual is recorded (a grade still waiting for
 * its actual is not a loss), and the % is null for a zero estimate.
 */
export interface Variance {
  variance_kg: Decimal | null;
  variance_pct: Decimal | null;
}

/** A processing lot with the per-grade and lot-level variance the API adds. */
export type LotWithVariance = Omit<ProcessingLot, 'results'> & {
  results: Array<ProcessingLot['results'][number] & Variance>;
  notes: string;
  /** Over the grades with an actual recorded only. */
  variance: Variance & { compared_estimated_kg: Decimal | null };
};

const varianceColor = (value: Decimal | null) => {
  if (value === null) return 'dimmed';
  const n = num(value);
  return n > 0 ? 'green.7' : n < 0 ? 'red.7' : undefined;
};

const signed = (n: number, text: string) => `${n > 0 ? '+' : ''}${text}`;

/** "+2.50" / "−2.20" kg: green for a gain, red for a loss, "—" without an actual. */
export function VarianceKg({ value, fw }: { value: Decimal | null; fw?: number }) {
  if (value === null) return <Text size="sm" c="dimmed" span>—</Text>;
  return (
    <Text size="sm" c={varianceColor(value)} fw={fw ?? 600} span style={{ whiteSpace: 'nowrap' }}>
      {signed(num(value), kg(value, 2))}
    </Text>
  );
}

/** "+5.03%" / "−15.49%", coloured like VarianceKg. */
export function VariancePct({ value, fw }: { value: Decimal | null; fw?: number }) {
  if (value === null) return <Text size="sm" c="dimmed" span>—</Text>;
  return (
    <Text size="sm" c={varianceColor(value)} fw={fw ?? 600} span style={{ whiteSpace: 'nowrap' }}>
      {signed(num(value), `${num(value).toFixed(2)}%`)}
    </Text>
  );
}
