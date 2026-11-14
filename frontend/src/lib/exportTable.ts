import { api } from './api';
import type { Paginated } from './types';

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

/** Every row of a paginated list endpoint (follows `next` pages), for exports. */
export async function fetchAllPages<T>(path: string): Promise<T[]> {
  const rows: T[] = [];
  const separator = path.includes('?') ? '&' : '?';
  for (let page = 1; page < 200; page += 1) {
    const data = await api<Paginated<T>>(`${path}${separator}page=${page}&page_size=500`);
    rows.push(...data.results);
    if (!data.next) break;
  }
  return rows;
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** CSV with a UTF-8 BOM so Excel opens names with accents correctly. */
export function exportCsv<T>(name: string, columns: ExportColumn<T>[], rows: T[]) {
  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [columns.map((c) => escape(c.header)).join(','), ...rows.map((row) => columns.map((c) => escape(c.value(row))).join(','))];
  download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${name}-${stamp()}.csv`);
}

/** Real .xlsx (numbers stay numbers). exceljs is loaded only when someone exports. */
export async function exportExcel<T>(name: string, columns: ExportColumn<T>[], rows: T[]) {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  workbook.creator = 'Baho IMS';
  const sheet = workbook.addWorksheet(name.slice(0, 31));
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.header, width: Math.max(12, c.header.length + 4) }));
  rows.forEach((row) => {
    sheet.addRow(
      columns.map((c) => {
        const value = c.value(row);
        // API decimals are strings: store numeric-looking values as numbers.
        return typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : (value ?? '');
      }),
    );
  });
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  const buffer = await workbook.xlsx.writeBuffer();
  download(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${name}-${stamp()}.xlsx`,
  );
}
