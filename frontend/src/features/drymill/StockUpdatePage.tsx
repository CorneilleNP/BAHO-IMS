import { useState } from 'react';
import { Autocomplete, Badge, Button, Card, Group, Modal, NativeSelect, NumberInput, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { IconBuildingWarehouse, IconPackage, IconScale } from '@tabler/icons-react';
import { ChartCard } from '../../components/ChartCard';
import { DataTable } from '../../components/DataTable';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import { ErrorMessage } from '../../components/Feedback';
import { KpiCard } from '../../components/KpiCard';
import { PageHeader } from '../../components/PageHeader';
import { SourceSelect } from '../../components/SourceSelect';
import { VoidButton } from '../../components/VoidButton';
import { api } from '../../lib/api';
import { canWrite } from '../../lib/access';
import { useAuth } from '../../lib/authContext';
import { fetchAllPages } from '../../lib/exportTable';
import { ANY_DATE, changeLabel, kg, num, today, type DateRange } from '../../lib/format';
import { toast } from '../../lib/toast';
import { sourceFields } from '../../lib/sources';
import type { HqStockReceipt, StockSummary } from '../../lib/types';
import { query, useApi, useList } from '../../lib/useApi';
import { useSubmit } from '../../lib/useSubmit';

const qualityColor: Record<HqStockReceipt['quality_status'], string> = { PENDING: 'yellow', ACCEPTED: 'green', REJECTED: 'red' };
const processingColor: Record<HqStockReceipt['processing_status'], string> = { NOT_STARTED: 'gray', IN_PROGRESS: 'blue', COMPLETED: 'teal' };

// Suggestions only: any process/grade name can be typed. Values already used are added automatically.
const COMMON_PROCESSES = ['FW', 'NATURAL N', 'EX NAT', 'HONEY', 'ANAEROBIC W', 'FW SEASON B', 'WASHED NO 1'];
const COMMON_GRADES = ['A1', 'A2', 'A3', 'A4', 'HG', 'HPC', 'FLOAT', 'HC'];

export function StockUpdatePage() {
  const { user } = useAuth();
  const writable = canWrite(user, 'drymill');
  const [date, setDate] = useState('');
  const [process, setProcess] = useState('All');
  const [grade, setGrade] = useState('All');
  const [modalOpen, setModalOpen] = useState(false);
  const [range, setRange] = useState<DateRange>(ANY_DATE);

  const summary = useApi<StockSummary>(
    `/reporting/drymill/stock/${query({ date, process, grade, date_from: range[0], date_to: range[1] })}`,
  );
  const receiptsQuery = `/drymill/stock-receipts/${query({ process, grade, arrival_date__gte: range[0], arrival_date__lte: range[1] })}`;
  const receipts = useList<HqStockReceipt>(`${receiptsQuery}${receiptsQuery.includes('?') ? '&' : '?'}page_size=25`);
  const s = summary.data;
  const kpiLoading = summary.loading && !s;
  const delta = changeLabel(s?.change_vs_previous_pct, s?.previous_date);

  return (
    <Stack gap="lg">
      <PageHeader
        title="Baho Dry Mill Stock Update"
        description="Parchment & green coffee received at HQ from Baho CWS and partner suppliers"
        actions={
          <>
            <TextInput type="date" label="KPI day" value={date || s?.date || ''} onChange={(e) => setDate(e.currentTarget.value)} />
            {writable && (
              <Button leftSection={<IconPackage size={16} />} onClick={() => setModalOpen(true)}>Log new stock receipt</Button>
            )}
          </>
        }
      />

      <ErrorMessage>{summary.error}</ErrorMessage>

      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <KpiCard label={`Net weight (kg) · ${s?.date ?? ''}`} value={kg(s?.day.net_weight_kg)} icon={IconScale} delta={delta} loading={kpiLoading} />
        <KpiCard label="Pure weight (kg)" value={kg(s?.day.pure_weight_kg)} icon={IconBuildingWarehouse} loading={kpiLoading} />
        <KpiCard label="Weight of bags (kg)" value={kg(s?.day.weight_of_bags_kg)} icon={IconPackage} loading={kpiLoading} />
      </SimpleGrid>
      <Text size="sm" c="dimmed">
        {range[0] || range[1] ? 'Selected dates' : 'Season to date'}: <strong>{kg(s?.season.net_weight_kg)} kg</strong> net from {s?.season.receipts ?? 0} receipts.
      </Text>

      <Group justify="flex-end" gap="md" align="flex-end">
        <DateRangeFilter value={range} onChange={setRange} label="Arrival dates" />
        <NativeSelect label="Process" data={['All', ...(s?.options.processes ?? [])]} value={process} onChange={(e) => setProcess(e.currentTarget.value)} miw={180} />
        <NativeSelect label="Grade" data={['All', ...(s?.options.grades ?? [])]} value={grade} onChange={(e) => setGrade(e.currentTarget.value)} miw={180} />
      </Group>

      <SimpleGrid cols={{ base: 1, lg: 3 }}>
        <ChartCard title="Net weight by process" rows={s?.by_process ?? []} loading={kpiLoading} color="coffee.6" />
        <ChartCard title="Net weight by grade" rows={s?.by_grade ?? []} loading={kpiLoading} color="coffee.5" />
        <ChartCard title="Net weight by source (CWS / supplier)" rows={s?.by_source ?? []} loading={kpiLoading} color="coffee.7" />
      </SimpleGrid>

      <Card withBorder radius="md" p="md">
        <Text fw={600} mb="sm">Recent stock receipts</Text>
        <DataTable
          rows={receipts.items}
          rowKey={(r) => r.id}
          loading={receipts.loading}
          error={receipts.error}
          minWidth={950}
          empty={{ title: 'No stock received yet', hint: 'Use “Log new stock receipt” when coffee arrives at HQ.' }}
          exportName="hq-stock-receipts"
          fetchAll={() => fetchAllPages<HqStockReceipt>(receiptsQuery)}
          columns={[
            { key: 'no', header: 'Receipt', mono: true, render: (r) => r.receipt_number },
            { key: 'date', header: 'Arrival', render: (r) => r.arrival_date },
            { key: 'source', header: 'Source', render: (r) => r.source_name },
            { key: 'process', header: 'Process', render: (r) => r.process },
            { key: 'grade', header: 'Grade', render: (r) => r.grade },
            { key: 'net', header: 'Net (kg)', align: 'right', render: (r) => kg(r.net_weight_kg), exportValue: (r) => r.net_weight_kg },
            { key: 'pure', header: 'Pure (kg)', align: 'right', render: (r) => kg(r.pure_weight_kg), exportValue: (r) => r.pure_weight_kg },
            { key: 'q', header: 'Quality', exportValue: (r) => r.quality_status, render: (r) => <Badge color={qualityColor[r.quality_status]} variant="light">{r.quality_status}</Badge> },
            {
              key: 'p',
              header: 'Processing',
              exportValue: (r) => r.processing_status,
              render: (r) => <Badge color={processingColor[r.processing_status]} variant="light">{r.processing_status.replace('_', ' ')}</Badge>,
            },
            writable && {
              key: 'void',
              header: '',
              exportValue: false,
              render: (r) => (
                <VoidButton
                  path={`/drymill/stock-receipts/${r.id}/`}
                  label={`receipt ${r.receipt_number}`}
                  onDone={() => {
                    summary.reload();
                    receipts.reload();
                  }}
                />
              ),
            },
          ]}
        />
      </Card>

      {modalOpen && (
        <StockReceiptModal
          knownProcesses={s?.options.processes ?? []}
          knownGrades={s?.options.grades ?? []}
          onClose={() => setModalOpen(false)}
          onSaved={(receipt) => {
            setModalOpen(false);
            setDate(receipt.arrival_date);
            toast.success(`${receipt.receipt_number}: ${kg(receipt.net_weight_kg)} kg ${receipt.process} ${receipt.grade} from ${receipt.source_name}.`, 'Stock receipt saved');
            summary.reload();
            receipts.reload();
          }}
        />
      )}
    </Stack>
  );
}

function StockReceiptModal({
  knownProcesses,
  knownGrades,
  onClose,
  onSaved,
}: {
  knownProcesses: string[];
  knownGrades: string[];
  onClose: () => void;
  onSaved: (receipt: HqStockReceipt) => void;
}) {
  const [source, setSource] = useState<string | null>(null);
  const [text, setText] = useState({ arrival_date: today(), process: '', grade: '', lot_reference: '', delivery_note_no: '', wrn_number: '', warehouse_cell: '', stock_card_number: '' });
  const [numbers, setNumbers] = useState<Record<string, number | ''>>({
    delivery_note_qty_kg: '',
    gross_weight_kg: '',
    net_weight_kg: '',
    number_of_bags: '',
    tare_per_bag_kg: '',
    weight_of_bags_kg: '',
  });
  const submit = useSubmit();

  const setT = (field: keyof typeof text) => (value: string) => setText((p) => ({ ...p, [field]: value }));
  const setN = (field: string) => (value: number | string) => setNumbers((p) => ({ ...p, [field]: value === '' ? '' : Number(value) }));

  const bagsKg = numbers.weight_of_bags_kg !== '' ? num(numbers.weight_of_bags_kg) : num(numbers.number_of_bags) * num(numbers.tare_per_bag_kg);
  const pure = num(numbers.net_weight_kg) - bagsKg;
  const variance = numbers.delivery_note_qty_kg === '' ? null : num(numbers.net_weight_kg) - num(numbers.delivery_note_qty_kg);
  const merge = (known: string[], common: string[]) => Array.from(new Set([...known, ...common]));

  async function save() {
    const origin = sourceFields(source);
    if (!origin) return submit.fail('Choose where the coffee came from.');
    if (!text.process.trim() || !text.grade.trim()) return submit.fail('Enter the process and grade.');
    if (num(numbers.net_weight_kg) <= 0) return submit.fail('Enter the net weight.');
    const body: Record<string, unknown> = { ...origin, ...text, process: text.process.trim().toUpperCase(), grade: text.grade.trim().toUpperCase() };
    Object.entries(numbers).forEach(([field, value]) => {
      if (value !== '') body[field] = value;
    });
    const receipt = await submit.run(() => api<HqStockReceipt>('/drymill/stock-receipts/', { method: 'POST', body }));
    if (receipt) onSaved(receipt);
  }

  return (
    <Modal opened onClose={onClose} title="Log new stock receipt" size="xl">
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <SourceSelect value={source} onChange={setSource} required />
          <TextInput label="Arrival date" type="date" value={text.arrival_date} onChange={(e) => setT('arrival_date')(e.currentTarget.value)} />
          <Autocomplete label="Process" required data={merge(knownProcesses, COMMON_PROCESSES)} value={text.process} onChange={setT('process')} />
          <Autocomplete label="Grade" required data={merge(knownGrades, COMMON_GRADES)} value={text.grade} onChange={setT('grade')} />
          <TextInput label="Lot ID" value={text.lot_reference} onChange={(e) => setT('lot_reference')(e.currentTarget.value)} />
          <TextInput label="Delivery note no." value={text.delivery_note_no} onChange={(e) => setT('delivery_note_no')(e.currentTarget.value)} />
          <NumberInput label="Delivery note quantity (kg)" value={numbers.delivery_note_qty_kg} onChange={setN('delivery_note_qty_kg')} min={0} hideControls thousandSeparator="," />
          <NumberInput label="Gross weight (kg)" value={numbers.gross_weight_kg} onChange={setN('gross_weight_kg')} min={0} hideControls thousandSeparator="," />
          <NumberInput label="Net weight (kg)" required value={numbers.net_weight_kg} onChange={setN('net_weight_kg')} min={0} hideControls thousandSeparator="," />
          <NumberInput label="Number of bags" value={numbers.number_of_bags} onChange={setN('number_of_bags')} min={0} allowDecimal={false} hideControls />
          <NumberInput label="Tare per bag (kg)" value={numbers.tare_per_bag_kg} onChange={setN('tare_per_bag_kg')} min={0} decimalScale={3} hideControls />
          <NumberInput label="Weight of bags (kg)" description="Leave empty to use bags × tare" value={numbers.weight_of_bags_kg} onChange={setN('weight_of_bags_kg')} min={0} hideControls />
          <TextInput label="WRN" value={text.wrn_number} onChange={(e) => setT('wrn_number')(e.currentTarget.value)} />
          <TextInput label="Warehouse cell" value={text.warehouse_cell} onChange={(e) => setT('warehouse_cell')(e.currentTarget.value)} />
          <TextInput label="Stock card no." value={text.stock_card_number} onChange={(e) => setT('stock_card_number')(e.currentTarget.value)} />
        </SimpleGrid>

        <Card withBorder radius="md" p="md" bg="gray.0">
          <SimpleGrid cols={3}>
            <div>
              <Text size="xs" c="dimmed">Weight of bags</Text>
              <Text fw={700}>{kg(bagsKg, 2)} kg</Text>
            </div>
            <div>
              <Text size="xs" c="dimmed">Pure weight</Text>
              <Text fw={700}>{kg(pure, 2)} kg</Text>
            </div>
            <div>
              <Text size="xs" c="dimmed">Variance vs delivery note</Text>
              <Text fw={700}>{variance === null ? '—' : `${kg(variance, 2)} kg`}</Text>
            </div>
          </SimpleGrid>
        </Card>

        <ErrorMessage>{submit.error}</ErrorMessage>
        <Button onClick={save} loading={submit.saving}>Save receipt</Button>
      </Stack>
    </Modal>
  );
}
