/**
 * Station finance report, as PDF (jsPDF + autotable, loaded on demand) or Excel
 * (exportWorkbook): summary, spending by category, by month and the cash book
 * with a running balance. Data: /finance/ledger/ + /finance/summary/.
 */
import { exportWorkbook, type ReportInfo } from '../../lib/exportTable';
import { num } from '../../lib/format';
import { query } from '../../lib/useApi';
import { api } from '../../lib/api';
import { KIND_LABEL, money } from './financeUtils';
import type { FinanceLedger, FinanceSummary, LedgerEntry, TimelinePoint } from './types';

export interface FinanceReportFilters {
  station: string | null;
  stationLabel: string;
  stationCode: string;
  dateFrom: string | null;
  dateTo: string | null;
}

export interface FinanceReportData {
  ledger: FinanceLedger;
  summary: FinanceSummary;
}

export async function loadFinanceReport(f: FinanceReportFilters): Promise<FinanceReportData> {
  const params = { station: f.station, date_from: f.dateFrom, date_to: f.dateTo };
  const [ledger, summary] = await Promise.all([
    api<FinanceLedger>(`/finance/ledger/${query(params)}`),
    api<FinanceSummary>(`/finance/summary/${query({ ...params, group: 'month' })}`),
  ]);
  return { ledger, summary };
}

function period(f: FinanceReportFilters): string {
  return `${f.dateFrom ?? 'beginning'} to ${f.dateTo ?? 'today'}`;
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function fileBase(f: FinanceReportFilters): string {
  return `finance-${(f.stationCode || 'all').toLowerCase()}`;
}

const monthLabel = (p: TimelinePoint) =>
  new Date(`${p.period}T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

// ---- Excel -----------------------------------------------------------------

export async function downloadFinanceExcel(f: FinanceReportFilters, { ledger, summary }: FinanceReportData) {
  const info: ReportInfo = [
    ['Report', 'Station finance'],
    ['Station', f.stationLabel],
    ['Period', period(f)],
    ['Opening balance (RWF)', num(ledger.opening_balance)],
    ['Funds received (RWF)', num(summary.allocated)],
    ['Spent - expenses (RWF)', num(summary.expenses)],
    ['Spent - cherry paid to farmers (RWF)', num(summary.cherry_paid)],
    ['Spent - casual labor (RWF)', num(summary.labor_paid)],
    ['Spent - total (RWF)', num(summary.spent)],
    ['Closing balance (RWF)', num(ledger.closing_balance)],
    ['Still owed to farmers (RWF)', num(ledger.owed_to_farmers)],
  ];
  await exportWorkbook(fileBase(f), info, [
    {
      name: 'Cash book',
      rows: ledger.entries,
      columns: [
        { header: 'Date', value: (e: LedgerEntry) => e.date },
        { header: 'Number', value: (e: LedgerEntry) => e.number },
        { header: 'Station', value: (e: LedgerEntry) => e.facility_name },
        { header: 'Type', value: (e: LedgerEntry) => KIND_LABEL[e.kind] },
        { header: 'Category', value: (e: LedgerEntry) => e.category },
        { header: 'Description', value: (e: LedgerEntry) => e.description },
        { header: 'Quantity', value: (e: LedgerEntry) => e.quantity ?? '' },
        { header: 'Unit', value: (e: LedgerEntry) => e.unit },
        { header: 'Unit price', value: (e: LedgerEntry) => e.unit_price ?? '' },
        { header: 'Paid to', value: (e: LedgerEntry) => e.paid_to },
        { header: 'Reference', value: (e: LedgerEntry) => e.reference },
        { header: 'Money in (RWF)', value: (e: LedgerEntry) => (num(e.money_in) ? e.money_in : '') },
        { header: 'Money out (RWF)', value: (e: LedgerEntry) => (num(e.money_out) ? e.money_out : '') },
        { header: 'Balance (RWF)', value: (e: LedgerEntry) => e.balance ?? '' },
        { header: 'Recorded by', value: (e: LedgerEntry) => e.recorded_by },
      ],
      totals: { 'Money in (RWF)': num(ledger.money_in), 'Money out (RWF)': num(ledger.money_out) },
    },
    {
      name: 'By category',
      rows: summary.by_category,
      columns: [
        { header: 'Category', value: (c: FinanceSummary['by_category'][number]) => c.label },
        { header: 'Amount (RWF)', value: (c: FinanceSummary['by_category'][number]) => c.amount },
      ],
      totals: { 'Amount (RWF)': num(summary.spent) },
    },
    {
      name: 'By month',
      rows: summary.timeline,
      columns: [
        { header: 'Month', value: monthLabel },
        { header: 'Funds received (RWF)', value: (p: TimelinePoint) => p.allocated },
        { header: 'Expenses (RWF)', value: (p: TimelinePoint) => p.expenses },
        { header: 'Cherry paid (RWF)', value: (p: TimelinePoint) => p.cherry },
        { header: 'Casual labor (RWF)', value: (p: TimelinePoint) => p.labor },
        { header: 'Spent (RWF)', value: (p: TimelinePoint) => p.spent },
        { header: 'Balance at month end (RWF)', value: (p: TimelinePoint) => p.balance },
      ],
      totals: {
        'Funds received (RWF)': num(summary.allocated),
        'Expenses (RWF)': num(summary.expenses),
        'Cherry paid (RWF)': num(summary.cherry_paid),
        'Casual labor (RWF)': num(summary.labor_paid),
        'Spent (RWF)': num(summary.spent),
      },
    },
  ]);
}

// ---- PDF -------------------------------------------------------------------

const GREEN: [number, number, number] = [11, 91, 64];
const RED: [number, number, number] = [200, 30, 30];

export async function downloadFinancePdf(f: FinanceReportFilters, { ledger, summary }: FinanceReportData) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const lastY = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 0;
  const rwf = (value: string | number | null | undefined) => `${money(value)} RWF`;

  // Title block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...GREEN);
  doc.text('Baho Coffee Company Ltd - Station finance report', 14, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);
  doc.text(`Station: ${f.stationLabel}`, 14, 23);
  doc.text(`Period: ${period(f)}`, 14, 28);
  doc.text(`Generated: ${new Date().toLocaleString('en-GB')}`, pageWidth - 14, 23, { align: 'right' });

  // Summary
  const negative = (value: string | number) => num(value) < 0;
  autoTable(doc, {
    startY: 33,
    theme: 'grid',
    head: [['Summary', 'Amount']],
    body: [
      ['Opening balance', rwf(ledger.opening_balance)],
      ['Funds received', rwf(summary.allocated)],
      ['Spent - expenses', rwf(summary.expenses)],
      ['Spent - cherry paid to farmers', rwf(summary.cherry_paid)],
      ['Spent - casual labor', rwf(summary.labor_paid)],
      ['Total spent', rwf(summary.spent)],
      ['Closing balance', rwf(ledger.closing_balance)],
      ['Still owed to farmers (not yet paid)', rwf(ledger.owed_to_farmers)],
    ],
    tableWidth: 120,
    styles: { fontSize: 9 },
    headStyles: { fillColor: GREEN },
    columnStyles: { 1: { halign: 'right' } },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const label = String(data.row.cells[0]?.raw ?? '');
      if (label === 'Closing balance' || label === 'Total spent') data.cell.styles.fontStyle = 'bold';
      if (label === 'Closing balance' && negative(ledger.closing_balance)) data.cell.styles.textColor = RED;
      if (label === 'Opening balance' && negative(ledger.opening_balance)) data.cell.styles.textColor = RED;
    },
  });
  // The two top tables sit side by side: the cash book starts below the taller one.
  const afterSummary = lastY();

  // By category (next to the summary)
  autoTable(doc, {
    startY: 33,
    margin: { left: 150 },
    theme: 'grid',
    head: [['Spent by category', 'Amount']],
    body: summary.by_category.length
      ? summary.by_category.map((c) => [c.label, rwf(c.amount)])
      : [['Nothing spent in this period', '']],
    foot: [['Total', rwf(summary.spent)]],
    styles: { fontSize: 9 },
    headStyles: { fillColor: GREEN },
    footStyles: { fillColor: [235, 240, 237], textColor: [20, 20, 20] },
    columnStyles: { 1: { halign: 'right' } },
  });
  const afterTop = Math.max(lastY(), afterSummary, 33);

  // Cash book
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...GREEN);
  doc.text('Cash book', 14, afterTop + 10);
  autoTable(doc, {
    startY: afterTop + 13,
    theme: 'striped',
    head: [['Date', 'Number', 'Type', 'Category', 'Description', 'Qty', 'Unit price', 'Paid to', 'In', 'Out', 'Balance']],
    body: [
      ['', '', '', '', 'Opening balance', '', '', '', '', '', money(ledger.opening_balance)],
      ...ledger.entries.map((e) => [
        e.date,
        e.number,
        KIND_LABEL[e.kind],
        e.category,
        e.description,
        e.quantity === null ? '' : `${num(e.quantity).toLocaleString('en-US')} ${e.unit}`.trim(),
        e.unit_price === null ? '' : money(e.unit_price),
        e.paid_to,
        num(e.money_in) ? money(e.money_in) : '',
        num(e.money_out) ? money(e.money_out) : '',
        money(e.balance),
      ]),
    ],
    foot: [['', '', '', '', 'Totals / closing balance', '', '', '', money(ledger.money_in), money(ledger.money_out), money(ledger.closing_balance)]],
    styles: { fontSize: 7.5, cellPadding: 1.5, overflow: 'linebreak' },
    headStyles: { fillColor: GREEN, fontSize: 8 },
    footStyles: { fillColor: [235, 240, 237], textColor: [20, 20, 20], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 19 },
      1: { cellWidth: 30 },
      2: { cellWidth: 22 },
      3: { cellWidth: 32 },
      4: { cellWidth: 'auto' },
      5: { cellWidth: 18, halign: 'right' },
      6: { cellWidth: 18, halign: 'right' },
      7: { cellWidth: 28 },
      8: { cellWidth: 20, halign: 'right' },
      9: { cellWidth: 20, halign: 'right' },
      10: { cellWidth: 22, halign: 'right' },
    },
    didParseCell: (data) => {
      if ((data.section === 'body' || data.section === 'foot') && data.column.index === 10 && String(data.cell.raw).startsWith('-')) {
        data.cell.styles.textColor = RED;
      }
    },
  });

  // Page numbers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`${f.stationLabel} - ${period(f)}`, 14, doc.internal.pageSize.getHeight() - 7);
    doc.text(`Page ${i} of ${pages}`, pageWidth - 14, doc.internal.pageSize.getHeight() - 7, { align: 'right' });
  }

  doc.save(`${fileBase(f)}-${stamp()}.pdf`);
}
