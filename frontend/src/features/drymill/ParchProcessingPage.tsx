import { useMemo, useState } from 'react';
import { BarChart } from '@mantine/charts';
import { Badge, Button, Card, Group, Modal, NativeSelect, NumberInput, Progress, Select, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { IconDroplet, IconFlask, IconScale } from '@tabler/icons-react';
import { calculateOutturnPct } from '../../types';
import { KpiCard } from '../../components/KpiCard';
import { dryMillOrigins, greenOutputByOrigin, parchProcessingKpis, recentDryMillBatches } from '../../mock/drymill';

const defaultProductBreakdown = [
  { id: 'p1', name: '15+', kg: 0 },
  { id: 'p2', name: 'GTR 15+', kg: 0 },
  { id: 'p3', name: 'CRS 15+', kg: 0 },
  { id: 'p4', name: '13/14', kg: 0 },
  { id: 'p5', name: '13/14 - GTR', kg: 0 },
  { id: 'p6', name: '13/14 - CRS', kg: 0 },
  { id: 'p7', name: 'Chips', kg: 0 },
  { id: 'p8', name: 'Inkuburano', kg: 0 },
];

const processProductOptions = [
  'FULLWASHED A1',
  'FULLWASHED A2',
  'FULLWASHED A3',
  'NATURAL A1',
  'HONEY A1',
  'FW HG',
  'NATURAL HG',
  'SEMI-WASHED A1',
];

export function ParchProcessingPage() {
  const [batches, setBatches] = useState(recentDryMillBatches);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState('All');
  const [selectedOrigin, setSelectedOrigin] = useState('All');
  const [selectedProcess, setSelectedProcess] = useState('All');
  const [selectedInputGrade, setSelectedInputGrade] = useState('All');
  const [origin, setOrigin] = useState<string | null>('GITOKI');
  const [processProduct, setProcessProduct] = useState<string | null>('FULLWASHED A1');
  const [parchInputKg, setParchInputKg] = useState<number | ''>('');
  const [outputBreakdown, setOutputBreakdown] = useState(defaultProductBreakdown);

  const availableDates = useMemo(
    () => [...new Set(batches.map((batch) => batch.processingDate))].sort().reverse(),
    [batches],
  );

  const filteredBatches = useMemo(() => {
    return batches.filter((batch) => {
      const dateMatch = selectedDate === 'All' || batch.processingDate === selectedDate;
      const originMatch = selectedOrigin === 'All' || batch.origin === selectedOrigin || batch.sourceStation === selectedOrigin;
      const processMatch = selectedProcess === 'All' || batch.processProduct === selectedProcess;
      const inputGradeMatch = selectedInputGrade === 'All' || batch.inputGrade === selectedInputGrade;
      return dateMatch && originMatch && processMatch && inputGradeMatch;
    });
  }, [batches, selectedDate, selectedOrigin, selectedProcess, selectedInputGrade]);

  const dailyGrowthData = useMemo(() => {
    const dates = [...new Set(batches.map((batch) => batch.processingDate))].sort();

    return dates.map((date) => {
      const dayBatches = batches.filter((batch) => batch.processingDate === date);
      const dayOutputKg = dayBatches.reduce((sum, batch) => sum + batch.greenOutputKg, 0);
      const previousDate = dates[dates.indexOf(date) - 1];
      const previousOutput = previousDate
        ? batches.filter((batch) => batch.processingDate === previousDate).reduce((sum, batch) => sum + batch.greenOutputKg, 0)
        : dayOutputKg;

      const growthRate = previousOutput === 0 ? 0 : ((dayOutputKg - previousOutput) / previousOutput) * 100;

      return { date, growthRate, outputKg: dayOutputKg };
    });
  }, [batches]);

  const totalOutputKg = useMemo(
    () => outputBreakdown.reduce((sum, item) => sum + Number(item.kg || 0), 0),
    [outputBreakdown],
  );

  const liveOutturn = parchInputKg !== '' && totalOutputKg > 0 ? calculateOutturnPct(totalOutputKg, Number(parchInputKg)) : 0;

  const summary = useMemo(() => {
    const totalInputKg = filteredBatches.reduce((sum, batch) => sum + batch.parchInputKg, 0);
    const totalOutputKg = filteredBatches.reduce((sum, batch) => sum + batch.greenOutputKg, 0);
    const fifteenPlusKg = filteredBatches.reduce((sum, batch) => {
      const match = (batch.outputBreakdown ?? '').match(/15\+\s*:\s*([0-9,]+)\s*kg/i);
      if (!match) return sum;
      return sum + Number((match[1] ?? '0').replace(/,/g, ''));
    }, 0);

    return {
      totalInputKg,
      totalOutputKg,
      fifteenPlusKg,
      outturnPct: totalInputKg > 0 ? (totalOutputKg / totalInputKg) * 100 : 0,
      hgOutturnPct: totalInputKg > 0 ? (fifteenPlusKg / totalInputKg) * 100 : 0,
    };
  }, [filteredBatches]);

  const lastDayDeltaPct = dailyGrowthData.length > 1 ? dailyGrowthData[dailyGrowthData.length - 1].growthRate : 0;

  function updateBreakdownItem(id: string, value: number | string) {
    setOutputBreakdown((prev) => prev.map((item) => (item.id === id ? { ...item, kg: Number(value) || 0 } : item)));
  }

  function submitBatch() {
    const input = Number(parchInputKg) || 0;
    const breakdownText = outputBreakdown
      .filter((item) => Number(item.kg) > 0)
      .map((item) => `${item.name}: ${Number(item.kg).toLocaleString()}kg`)
      .join(' • ');

    setBatches((prev) => [
      {
        id: crypto.randomUUID(),
        batchNo: `${Date.now()}-${origin ?? 'UNK'}-${processProduct ?? ''}`,
        processingDate: new Date().toISOString().slice(0, 10),
        origin: origin ?? 'UNKNOWN',
        inputGrade: processProduct ?? '',
        sourceStation: origin ?? 'UNKNOWN',
        processProduct: processProduct ?? '',
        outputBreakdown: breakdownText || 'No product breakdown entered',
        parchInputKg: input,
        greenOutputKg: totalOutputKg,
        outturnPct: calculateOutturnPct(totalOutputKg, input),
        status: 'COMPLETED',
      },
      ...prev,
    ]);
    setModalOpen(false);
    setOrigin('GITOKI');
    setProcessProduct('FULLWASHED A1');
    setParchInputKg('');
    setOutputBreakdown(defaultProductBreakdown);
  }

  return (
    <div>
      <Group justify="space-between" mb="lg" align="flex-end">
        <div>
          <Title order={2}>Parchment Processing</Title>
          <Text c="dimmed" size="sm">Parchment → green coffee conversion at the HQ dry mill, by batch and product breakdown</Text>
        </div>
        <Button leftSection={<IconFlask size={16} />} onClick={() => setModalOpen(true)}>
          Record dry mill batch
        </Button>
      </Group>

      <Group justify="flex-end" gap="md" mb="lg">
        <NativeSelect
          label="Origin"
          data={['All', ...dryMillOrigins]}
          value={selectedOrigin}
          onChange={(event) => setSelectedOrigin(event.currentTarget.value)}
          styles={{ input: { minWidth: 180 } }}
        />
        <NativeSelect
          label="Process"
          data={['All', ...processProductOptions]}
          value={selectedProcess}
          onChange={(event) => setSelectedProcess(event.currentTarget.value)}
          styles={{ input: { minWidth: 180 } }}
        />
        <NativeSelect
          label="Input Grade"
          data={['All', ...Array.from(new Set(batches.map((batch) => batch.inputGrade)))]}
          value={selectedInputGrade}
          onChange={(event) => setSelectedInputGrade(event.currentTarget.value)}
          styles={{ input: { minWidth: 180 } }}
        />
        <NativeSelect
          label="Date"
          data={['All', ...availableDates]}
          value={selectedDate}
          onChange={(event) => setSelectedDate(event.currentTarget.value)}
          styles={{ input: { minWidth: 180 } }}
        />
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 4 }} mb="lg">
        <KpiCard
          label="Inputs quantity (Kg)"
          value={summary.totalInputKg.toLocaleString()}
          icon={IconScale}
          delta={`${lastDayDeltaPct >= 0 ? '+' : ''}${lastDayDeltaPct.toFixed(1)}% vs last day`}
        />
        <KpiCard
          label="Green output quantity (Kg)"
          value={summary.totalOutputKg.toLocaleString()}
          icon={IconDroplet}
          delta={`${lastDayDeltaPct >= 0 ? '+' : ''}${lastDayDeltaPct.toFixed(1)}% vs last day`}
        />
        <KpiCard
          label="Parch → Green out-turn (%)"
          value={`${summary.outturnPct.toFixed(2)}%`}
          icon={IconFlask}
          delta={`${lastDayDeltaPct >= 0 ? '+' : ''}${lastDayDeltaPct.toFixed(1)}% vs last day`}
        />
        <KpiCard
          label="HG out-turn (%)"
          value={`${summary.hgOutturnPct.toFixed(2)}%`}
          icon={IconFlask}
          delta={`${lastDayDeltaPct >= 0 ? '+' : ''}${lastDayDeltaPct.toFixed(1)}% vs last day`}
        />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="lg">
        <KpiCard
          label="15+ (Kg)"
          value={summary.fifteenPlusKg.toLocaleString()}
          delta={`${lastDayDeltaPct >= 0 ? '+' : ''}${lastDayDeltaPct.toFixed(1)}% vs last day`}
        />
        <KpiCard
          label="15+ GTR (Kg)"
          value={parchProcessingKpis.gtrKg.toLocaleString()}
          delta={`${lastDayDeltaPct >= 0 ? '+' : ''}${lastDayDeltaPct.toFixed(1)}% vs last day`}
        />
        <KpiCard
          label="15+ CRS (Kg)"
          value={parchProcessingKpis.cstKg.toLocaleString()}
          delta={`${lastDayDeltaPct >= 0 ? '+' : ''}${lastDayDeltaPct.toFixed(1)}% vs last day`}
        />
        <KpiCard
          label="13/14 (Kg)"
          value={parchProcessingKpis.grade1314Kg.toLocaleString()}
          delta={`${lastDayDeltaPct >= 0 ? '+' : ''}${lastDayDeltaPct.toFixed(1)}% vs last day`}
        />
        <KpiCard
          label="13/14 - GTR (Kg)"
          value={parchProcessingKpis.gtrKg.toLocaleString()}
          delta={`${lastDayDeltaPct >= 0 ? '+' : ''}${lastDayDeltaPct.toFixed(1)}% vs last day`}
        />
        <KpiCard
          label="13/14 - CRS (Kg)"
          value={parchProcessingKpis.cstKg.toLocaleString()}
          delta={`${lastDayDeltaPct >= 0 ? '+' : ''}${lastDayDeltaPct.toFixed(1)}% vs last day`}
        />
        <KpiCard
          label="Chips (Kg)"
          value={parchProcessingKpis.chipsKg.toLocaleString()}
          delta={`${lastDayDeltaPct >= 0 ? '+' : ''}${lastDayDeltaPct.toFixed(1)}% vs last day`}
        />
        <KpiCard
          label="Inkuburano (Kg)"
          value={parchProcessingKpis.triageKg.toLocaleString()}
          delta={`${lastDayDeltaPct >= 0 ? '+' : ''}${lastDayDeltaPct.toFixed(1)}% vs last day`}
        />
      </SimpleGrid>

      <Card withBorder radius="md" p="md" mb="lg">
        <Text fw={600} mb="sm">Origin (Baho / Partner) by green output</Text>
        <BarChart
          h={280}
          data={greenOutputByOrigin}
          dataKey="origin"
          series={[{ name: 'kg', color: 'coffee.6' }]}
          orientation="vertical"
          yAxisProps={{ width: 120 }}
          withTooltip
        />
      </Card>

      <Card withBorder radius="md" p="md">
        <Text fw={600} mb="sm">Recent dry mill batches</Text>
        <Table striped highlightOnHover verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Date</Table.Th>
              <Table.Th>Origin</Table.Th>
              <Table.Th>Process / product</Table.Th>
              <Table.Th>Parch input (Kg)</Table.Th>
              <Table.Th>Green output (Kg)</Table.Th>
              <Table.Th>Product breakdown</Table.Th>
              <Table.Th>Out-turn</Table.Th>
              <Table.Th>Status</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filteredBatches.map((b) => (
              <Table.Tr key={b.id}>
                <Table.Td>{b.processingDate}</Table.Td>
                <Table.Td>{b.sourceStation ?? b.origin}</Table.Td>
                <Table.Td>{b.processProduct ?? b.inputGrade}</Table.Td>
                <Table.Td>{b.parchInputKg.toLocaleString()}</Table.Td>
                <Table.Td>{b.greenOutputKg.toLocaleString()}</Table.Td>
                <Table.Td>{b.outputBreakdown ?? '—'}</Table.Td>
                <Table.Td style={{ minWidth: 140 }}>
                  <Group gap={6}>
                    <Progress value={b.outturnPct} size="sm" w={70} color="coffee" />
                    <Text size="sm">{b.outturnPct.toFixed(1)}%</Text>
                  </Group>
                </Table.Td>
                <Table.Td><Badge color={b.status === 'COMPLETED' ? 'teal' : 'blue'} variant="light">{b.status.replace('_', ' ')}</Badge></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title="Record dry mill batch" size="lg">
        <Stack gap="sm">
          <Select label="Source CWS / station" data={dryMillOrigins} value={origin} onChange={setOrigin} />
          <Select label="Process / product" data={processProductOptions} value={processProduct} onChange={setProcessProduct} />
          <NumberInput label="Parchment input (Kg)" value={parchInputKg} onChange={(v) => setParchInputKg(v as number)} />

          <Card withBorder p="sm">
            <Text fw={600} mb="sm">Green coffee product breakdown</Text>
            <Stack gap="xs">
              {outputBreakdown.map((item) => (
                <Group key={item.id} align="center" grow>
                  <Text size="sm" fw={500}>{item.name}</Text>
                  <NumberInput
                    label="Kg"
                    hideControls
                    value={item.kg}
                    onChange={(value) => updateBreakdownItem(item.id, value as number)}
                  />
                </Group>
              ))}
            </Stack>
          </Card>

          <Text size="sm" c="dimmed">
            Total green output: <strong>{totalOutputKg.toLocaleString()} Kg</strong>
          </Text>
          {parchInputKg !== '' && totalOutputKg > 0 && (
            <Text size="sm" c="dimmed" mb="md">
              Live out-turn: <strong>{liveOutturn.toFixed(2)}%</strong>
            </Text>
          )}
          <Button fullWidth onClick={submitBatch}>Save batch</Button>
        </Stack>
      </Modal>
    </div>
  );
}
