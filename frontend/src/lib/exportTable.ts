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

/**
 * API decimals arrive as strings: store numeric-looking ones as numbers so
 * Excel can add them up. Phone numbers ("0788…"), national IDs (16 digits) and
 * codes stay text: a leading zero or more than 15 digits would be lost.
 */
const NUMERIC = /^-?(0|[1-9]\d{0,14})(\.\d+)?$/;

export function cellValue(value: string | number | null | undefined): string | number {
  if (typeof value === 'string' && NUMERIC.test(value)) return Number(value);
  return value ?? '';
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
        return cellValue(value);
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

/** One sheet of a detailed report workbook. */
export interface ReportSheet<T = never> {
  name: string;
  columns: ExportColumn<T>[];
  rows: T[];
  /** Bold "Total" row at the bottom: header -> value. */
  totals?: Record<string, number>;
}

/** Key/value lines shown on the first sheet (what the report covers). */
export type ReportInfo = Array<[string, string | number]>;


/**
 * A detailed report: several sheets in one .xlsx (exceljs loaded on demand).
 * The first sheet ("Report") says what the file covers; each data sheet has a
 * styled, frozen header with filters, numbers stored as numbers, and totals.
 */
export async function exportWorkbook(name: string, info: ReportInfo, sheets: ReportSheet<any>[]) {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  workbook.creator = 'Baho IMS';
  workbook.created = new Date();

  const cover = workbook.addWorksheet('Report');
  cover.columns = [{ width: 28 }, { width: 60 }];
  cover.addRow(['Baho Coffee Company Ltd']).font = { bold: true, size: 14 };
  cover.addRow([]);
  info.forEach(([label, value]) => {
    const row = cover.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  });
  cover.addRow(['Generated', new Date().toLocaleString()]).getCell(1).font = { bold: true };
  cover.addRow([]);
  cover.addRow(['Sheets']).font = { bold: true };
  sheets.forEach((s) => cover.addRow([s.name, `${s.rows.length} row${s.rows.length === 1 ? '' : 's'}`]));

  sheets.forEach((s) => {
    const sheet = workbook.addWorksheet(s.name.slice(0, 31));
    sheet.columns = s.columns.map((c) => ({ header: c.header, key: c.header, width: Math.min(40, Math.max(11, c.header.length + 3)) }));
    s.rows.forEach((row) =>
      sheet.addRow(
        s.columns.map((c) => {
          const value = c.value(row);
          return cellValue(value);
        }),
      ),
    );
    if (s.totals && s.rows.length) {
      const total = sheet.addRow(s.columns.map((c, i) => (i === 0 ? 'Total' : (s.totals?.[c.header] ?? ''))));
      total.font = { bold: true };
      total.eachCell((cell) => {
        cell.border = { top: { style: 'thin' } };
      });
    }
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B5B40' } };
    header.alignment = { vertical: 'middle', wrapText: true };
    header.height = 30;
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    if (s.columns.length) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s.columns.length } };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  download(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${name}-${stamp()}.xlsx`,
  );
}
