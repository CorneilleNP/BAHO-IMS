/**
 * Detailed dry mill report (Excel): stock receipts, milling batches (inputs
 * and outputs) and export shipments for a date range, in one workbook.
 */
import { exportWorkbook, fetchAllPages } from '../../lib/exportTable';
import { num } from '../../lib/format';
import { query } from '../../lib/useApi';
import type { DryMillBatch, ExportShipment, HqStockReceipt } from '../../lib/types';

export interface DryMillReportFilters {
  dateFrom: string | null;
  dateTo: string | null;
}

const ORIGIN: Record<string, string> = { OWN_CWS: 'Baho CWS', PARTNER_SUPPLIER: 'Partner supplier', MIXED: 'Mixed' };
const QUALITY: Record<string, string> = { PENDING: 'Pending', ACCEPTED: 'Accepted', REJECTED: 'Rejected' };
const PROCESSING: Record<string, string> = { NOT_STARTED: 'Not started', IN_PROGRESS: 'In progress', COMPLETED: 'Completed' };
const SHIPMENT: Record<string, string> = { PLANNED: 'Planned', SHIPPED: 'Shipped', DELIVERED: 'Delivered' };

const round = (value: number) => Math.round(value * 100) / 100;
const sum = <T>(rows: T[], pick: (row: T) => number) => round(rows.reduce((total, row) => total + pick(row), 0));

type Receipt = HqStockReceipt;
type BatchInput = { b: DryMillBatch; input: DryMillBatch['inputs'][number] };
type BatchOutput = { b: DryMillBatch; output: DryMillBatch['outputs'][number] };
type ShipmentLine = { s: ExportShipment; line: ExportShipment['lines'][number] };

export async function downloadDryMillReport(f: DryMillReportFilters): Promise<number> {
  const [receipts, batches, shipments] = await Promise.all([
    fetchAllPages<Receipt>(`/drymill/stock-receipts/${query({ arrival_date__gte: f.dateFrom, arrival_date__lte: f.dateTo, ordering: 'arrival_date' })}`),
    fetchAllPages<DryMillBatch>(`/drymill/batches/${query({ processing_date__gte: f.dateFrom, processing_date__lte: f.dateTo })}`),
    fetchAllPages<ExportShipment>(`/sales/shipments/${query({ delivery_to_naeb_date__gte: f.dateFrom, delivery_to_naeb_date__lte: f.dateTo })}`),
  ]);
  batches.sort((a, b) => a.processing_date.localeCompare(b.processing_date) || a.batch_no.localeCompare(b.batch_no));
  shipments.sort((a, b) => a.delivery_to_naeb_date.localeCompare(b.delivery_to_naeb_date) || a.shipment_no.localeCompare(b.shipment_no));
  const inputs: BatchInput[] = batches.flatMap((b) => b.inputs.map((input) => ({ b, input })));
  const outputs: BatchOutput[] = batches.flatMap((b) => b.outputs.map((output) => ({ b, output })));
  const lines: ShipmentLine[] = shipments.flatMap((s) => s.lines.map((line) => ({ s, line })));

  const parchIn = sum(batches, (b) => num(b.parch_input_kg));
  const greenOut = sum(batches, (b) => num(b.green_output_kg));
  await exportWorkbook(
    'dry-mill-report',
    [
      ['Report', 'Dry mill (detailed)'],
      ['Period', `${f.dateFrom ?? 'beginning'} to ${f.dateTo ?? 'today'}`],
      ['Stock receipts', receipts.length],
      ['Net weight received (kg)', sum(receipts, (r) => num(r.net_weight_kg))],
      ['Pure weight received (kg)', sum(receipts, (r) => num(r.pure_weight_kg))],
      ['Stock balance of these receipts (kg)', sum(receipts, (r) => num(r.stock_balance_kg))],
      ['Milling batches', batches.length],
      ['Parchment milled (kg)', parchIn],
      ['Green coffee produced (kg)', greenOut],
      ['Milling out-turn %', parchIn ? round((greenOut / parchIn) * 100) : 0],
      ['Export shipments', shipments.length],
      ['Green coffee shipped (kg)', sum(lines, (x) => num(x.line.qty_kg))],
    ],
    [
      {
        name: 'Stock receipts',
        rows: receipts,
        columns: [
          { header: 'Receipt number', value: (r: Receipt) => r.receipt_number },
          { header: 'Arrival date', value: (r: Receipt) => r.arrival_date },
          { header: 'Crop year', value: (r: Receipt) => r.crop_year },
          { header: 'Origin', value: (r: Receipt) => ORIGIN[r.origin_type] ?? r.origin_type },
          { header: 'Source', value: (r: Receipt) => r.source_name || r.source_raw },
          { header: 'Source code', value: (r: Receipt) => r.source_code },
          { header: 'Item', value: (r: Receipt) => (r.item_type === 'GREEN' ? 'Green' : 'Parchment') },
          { header: 'Process', value: (r: Receipt) => r.process_name || r.process_raw },
          { header: 'Sub-process', value: (r: Receipt) => r.sub_process_name },
          { header: 'Grade', value: (r: Receipt) => r.grade },
          { header: 'Lot reference', value: (r: Receipt) => r.lot_reference },
          { header: 'Purchase contract', value: (r: Receipt) => r.purchase_contract_number },
          { header: 'Delivery note', value: (r: Receipt) => r.delivery_note_no },
          { header: 'Delivery note qty (kg)', value: (r: Receipt) => r.delivery_note_qty_kg ?? '' },
          { header: 'Weighing', value: (r: Receipt) => (r.weighing_status === 'DONE' ? 'Done' : 'Pending') },
          { header: 'Bags', value: (r: Receipt) => r.number_of_bags ?? '' },
          { header: 'Gross weight (kg)', value: (r: Receipt) => r.gross_weight_kg ?? '' },
          { header: 'Tare per bag (kg)', value: (r: Receipt) => r.tare_per_bag_kg ?? '' },
          { header: 'Weight of bags (kg)', value: (r: Receipt) => r.weight_of_bags_kg },
          { header: 'Net weight (kg)', value: (r: Receipt) => r.net_weight_kg },
          { header: 'Pure weight (kg)', value: (r: Receipt) => r.pure_weight_kg },
          { header: 'Variance vs delivery note (kg)', value: (r: Receipt) => r.variance_kg ?? '' },
          { header: 'WRN number', value: (r: Receipt) => r.wrn_number },
          { header: 'Warehouse cell', value: (r: Receipt) => r.warehouse_cell },
          { header: 'Stock card', value: (r: Receipt) => r.stock_card_number },
          { header: 'Quality', value: (r: Receipt) => QUALITY[r.quality_status] ?? r.quality_status },
          { header: 'Quality comment', value: (r: Receipt) => r.quality_comment },
          { header: 'Processing', value: (r: Receipt) => PROCESSING[r.processing_status] ?? r.processing_status },
          { header: 'Processing date', value: (r: Receipt) => r.processing_date ?? '' },
          { header: 'Processed (kg)', value: (r: Receipt) => r.processed_kg },
          { header: 'Adjusted (kg)', value: (r: Receipt) => r.adjusted_kg },
          { header: 'Stock balance (kg)', value: (r: Receipt) => r.stock_balance_kg },
          { header: 'Entered by', value: (r: Receipt) => r.created_by_name },
        ],
        totals: {
          Bags: sum(receipts, (r) => r.number_of_bags ?? 0),
          'Gross weight (kg)': sum(receipts, (r) => num(r.gross_weight_kg)),
          'Weight of bags (kg)': sum(receipts, (r) => num(r.weight_of_bags_kg)),
          'Net weight (kg)': sum(receipts, (r) => num(r.net_weight_kg)),
          'Pure weight (kg)': sum(receipts, (r) => num(r.pure_weight_kg)),
          'Processed (kg)': sum(receipts, (r) => num(r.processed_kg)),
          'Adjusted (kg)': sum(receipts, (r) => num(r.adjusted_kg)),
          'Stock balance (kg)': sum(receipts, (r) => num(r.stock_balance_kg)),
        },
      },
      {
        name: 'Milling batches',
        rows: batches,
        columns: [
          { header: 'Batch number', value: (b: DryMillBatch) => b.batch_no },
          { header: 'Processing date', value: (b: DryMillBatch) => b.processing_date },
          { header: 'Origin', value: (b: DryMillBatch) => ORIGIN[b.origin_type] ?? b.origin_type },
          { header: 'Source', value: (b: DryMillBatch) => b.source_name },
          { header: 'Process / product', value: (b: DryMillBatch) => b.process_product },
          { header: 'Parchment input (kg)', value: (b: DryMillBatch) => b.parch_input_kg },
          { header: 'Green output (kg)', value: (b: DryMillBatch) => b.green_output_kg },
          { header: 'Out-turn %', value: (b: DryMillBatch) => b.outturn_pct },
          { header: 'Input receipts', value: (b: DryMillBatch) => b.inputs.map((i) => i.receipt_number).join(', ') },
          { header: 'Green grades', value: (b: DryMillBatch) => b.outputs.map((o) => `${o.grade_name} ${num(o.qty_kg)} kg`).join(', ') },
          { header: 'Status', value: (b: DryMillBatch) => (b.status === 'COMPLETED' ? 'Completed' : 'In progress') },
        ],
        totals: { 'Parchment input (kg)': parchIn, 'Green output (kg)': greenOut },
      },
      {
        name: 'Batch inputs',
        rows: inputs,
        columns: [
          { header: 'Batch number', value: (x: BatchInput) => x.b.batch_no },
          { header: 'Processing date', value: (x: BatchInput) => x.b.processing_date },
          { header: 'Receipt number', value: (x: BatchInput) => x.input.receipt_number },
          { header: 'Source', value: (x: BatchInput) => x.input.source_name },
          { header: 'Process', value: (x: BatchInput) => x.input.process_name },
          { header: 'Sub-process', value: (x: BatchInput) => x.input.sub_process_name },
          { header: 'Grade', value: (x: BatchInput) => x.input.grade },
          { header: 'Parchment (kg)', value: (x: BatchInput) => x.input.qty_kg },
        ],
        totals: { 'Parchment (kg)': sum(inputs, (x) => num(x.input.qty_kg)) },
      },
      {
        name: 'Batch outputs',
        rows: outputs,
        columns: [
          { header: 'Batch number', value: (x: BatchOutput) => x.b.batch_no },
          { header: 'Processing date', value: (x: BatchOutput) => x.b.processing_date },
          { header: 'Source', value: (x: BatchOutput) => x.b.source_name },
          { header: 'Process / product', value: (x: BatchOutput) => x.b.process_product },
          { header: 'Green grade', value: (x: BatchOutput) => x.output.grade_name },
          { header: 'Green coffee (kg)', value: (x: BatchOutput) => x.output.qty_kg },
        ],
        totals: { 'Green coffee (kg)': greenOut },
      },
      {
        name: 'Export shipments',
        rows: lines,
        columns: [
          { header: 'Shipment number', value: (x: ShipmentLine) => x.s.shipment_no },
          { header: 'Client', value: (x: ShipmentLine) => x.s.client_name },
          { header: 'Delivery to NAEB', value: (x: ShipmentLine) => x.s.delivery_to_naeb_date },
          { header: 'Status', value: (x: ShipmentLine) => SHIPMENT[x.s.status] ?? x.s.status },
          { header: 'Source', value: (x: ShipmentLine) => x.line.source_name },
          { header: 'Process', value: (x: ShipmentLine) => x.line.process_name },
          { header: 'Sub-process', value: (x: ShipmentLine) => x.line.sub_process_name },
          { header: 'Product', value: (x: ShipmentLine) => x.line.process_product },
          { header: 'Green grade', value: (x: ShipmentLine) => x.line.grade_name },
          { header: 'Quantity (kg)', value: (x: ShipmentLine) => x.line.qty_kg },
        ],
        totals: { 'Quantity (kg)': sum(lines, (x) => num(x.line.qty_kg)) },
      },
    ],
  );
  return receipts.length + batches.length + shipments.length;
}
