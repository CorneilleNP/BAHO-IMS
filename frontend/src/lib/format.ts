/** API decimals arrive as strings; turn anything numeric-ish into a number (NaN -> 0). */
export function num(value: string | number | null | undefined): number {
  const n = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function kg(value: string | number | null | undefined, digits = 0): string {
  return num(value).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: Math.max(digits, 2) });
}

export function rwf(value: string | number | null | undefined): string {
  return `${num(value).toLocaleString(undefined, { maximumFractionDigits: 0 })} RWF`;
}

export function pct(value: string | number | null | undefined, digits = 1): string {
  return `${num(value).toFixed(digits)}%`;
}

/** "+12.5% vs 2026-09-16" style delta label, or undefined when there's nothing to compare. */
export function changeLabel(change: string | number | null | undefined, against: string | null | undefined): string | undefined {
  if (change === null || change === undefined || !against) return undefined;
  const value = num(change);
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}% vs ${against}`;
}

export function today(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** Chart rows for Mantine BarChart from the API's ranked {label, kg} lists. */
export function chartRows(rows: Array<{ label: string; kg: string | number }>): Array<{ label: string; kg: number }> {
  return rows.map((row) => ({ label: row.label, kg: num(row.kg) }));
}

/** Same formulas as the backend (round half up). */
export function calculateEstimate(cherryInputKg: number, ratio: number): number {
  return Math.round(cherryInputKg * ratio * 100) / 100;
}

export function calculateOutturnPct(actualQtyKg: number, inputKg: number): number {
  if (inputKg <= 0) return 0;
  return Math.round((actualQtyKg / inputKg) * 100 * 1000) / 1000;
}

/** [from, to] as "YYYY-MM-DD" strings; null = open-ended. Used by DateRangeFilter. */
export type DateRange = [string | null, string | null];
export const ANY_DATE: DateRange = [null, null];

/** Whole kilograms for headline figures (KPI cards), e.g. 1,990,723. */
export function kgWhole(value: string | number | null | undefined): string {
  return Math.round(num(value)).toLocaleString();
}
