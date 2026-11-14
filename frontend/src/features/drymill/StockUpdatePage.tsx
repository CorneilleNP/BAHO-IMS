import { useState } from 'react';
import { BarChart } from '@mantine/charts';
import { Autocomplete, Badge, Button, Card, Group, Modal, NativeSelect, NumberInput, Select, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconBuildingWarehouse, IconPackage, IconScale } from '@tabler/icons-react';
import { EmptyState, ErrorMessage, Loading, SuccessMessage } from '../../components/Feedback';
import { KpiCard } from '../../components/KpiCard';
import { api } from '../../lib/api';
import { canWrite } from '../../lib/access';
import { useAuth } from '../../lib/authContext';
import { changeLabel, chartRows, kg, num, today } from '../../lib/format';
import { sourceFields, sourceOptions } from '../../lib/sources';
import type { CoffeeSource, HqStockReceipt, StockSummary } from '../../lib/types';
import { errorText, query, useApi, useList } from '../../lib/useApi';

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
  const [saved, setSaved] = useState<string | null>(null);

  const summary = useApi<StockSummary>(`/reporting/drymill/stock/${query({ date, process, grade })}`);
  const receipts = useList<HqStockReceipt>(`/drymill/stock-receipts/${query({ process, grade, page_size: 25 })}`);
  const s = summary.data;
  const delta = changeLabel(s?.change_vs_previous_pct, s?.previous_date);

  const reloadAll = () => {
    summary.reload();
    receipts.reload();
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Baho Dry Mill Stock Update</Title>
          <Text c="dimmed" size="sm">Parchment &amp; green coffee received at HQ from Baho CWS and partner suppliers</Text>
        </div>
        <Group gap="sm" align="flex-end">
          <TextInput type="date" label="Arrival date" value={date || s?.date || ''} onChange={(e) => setDate(e.currentTarget.value)} />
          {writable && (
            <Button leftSection={<IconPackage size={16} />} onClick={() => setModalOpen(true)}>Log new stock receipt</Button>
          )}
        </Group>
      </Group>

      <SuccessMessage onClose={() => setSaved(null)}>{saved}</SuccessMessage>
      <ErrorMessage>{summary.error}</ErrorMessage>

      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <KpiCard label={`Net weight (kg) · ${s?.date ?? '…'}`} value={kg(s?.day.net_weight_kg)} icon={IconScale} delta={delta} />
        <KpiCard label="Pure weight (kg)" value={kg(s?.day.pure_weight_kg)} icon={IconBuildingWarehouse} />
        <KpiCard label="Weight of bags (kg)" value={kg(s?.day.weight_of_bags_kg)} icon={IconPackage} />
      </SimpleGrid>
      <Text size="sm" c="dimmed">
        Season to date: <strong>{kg(s?.season.net_weight_kg)} kg</strong> net from {s?.season.receipts ?? 0} receipts.
      </Text>

      <Group justify="flex-end" gap="md">
        <NativeSelect label="Process" data={['All', ...(s?.options.processes ?? [])]} value={process} onChange={(e) => setProcess(e.currentTarget.value)} miw={180} />
        <NativeSelect label="Grade" data={['All', ...(s?.options.grades ?? [])]} value={grade} onChange={(e) => setGrade(e.currentTarget.value)} miw={180} />
      </Group>

      <SimpleGrid cols={{ base: 1, lg: 3 }}>
        <ChartCard title="Net weight by process" rows={s?.by_process ?? []} loading={summary.loading && !s} color="coffee.6" />
        <ChartCard title="Net weight by grade" rows={s?.by_grade ?? []} loading={summary.loading && !s} color="coffee.5" />
        <ChartCard title="Net weight by source (CWS / supplier)" rows={s?.by_source ?? []} loading={summary.loading && !s} color="coffee.7" />
      </SimpleGrid>

      <Card withBorder radius="md" p="md">
        <Text fw={600} mb="sm">Recent stock receipts</Text>
        {receipts.loading && !receipts.data ? (
          <Loading />
        ) : receipts.items.length === 0 ? (
          <EmptyState title="No stock received yet">Use “Log new stock receipt” when coffee arrives at HQ.</EmptyState>
        ) : (
          <Table.ScrollContainer minWidth={900}>
            <Table striped highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Receipt</Table.Th>
                  <Table.Th>Arrival</Table.Th>
                  <Table.Th>Source</Table.Th>
                  <Table.Th>Process</Table.Th>
                  <Table.Th>Grade</Table.Th>
                  <Table.Th ta="right">Net (kg)</Table.Th>
                  <Table.Th ta="right">Pure (kg)</Table.Th>
                  <Table.Th>Quality</Table.Th>
                  <Table.Th>Processing</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {receipts.items.map((r) => (
                  <Table.Tr key={r.id}>
                    <Table.Td ff="monospace">{r.receipt_number}</Table.Td>
                    <Table.Td>{r.arrival_date}</Table.Td>
                    <Table.Td>{r.source_name}</Table.Td>
                    <Table.Td>{r.process}</Table.Td>
                    <Table.Td>{r.grade}</Table.Td>
                    <Table.Td ta="right">{kg(r.net_weight_kg)}</Table.Td>
                    <Table.Td ta="right">{kg(r.pure_weight_kg)}</Table.Td>
                    <Table.Td><Badge color={qualityColor[r.quality_status]} variant="light">{r.quality_status}</Badge></Table.Td>
                    <Table.Td><Badge color={processingColor[r.processing_status]} variant="light">{r.processing_status.replace('_', ' ')}</Badge></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>

      {modalOpen && (
        <StockReceiptModal
          knownProcesses={s?.options.processes ?? []}
          knownGrades={s?.options.grades ?? []}
          onClose={() => setModalOpen(false)}
          onSaved={(receipt) => {
            setModalOpen(false);
            setDate(receipt.arrival_date);
            setSaved(`Saved ${receipt.receipt_number}: ${kg(receipt.net_weight_kg)} kg ${receipt.process} ${receipt.grade} from ${receipt.source_name}.`);
            reloadAll();
          }}
        />
      )}
    </Stack>
  );
}

function ChartCard({ title, rows, loading, color }: { title: string; rows: Array<{ label: string; kg: string }>; loading: boolean; color: string }) {
  return (
    <Card withBorder radius="md" p="md">
      <Text fw={600} mb="sm">{title}</Text>
      {loading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState title="No data yet" />
      ) : (
        <BarChart
          h={Math.max(160, rows.length * 34)}
          data={chartRows(rows.slice(0, 12))}
          dataKey="label"
          series={[{ name: 'kg', color }]}
          orientation="vertical"
          yAxisProps={{ width: 100 }}
          valueFormatter={(v) => `${v.toLocaleString()} kg`}
          withTooltip
        />
      )}
    </Card>
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
  const sources = useApi<CoffeeSource[]>('/drymill/sources/');
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setT = (field: keyof typeof text) => (value: string) => setText((p) => ({ ...p, [field]: value }));
  const setN = (field: string) => (value: number | string) => setNumbers((p) => ({ ...p, [field]: value === '' ? '' : Number(value) }));

  const bagsKg = numbers.weight_of_bags_kg !== '' ? num(numbers.weight_of_bags_kg) : num(numbers.number_of_bags) * num(numbers.tare_per_bag_kg);
  const pure = num(numbers.net_weight_kg) - bagsKg;
  const variance = numbers.delivery_note_qty_kg === '' ? null : num(numbers.net_weight_kg) - num(numbers.delivery_note_qty_kg);
  const merge = (known: string[], common: string[]) => Array.from(new Set([...known, ...common]));

  async function save() {
    const origin = sourceFields(source);
    if (!origin) return setError('Choose where the coffee came from.');
    if (!text.process.trim() || !text.grade.trim()) return setError('Enter the process and grade.');
    if (num(numbers.net_weight_kg) <= 0) return setError('Enter the net weight.');
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { ...origin, ...text, process: text.process.trim().toUpperCase(), grade: text.grade.trim().toUpperCase() };
      Object.entries(numbers).forEach(([field, value]) => {
        if (value !== '') body[field] = value;
      });
      onSaved(await api<HqStockReceipt>('/drymill/stock-receipts/', { method: 'POST', body }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal opened onClose={onClose} title="Log new stock receipt" size="xl">
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select
            label="Source (CWS or supplier)"
            required
            data={sourceOptions(sources.data ?? [])}
            value={source}
            onChange={setSource}
            searchable
            placeholder={sources.loading ? 'Loading…' : 'Choose source'}
            nothingFoundMessage="Not found: register the supplier first"
          />
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

        <ErrorMessage>{error}</ErrorMessage>
        <Button onClick={save} loading={saving}>Save receipt</Button>
      </Stack>
    </Modal>
  );
}
