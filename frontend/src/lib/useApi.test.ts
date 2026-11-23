import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { errorText, query } from './useApi';
import { kg, num } from './format';

describe('query()', () => {
  it('skips empty values and the "All" filter', () => {
    expect(query({ status: 'All', search: '', page: 2, facility: null, x: undefined })).toBe('?page=2');
    expect(query({})).toBe('');
  });
});

describe('errorText()', () => {
  it('joins field errors into one readable sentence', () => {
    const err = new ApiError(400, { new_password: ['This password is too common.'], detail: 'Nope' });
    expect(errorText(err)).toBe('new password: This password is too common. · Nope');
  });

  it('falls back for unexpected errors', () => {
    expect(errorText(new Error('boom'))).toMatch(/Something went wrong/);
  });
});

describe('format', () => {
  it('reads API decimals safely', () => {
    expect(num('4131.50')).toBe(4131.5);
    expect(num(null)).toBe(0);
    expect(num('abc')).toBe(0);
    expect(kg('1000')).toMatch(/1.?000/);
  });
});
