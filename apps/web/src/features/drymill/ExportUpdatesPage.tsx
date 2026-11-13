import { useMemo, useState } from 'react';
import { BarChart } from '@mantine/charts';
import { Badge, Button, Card, Group, Modal, NumberInput, Select, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { IconScale, IconShip, IconTruckDelivery } from '@tabler/icons-react';
import { KpiCard } from '../../components/KpiCard';
import { clients, exportKpis, exportedByClient, parchProcessingKpis, recentExportShipments } from '../../mock/drymill';

const statusColor: Record<string, string> = { PLANNED: 'gray', SHIPPED: 'blue', DELIVERED: 'teal' };
const exportProcesses = ['FULLWASHED A1', 'FULLWASHED A2', 'FULLWASHED A3', 'NATURAL A1', 'HONEY A1', 'FW HG', 'NATURAL HG', 'SEMI-WASHED A1'];
const exportGrades = ['A1', 'A2', 'A3', 'A4', 'HG', 'HPC', 'FLOAT', 'HC'];

export function ExportUpdatesPage() {
  const [shipments, setShipments] = useState(recentExportShipments);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState('All');
  const [selectedProcess, setSelectedProcess] = useState('All');
  const [selectedGrade, setSelectedGrade] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [client, setClient] = useState<string | null>(null);
  const [process, setProcess] = useState<string | null>(exportProcesses[0]);
  const [grade, setGrade] = useState<string | null>(exportGrades[0]);
  const [lineQty, setLineQty] = useState<number | ''>('');
  const [lineItems, setLineItems] = useState<Array<{ process: string; grade: string; qtyKg: number }>>([]);

  const availableDates = useMemo(
    () => [...new Set(shipments.map((shipment) => shipment.deliveryToNaebDate))].sort().reverse(),
    [shipments],
  );

  const filteredShipments = useMemo(() => {
    return shipments.filter((shipment) => {
      const clientMatch = selectedClient === 'All' || shipment.client === selectedClient;
      const shipmentDate = shipment.deliveryToNaebDate;
      const fromMatch = !dateFrom || shipmentDate >= dateFrom;
      const toMatch = !dateTo || shipmentDate <= dateTo;
      const processMatch = selectedProcess === 'All' || (shipment.exportedProcesses ?? []).some((item) => item.process === selectedProcess);
      const gradeMatch = selectedGrade === 'All' || (shipment.exportedProcesses ?? []).some((item) => item.grade === selectedGrade);

      return clientMatch && fromMatch && toMatch && processMatch && gradeMatch;
    });
  }, [shipments, selectedClient, dateFrom, dateTo, selectedProcess, selectedGrade]);

  const exportedByGrade = useMemo(() => {
    const totals: Record<string, number> = { '15+': 0, 'GTR 15+': 0, 'CRS 15+': 0, '13/14': 0, '13/14 - GTR': 0, '13/14 - CRS': 0, Chips: 0, Inkuburano: 0 };

    shipments.forEach((shipment) => {
      (shipment.exportedProcesses ?? []).forEach((item) => {
        totals[item.grade] = (totals[item.grade] ?? 0) + item.qtyKg;
      });
    });

    return totals;
  }, [shipments]);

  const exportedQuantityKg = useMemo(
    () => shipments.reduce((sum, item) => sum + item.exportedQtyKg, 0),
    [shipments],
  );

  const summary = useMemo(() => {
    const totalProcessedKg = parchProcessingKpis.greenOutputQuantityKg ?? 0;
    const processed15Plus = parchProcessingKpis.standard15Kg ?? 0;
    const processed1314 = parchProcessingKpis.grade1314Kg ?? 0;
    const processedGtr = parchProcessingKpis.gtrKg ?? 0;
    const processedCst = parchProcessingKpis.cstKg ?? 0;

    const exported15Plus = exportedByGrade['15+'] ?? 0;
    const exported1314 = exportedByGrade['13/14'] ?? 0;
    const exportedGtr = exportedByGrade['GTR 15+'] ?? 0;
    const exportedCst = exportedByGrade['CRS 15+'] ?? 0;

    return {
      exportedQuantityKg,
      stockBalanceQuantityKg: Math.max(totalProcessedKg - exportedQuantityKg, 0),
      exp17Kg: exportedByGrade['17+'] ?? 0,
      exp15Kg: exported15Plus,
      exp1314Kg: exported1314,
      expGtrKg: exportedGtr,
      expCstKg: exportedCst,
      bal15Kg: Math.max(processed15Plus - exported15Plus, 0),
      bal1314Kg: Math.max(processed1314 - exported1314, 0),
      balGtrKg: Math.max(processedGtr - exportedGtr, 0),
      balCstKg: Math.max(processedCst - exportedCst, 0),
    };
  }, [exportedByGrade, exportedQuantityKg]);

  function addLineItem() {
    const qty = Number(lineQty) || 0;
    if (!qty || !process || !grade) return;

    setLineItems((prev) => [...prev, { process, grade, qtyKg: qty }]);
    setLineQty('');
  }

  function submitShipment() {
    const totalQty = lineItems.reduce((sum, item) => sum + item.qtyKg, 0);
    const productSummary = lineItems
      .map((item) => `${item.process} / ${item.grade}: ${item.qtyKg.toLocaleString()}kg`)
      .join(' • ');

    setShipments((prev) => [
      {
        id: crypto.randomUUID(),
        deliveryToNaebDate: new Date().toISOString().slice(0, 10),
        client: client ?? 'UNKNOWN',
        exportedQtyKg: totalQty || Number(lineQty) || 0,
        productSummary: productSummary || `${process ?? 'UNKNOWN'} / ${grade ?? 'UNKNOWN'}: ${Number(lineQty || 0).toLocaleString()}kg`,
        exportedProcesses: lineItems.length > 0 ? lineItems : [{ process: process ?? 'UNKNOWN', grade: grade ?? 'UNKNOWN', qtyKg: Number(lineQty) || 0 }],
        status: 'PLANNED',
      },
      ...prev,
    ]);
    setModalOpen(false);
    setClient(null);
    setProcess(exportProcesses[0]);
    setGrade(exportGrades[0]);
    setLineQty('');
    setLineItems([]);
  }

  return (
    <div>
      <Group justify="space-between" mb="lg">
        <div>
          <Title order={2}>Export Updates</Title>
          <Text c="dimmed" size="sm">Green coffee shipped to clients, and remaining stock balance by grade</Text>
        </div>
        <Button leftSection={<IconShip size={16} />} onClick={() => setModalOpen(true)}>
          Record export shipment
        </Button>
      </Group>

      <Group justify="flex-end" gap="md" mb="lg">
        <Select
          label="Client name"
          data={['All', ...clients]}
          value={selectedClient}
          onChange={(value) => setSelectedClient(value ?? 'All')}
          styles={{ input: { minWidth: 180 } }}
        />
        <Select
          label="Process"
          data={['All', ...exportProcesses]}
          value={selectedProcess}
          onChange={(value) => setSelectedProcess(value ?? 'All')}
          styles={{ input: { minWidth: 180 } }}
        />
        <Select
          label="Grade"
          data={['All', ...exportGrades]}
          value={selectedGrade}
          onChange={(value) => setSelectedGrade(value ?? 'All')}
          styles={{ input: { minWidth: 180 } }}
        />
        <div>
          <Text size="xs" c="dimmed" fw={600} mb={6}>Date range</Text>
          <Group gap="sm">
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.currentTarget.value)}
              style={{ minWidth: 150, height: 36, borderRadius: 8, border: '1px solid #dfe3e8', padding: '0 10px', background: '#fff' }}
            />
            <Text c="dimmed">to</Text>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.currentTarget.value)}
              style={{ minWidth: 150, height: 36, borderRadius: 8, border: '1px solid #dfe3e8', padding: '0 10px', background: '#fff' }}
            />
          </Group>
        </div>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2 }} mb="lg">
        <KpiCard label="Exported quantity (Kg)" value={summary.exportedQuantityKg.toLocaleString()} icon={IconShip} />
        <KpiCard label="Stock balance quantity (Kg)" value={summary.stockBalanceQuantityKg.toLocaleString()} icon={IconScale} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 2, sm: 4 }} mb="xs">
        <KpiCard label="Exp. 17 (Kg)" value={summary.exp17Kg.toLocaleString()} />
        <KpiCard label="Exp. 15+ (Kg)" value={summary.exp15Kg.toLocaleString()} />
        <KpiCard label="Exp. 13/14 (Kg)" value={summary.exp1314Kg.toLocaleString()} />
        <KpiCard label="Exp. GTR (Kg)" value={summary.expGtrKg.toLocaleString()} />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 2, sm: 4 }} mb="lg">
        <KpiCard label="Bal. 15+ (Kg)" value={summary.bal15Kg.toLocaleString()} accent="gray" />
        <KpiCard label="Bal. 13/14 (Kg)" value={summary.bal1314Kg.toLocaleString()} accent="gray" />
        <KpiCard label="Bal. GTR (Kg)" value={summary.balGtrKg.toLocaleString()} accent="gray" />
        <KpiCard label="Bal. CST (Kg)" value={summary.balCstKg.toLocaleString()} accent="gray" />
      </SimpleGrid>

      <Card withBorder radius="md" p="md" mb="lg">
        <Text fw={600} mb="sm">Client name by exported quantity</Text>
        <BarChart
          h={280}
          data={exportedByClient}
          dataKey="client"
          series={[{ name: 'kg', color: 'coffee.6' }]}
          orientation="vertical"
          yAxisProps={{ width: 110 }}
          withTooltip
        />
      </Card>

      <Card withBorder radius="md" p="md">
        <Text fw={600} mb="sm">Recent export shipments</Text>
        <Table striped highlightOnHover verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Delivery to NAEB</Table.Th>
              <Table.Th>Client</Table.Th>
              <Table.Th>Process / grade</Table.Th>
              <Table.Th>Exported qty (Kg)</Table.Th>
              <Table.Th>Status</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filteredShipments.map((s) => (
              <Table.Tr key={s.id}>
                <Table.Td>{s.deliveryToNaebDate}</Table.Td>
                <Table.Td>{s.client}</Table.Td>
                <Table.Td>{s.productSummary ?? '—'}</Table.Td>
                <Table.Td>{s.exportedQtyKg.toLocaleString()}</Table.Td>
                <Table.Td><Badge color={statusColor[s.status]} variant="light">{s.status}</Badge></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title="Record export shipment" size="lg">
        <Stack gap="sm">
          <Select label="Client" data={clients} value={client} onChange={setClient} />
          <Select label="Process" data={exportProcesses} value={process} onChange={setProcess} />
          <Select label="Grade / quality" data={exportGrades} value={grade} onChange={setGrade} />
          <NumberInput label="Exported quantity (Kg)" value={lineQty} onChange={(v) => setLineQty(v as number)} leftSection={<IconTruckDelivery size={16} />} />

          <Button variant="default" onClick={addLineItem} disabled={!process || !grade || !lineQty}>Add process line</Button>

          {lineItems.length > 0 && (
            <Card withBorder p="sm">
              <Text fw={600} size="sm" mb="xs">Added export entries</Text>
              {lineItems.map((item, index) => (
                <Text key={`${item.process}-${item.grade}-${index}`} size="sm" c="dimmed">
                  {item.process} / {item.grade}: {item.qtyKg.toLocaleString()}kg
                </Text>
              ))}
            </Card>
          )}

          <Button fullWidth onClick={submitShipment} disabled={lineItems.length === 0 && (!process || !grade || !lineQty)}>
            Save shipment
          </Button>
        </Stack>
      </Modal>
    </div>
  );
}
