import { describe, expect, it } from 'vitest';
import { cellValue } from './exportTable';

describe('cellValue (Excel exports)', () => {
  it('stores amounts and kg as numbers', () => {
    expect(cellValue('98715.00')).toBe(98715);
    expect(cellValue('-2.20')).toBe(-2.2);
    expect(cellValue('0.14')).toBe(0.14);
    expect(cellValue(12)).toBe(12);
  });
  it('keeps phone numbers, national IDs and codes as text', () => {
    expect(cellValue('0788123456')).toBe('0788123456');
    expect(cellValue('1198080012345678')).toBe('1198080012345678');
    expect(cellValue('GITOKI-2026-00001')).toBe('GITOKI-2026-00001');
  });
  it('writes empty cells for missing values', () => {
    expect(cellValue(null)).toBe('');
    expect(cellValue(undefined)).toBe('');
  });
});
