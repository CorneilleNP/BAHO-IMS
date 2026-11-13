import { useEffect, useMemo, useState } from 'react';
import { BarChart } from '@mantine/charts';
import { Badge, Button, Card, Group, Modal, NativeSelect, NumberInput, Select, SimpleGrid, Table, Text, TextInput, Title } from '@mantine/core';
import { IconBuildingWarehouse, IconPackage, IconScale } from '@tabler/icons-react';
import { KpiCard } from '../../components/KpiCard';
import {
  type HqStockReceiptRow,
  netWeightByGrade,
  netWeightByProcess,
  netWeightBySource,
  netWeightKpis,
  recentStockReceipts,
} from '../../mock/drymill';
import type { SourceRecord } from './SourceRegistryPage';

const qualityColor: Record<HqStockReceiptRow['qualityStatus'], string> = {
  PENDING: 'yellow',
  ACCEPTED: 'green',
  REJECTED: 'red',
};
const processingColor: Record<HqStockReceiptRow['processingStatus'], string> = {
  NOT_STARTED: 'gray',
  IN_PROGRESS: 'blue',
  COMPLETED: 'teal',
};

interface StockUpdatePageProps {
  sourceList: SourceRecord[];
}

const STORAGE_KEY = 'baho-drymill-receipts';

export function StockUpdatePage({ sourceList }: StockUpdatePageProps) {
  const [receipts, setReceipts] = useState<HqStockReceiptRow[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return recentStockReceipts;

    try {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : recentStockReceipts;
    } catch {
      return recentStockReceipts;
    }
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState('2026-09-17');
  const [selectedProcess, setSelectedProcess] = useState('All');
  const [selectedGrade, setSelectedGrade] = useState('All');
  const [form, setForm] = useState({
    source: '',
    sourceType: '',
    lotId: '',
    arrivalDate: new Date().toISOString().slice(0, 10),
    process: '',
    grade: '',
    deliveryNoteNo: '',
    deliveryNoteQtyKg: '',
    grossWeightKg: '',
    netWeightKg: '',
    numberOfBags: '',
    tarePerBagKg: '',
    weightOfBagsKg: '',
    warehouseCell: '',
    wrn: '',
    stockCardNo: '',
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(receipts));
  }, [receipts]);

  const availableDates = useMemo(() => [...new Set(receipts.map((receipt) => receipt.arrivalDate))].sort(), [receipts]);

  const filteredReceipts = useMemo(() => {
    return receipts.filter((receipt) => {
      const dateMatch = selectedDate ? receipt.arrivalDate === selectedDate : true;
      const processMatch = selectedProcess === 'All' || receipt.process === selectedProcess;
      const gradeMatch = selectedGrade === 'All' || receipt.grade === selectedGrade;
      return dateMatch && processMatch && gradeMatch;
    });
  }, [receipts, selectedDate, selectedProcess, selectedGrade]);

  const previousDayNetWeight = useMemo(() => {
    const index = availableDates.indexOf(selectedDate);
    const previousDate = index > 0 ? availableDates[index - 1] : null;
    if (!previousDate) return 0;

    return receipts
      .filter((receipt) => receipt.arrivalDate === previousDate)
      .reduce((sum, receipt) => sum + receipt.netWeightKg, 0);
  }, [availableDates, receipts, selectedDate]);

  const kpis = useMemo(() => {
    const netWeightKg = filteredReceipts.reduce((sum, receipt) => sum + receipt.netWeightKg, 0);
    const weightOfBagsKg = filteredReceipts.reduce((sum, receipt) => sum + receipt.weightOfBagsKg, 0);
    const pureWeightKg = netWeightKg - weightOfBagsKg;
    const deltaPct = previousDayNetWeight === 0 ? 0 : ((netWeightKg - previousDayNetWeight) / previousDayNetWeight) * 100;

    return { netWeightKg, weightOfBagsKg, pureWeightKg, deltaPct };
  }, [filteredReceipts, previousDayNetWeight]);

  const derived = useMemo(() => {
    const netWeightKg = Number(form.netWeightKg) || 0;
    const deliveryNoteQtyKg = Number(form.deliveryNoteQtyKg) || 0;
    const weightOfBagsKg = Number(form.weightOfBagsKg) || 0;
    const pureWeightKg = netWeightKg - weightOfBagsKg;
    const varianceKg = netWeightKg - deliveryNoteQtyKg;
    const stockProcessedKg = 0;
    const stockBalanceKg = pureWeightKg - stockProcessedKg;

    return {
      weightOfBagsKg,
      pureWeightKg,
      varianceKg,
      stockProcessedKg,
      stockBalanceKg,
    };
  }, [form]);

  const sourceOptions = useMemo(
    () => sourceList.map((source) => ({ value: source.name, label: source.name })),
    [sourceList],
  );

  function submitReceipt() {
    const netWeightKg = Number(form.netWeightKg) || 0;
    const weightOfBagsKg = Number(form.weightOfBagsKg) || 0;
    setReceipts((prev) => [
      {
        id: crypto.randomUUID(),
        arrivalDate: form.arrivalDate || new Date().toISOString().slice(0, 10),
        source: form.source || 'UNKNOWN',
        process: form.process || 'FW',
        grade: form.grade || 'A1',
        deliveryNoteQtyKg: Number(form.deliveryNoteQtyKg) || netWeightKg,
        netWeightKg,
        weightOfBagsKg,
        qualityStatus: 'PENDING',
        processingStatus: 'NOT_STARTED',
      },
      ...prev,
    ]);
    setModalOpen(false);
    setForm({
      source: '',
      sourceType: '',
      lotId: '',
      arrivalDate: new Date().toISOString().slice(0, 10),
      process: '',
      grade: '',
      deliveryNoteNo: '',
      deliveryNoteQtyKg: '',
      grossWeightKg: '',
      netWeightKg: '',
      numberOfBags: '',
      tarePerBagKg: '',
      weightOfBagsKg: '',
      warehouseCell: '',
      wrn: '',
      stockCardNo: '',
    });
  }

  return (
    <div>
      <Group justify="space-between" mb="lg" align="flex-end">
        <div>
          <Title order={2}>Baho Dry Mill Stock Update</Title>
          <Text c="dimmed" size="sm">Inbound parchment &amp; green coffee received at HQ, across all CWS and partner suppliers</Text>
        </div>
        <Group gap="sm">
          <TextInput
            type="date"
            label="Date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.currentTarget.value || availableDates[availableDates.length - 1])}
            styles={{ input: { minWidth: 170 } }}
          />
          <Button leftSection={<IconPackage size={16} />} onClick={() => setModalOpen(true)}>
            Log new stock receipt
          </Button>
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 3 }} mb="lg">
        <KpiCard label="Net weight (Kg)" value={kpis.netWeightKg.toLocaleString()} icon={IconScale} delta={`${kpis.deltaPct >= 0 ? '+' : ''}${kpis.deltaPct.toFixed(1)}% vs last day`} />
        <KpiCard label="Pure weight (Kg)" value={kpis.pureWeightKg.toLocaleString()} icon={IconBuildingWarehouse} delta={`${kpis.deltaPct >= 0 ? '+' : ''}${kpis.deltaPct.toFixed(1)}% vs last day`} />
        <KpiCard label="Weight of bags (Kg)" value={kpis.weightOfBagsKg.toLocaleString()} icon={IconPackage} delta={`${kpis.deltaPct >= 0 ? '+' : ''}${kpis.deltaPct.toFixed(1)}% vs last day`} />
      </SimpleGrid>

      <Group justify="flex-end" gap="md" mb="lg">
        <NativeSelect
          label="Process"
          data={['All', ...Array.from(new Set(receipts.map((receipt) => receipt.process)))]}
          value={selectedProcess}
          onChange={(event) => setSelectedProcess(event.currentTarget.value)}
          styles={{ input: { minWidth: 180 } }}
        />
        <NativeSelect
          label="Grades"
          data={['All', ...Array.from(new Set(receipts.map((receipt) => receipt.grade)))]}
          value={selectedGrade}
          onChange={(event) => setSelectedGrade(event.currentTarget.value)}
          styles={{ input: { minWidth: 180 } }}
        />
      </Group>

      <SimpleGrid cols={{ base: 1, lg: 3 }} mb="lg">
        <Card withBorder radius="md" p="md">
          <Text fw={600} mb="sm">Net weight by process</Text>
          <BarChart
            h={340}
            data={netWeightByProcess}
            dataKey="process"
            series={[{ name: 'kg', color: 'coffee.6' }]}
            orientation="vertical"
            yAxisProps={{ width: 100 }}
            withTooltip
          />
        </Card>
        <Card withBorder radius="md" p="md">
          <Text fw={600} mb="sm">Net weight by grade</Text>
          <BarChart
            h={340}
            data={netWeightByGrade}
            dataKey="grade"
            series={[{ name: 'kg', color: 'coffee.5' }]}
            orientation="vertical"
            yAxisProps={{ width: 60 }}
            withTooltip
          />
        </Card>
        <Card withBorder radius="md" p="md">
          <Text fw={600} mb="sm">Net weight by source (CWS / supplier)</Text>
          <BarChart
            h={340}
            data={netWeightBySource}
            dataKey="source"
            series={[{ name: 'netWeightKg', color: 'coffee.7' }]}
            orientation="vertical"
            yAxisProps={{ width: 90 }}
            withTooltip
          />
        </Card>
      </SimpleGrid>

      <Card withBorder radius="md" p="md" mb="lg">
        <Text fw={600} mb="sm">Recent stock receipts</Text>
        <Table striped highlightOnHover verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Arrival</Table.Th>
              <Table.Th>Source</Table.Th>
              <Table.Th>Process</Table.Th>
              <Table.Th>Grade</Table.Th>
              <Table.Th>Net weight (Kg)</Table.Th>
              <Table.Th>Quality</Table.Th>
              <Table.Th>Processing</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {receipts.map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td>{r.arrivalDate}</Table.Td>
                <Table.Td>{r.source}</Table.Td>
                <Table.Td>{r.process}</Table.Td>
                <Table.Td>{r.grade}</Table.Td>
                <Table.Td>{r.netWeightKg.toLocaleString()}</Table.Td>
                <Table.Td><Badge color={qualityColor[r.qualityStatus]} variant="light">{r.qualityStatus}</Badge></Table.Td>
                <Table.Td><Badge color={processingColor[r.processingStatus]} variant="light">{r.processingStatus.replace('_', ' ')}</Badge></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title="Log new stock receipt" size="xl">
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <div>
            <TextInput
              label="Supplier"
              value={form.source}
              onChange={(event) => {
                const nextSourceName = (event.target as HTMLInputElement | null)?.value ?? '';
                const nextSource = sourceList.find((source) => source.name === nextSourceName) ?? null;
                setForm((f) => ({
                  ...f,
                  source: nextSourceName,
                  sourceType: nextSource?.type ?? f.sourceType,
                }));
              }}
              mb="sm"
              placeholder="Type supplier name"
              list="supplier-options"
            />
            <datalist id="supplier-options">
              {sourceOptions.map((option) => (
                <option key={option.value} value={option.value} />
              ))}
            </datalist>
          </div>
          <NativeSelect
            label="Source type"
            value={form.sourceType}
            data={[
              { value: '', label: 'Select source type' },
              { value: 'CWS', label: 'CWS' },
              { value: 'Supplier', label: 'Supplier' },
            ]}
            onChange={(event) => {
              const value = ((event.currentTarget as HTMLSelectElement | null)?.value ?? '').trim().toLowerCase();
              const nextType = value === 'supplier' || value === 'usual supplier' || value === 'partner supplier' || value === 'partner' ? 'Supplier' : value === 'cws' ? 'CWS' : '';
              setForm((f) => ({
                ...f,
                sourceType: nextType,
              }));
            }}
            mb="sm"
          />
          <TextInput
            label="Lot ID"
            value={form.lotId}
            onChange={(event) => {
              const nextValue = (event.target as HTMLInputElement | null)?.value ?? '';
              setForm((f) => ({ ...f, lotId: nextValue }));
            }}
            mb="sm"
          />
          <TextInput
            label="Arrival date"
            type="date"
            value={form.arrivalDate}
            onChange={(event) => {
              const nextValue = (event.target as HTMLInputElement | null)?.value ?? '';
              setForm((f) => ({ ...f, arrivalDate: nextValue }));
            }}
            mb="sm"
          />
          <TextInput
            label="Delivery note no."
            value={form.deliveryNoteNo}
            onChange={(event) => {
              const nextValue = (event.target as HTMLInputElement | null)?.value ?? '';
              setForm((f) => ({ ...f, deliveryNoteNo: nextValue }));
            }}
            mb="sm"
          />
          <TextInput
            label="WRN"
            value={form.wrn}
            onChange={(event) => {
              const nextValue = (event.target as HTMLInputElement | null)?.value ?? '';
              setForm((f) => ({ ...f, wrn: nextValue }));
            }}
            mb="sm"
          />
          <TextInput
            label="Warehouse cell"
            value={form.warehouseCell}
            onChange={(event) => {
              const nextValue = (event.target as HTMLInputElement | null)?.value ?? '';
              setForm((f) => ({ ...f, warehouseCell: nextValue }));
            }}
            mb="sm"
          />
          <TextInput
            label="Stock card no."
            value={form.stockCardNo}
            onChange={(event) => {
              const nextValue = (event.target as HTMLInputElement | null)?.value ?? '';
              setForm((f) => ({ ...f, stockCardNo: nextValue }));
            }}
            mb="sm"
          />
          <Select
            label="Process"
            data={['FW', 'NATURAL N', 'EX NAT', 'HONEY', 'ANAEROBIC W']}
            value={form.process}
            onChange={(v) => setForm((f) => ({ ...f, process: v ?? '' }))}
            mb="sm"
          />
          <Select
            label="Grade"
            data={['A1', 'A2', 'A3', 'HPC', 'HG']}
            value={form.grade}
            onChange={(v) => setForm((f) => ({ ...f, grade: v ?? '' }))}
            mb="sm"
          />
          <NumberInput label="Delivery note quantity (Kg)" value={form.deliveryNoteQtyKg} onChange={(v) => setForm((f) => ({ ...f, deliveryNoteQtyKg: String(v) }))} mb="sm" />
          <NumberInput label="Gross weight (Kg)" value={form.grossWeightKg} onChange={(v) => setForm((f) => ({ ...f, grossWeightKg: String(v) }))} mb="sm" />
          <NumberInput label="Net weight (Kg)" value={form.netWeightKg} onChange={(v) => setForm((f) => ({ ...f, netWeightKg: String(v) }))} mb="sm" />
          <NumberInput label="Number of bags" value={form.numberOfBags} onChange={(v) => setForm((f) => ({ ...f, numberOfBags: String(v) }))} mb="sm" />
          <NumberInput label="Tare per bag (Kg)" value={form.tarePerBagKg} onChange={(v) => setForm((f) => ({ ...f, tarePerBagKg: String(v) }))} mb="sm" />
          <NumberInput label="Weight of bags (Kg)" value={form.weightOfBagsKg} onChange={(v) => setForm((f) => ({ ...f, weightOfBagsKg: String(v) }))} mb="sm" />
        </SimpleGrid>

        <Card withBorder radius="md" p="md" mt="lg" mb="lg" bg="gray.0">
          <Text fw={600} mb="sm">Calculated values</Text>
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <div>
              <Text size="xs" c="dimmed">Weight of bags</Text>
              <Text fw={700}>{derived.weightOfBagsKg.toLocaleString()} Kg</Text>
            </div>
            <div>
              <Text size="xs" c="dimmed">Pure weight</Text>
              <Text fw={700}>{derived.pureWeightKg.toLocaleString()} Kg</Text>
            </div>
            <div>
              <Text size="xs" c="dimmed">Variance</Text>
              <Text fw={700}>{derived.varianceKg.toLocaleString()} Kg</Text>
            </div>
            <div>
              <Text size="xs" c="dimmed">Stock processed</Text>
              <Text fw={700}>{derived.stockProcessedKg.toLocaleString()} Kg</Text>
            </div>
            <div>
              <Text size="xs" c="dimmed">Stock balance</Text>
              <Text fw={700}>{derived.stockBalanceKg.toLocaleString()} Kg</Text>
            </div>
          </SimpleGrid>
        </Card>

        <Button fullWidth onClick={submitReceipt}>Save receipt</Button>
      </Modal>
    </div>
  );
}
