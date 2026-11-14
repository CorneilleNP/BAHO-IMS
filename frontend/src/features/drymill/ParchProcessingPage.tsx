import { useMemo, useState } from 'react';
import { BarChart } from '@mantine/charts';
import { Autocomplete, Badge, Button, Card, Group, Modal, NativeSelect, NumberInput, Progress, Select, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconDroplet, IconFlask, IconScale } from '@tabler/icons-react';
import { EmptyState, ErrorMessage, Loading, SuccessMessage } from '../../components/Feedback';
import { KpiCard } from '../../components/KpiCard';
import { api } from '../../lib/api';
import { canWrite } from '../../lib/access';
import { useAuth } from '../../lib/authContext';
import { calculateOutturnPct, changeLabel, chartRows, kg, num, pct, today } from '../../lib/format';
import { sourceFields, sourceOptions } from '../../lib/sources';
import type { CoffeeSource, DryMillBatch, ExportGrade, ProcessingSummary } from '../../lib/types';
import { errorText, query, useApi, useList } from '../../lib/useApi';

// Suggestions only; any product name can be typed and is remembered once used.
const COMMON_PRODUCTS = ['FULLWASHED A1', 'FULLWASHED A2', 'FULLWASHED A3', 'NATURAL A1', 'HONEY A1', 'FW HG', 'NATURAL HG', 'SEMI-WASHED A1'];

export function ParchProcessingPage() {
  const { user } = useAuth();
  const writable = canWrite(user, 'drymill');
  const [date, setDate] = useState('All');
  const [source, setSource] = useState('All');
  const [product, setProduct] = useState('All');
  const [modalOpen, setModalOpen] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const summary = useApi<ProcessingSummary>(`/reporting/drymill/processing/${query({ date, source, process_product: product })}`);
  const batches = useList<DryMillBatch>(
    `/drymill/batches/${query({ processing_date: date, process_product: product, source, page_size: 25 })}`,
  );
  const s = summary.data;
  const delta = changeLabel(s?.change_vs_previous_day_pct, s ? 'previous day' : null);
  const shownBatches = batches.items;

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Parchment Processing</Title>
          <Text c="dimmed" size="sm">Parchment → green coffee at the HQ dry mill, by batch and product</Text>
        </div>
        {writable && (
          <Button leftSection={<IconFlask size={16} />} onClick={() => setModalOpen(true)}>Record dry mill batch</Button>
        )}
      </Group>

      <SuccessMessage onClose={() => setSaved(null)}>{saved}</SuccessMessage>
      <ErrorMessage>{summary.error}</ErrorMessage>

      <Group justify="flex-end" gap="md">
        <NativeSelect label="Source" data={['All', ...(s?.options.sources ?? [])]} value={source} onChange={(e) => setSource(e.currentTarget.value)} miw={170} />
        <NativeSelect label="Process / product" data={['All', ...(s?.options.process_products ?? [])]} value={product} onChange={(e) => setProduct(e.currentTarget.value)} miw={190} />
        <NativeSelect label="Date" data={['All', ...(s?.options.dates ?? [])]} value={date} onChange={(e) => setDate(e.currentTarget.value)} miw={150} />
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        <KpiCard label="Parchment input (kg)" value={kg(s?.totals.parch_input_kg)} icon={IconScale} />
        <KpiCard label="Green output (kg)" value={kg(s?.totals.green_output_kg)} icon={IconDroplet} delta={delta} />
        <KpiCard label="Parch → green out-turn" value={pct(s?.totals.outturn_pct, 2)} icon={IconFlask} />
        <KpiCard label="HG out-turn (17+ & 15+)" value={pct(s?.totals.hg_outturn_pct, 2)} icon={IconFlask} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }}>
        {(s?.by_grade ?? []).map((g) => (
          <KpiCard key={g.code} label={`${g.name} (kg)`} value={kg(g.kg)} />
        ))}
      </SimpleGrid>

      <Card withBorder radius="md" p="md">
        <Text fw={600} mb="sm">Green output by origin (Baho / partner)</Text>
        {summary.loading && !s ? (
          <Loading />
        ) : !s?.by_source.length ? (
          <EmptyState title="No batches yet" />
        ) : (
          <BarChart
            h={Math.max(160, s.by_source.length * 34)}
            data={chartRows(s.by_source)}
            dataKey="label"
            series={[{ name: 'kg', color: 'coffee.6' }]}
            orientation="vertical"
            yAxisProps={{ width: 130 }}
            valueFormatter={(v) => `${v.toLocaleString()} kg`}
            withTooltip
          />
        )}
      </Card>

      <Card withBorder radius="md" p="md">
        <Text fw={600} mb="sm">Recent dry mill batches</Text>
        {batches.loading && !batches.data ? (
          <Loading />
        ) : shownBatches.length === 0 ? (
          <EmptyState title="No batches recorded yet">Use “Record dry mill batch” after each milling run.</EmptyState>
        ) : (
          <Table.ScrollContainer minWidth={950}>
            <Table striped highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Batch</Table.Th>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>Origin</Table.Th>
                  <Table.Th>Process / product</Table.Th>
                  <Table.Th ta="right">Parch input (kg)</Table.Th>
                  <Table.Th ta="right">Green output (kg)</Table.Th>
                  <Table.Th>Product breakdown</Table.Th>
                  <Table.Th>Out-turn</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {shownBatches.map((b) => (
                  <Table.Tr key={b.id}>
                    <Table.Td ff="monospace">{b.batch_no}</Table.Td>
                    <Table.Td>{b.processing_date}</Table.Td>
                    <Table.Td>{b.source_name}</Table.Td>
                    <Table.Td>{b.process_product}</Table.Td>
                    <Table.Td ta="right">{kg(b.parch_input_kg)}</Table.Td>
                    <Table.Td ta="right">{kg(b.green_output_kg)}</Table.Td>
                    <Table.Td>
                      <Text size="xs">{b.outputs.map((o) => `${o.grade_name}: ${kg(o.qty_kg)} kg`).join(' • ') || '—'}</Text>
                    </Table.Td>
                    <Table.Td miw={140}>
                      <Group gap={6} wrap="nowrap">
                        <Progress value={Math.min(num(b.outturn_pct), 100)} size="sm" w={70} color="coffee" />
                        <Text size="sm">{pct(b.outturn_pct)}</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={b.status === 'COMPLETED' ? 'teal' : 'blue'} variant="light">{b.status.replace('_', ' ')}</Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>

      {modalOpen && (
        <BatchModal
          knownProducts={s?.options.process_products ?? []}
          onClose={() => setModalOpen(false)}
          onSaved={(batch) => {
            setModalOpen(false);
            setSaved(`Saved batch ${batch.batch_no}: ${kg(batch.green_output_kg)} kg green from ${kg(batch.parch_input_kg)} kg parchment (${pct(batch.outturn_pct, 2)}).`);
            summary.reload();
            batches.reload();
          }}
        />
      )}
    </Stack>
  );
}

function BatchModal({ knownProducts, onClose, onSaved }: { knownProducts: string[]; onClose: () => void; onSaved: (b: DryMillBatch) => void }) {
  const sources = useApi<CoffeeSource[]>('/drymill/sources/');
  const grades = useApi<ExportGrade[]>('/drymill/export-grades/');
  const [source, setSource] = useState<string | null>(null);
  const [product, setProduct] = useState('');
  const [processingDate, setProcessingDate] = useState(today());
  const [batchNo, setBatchNo] = useState('');
  const [inputKg, setInputKg] = useState<number | ''>('');
  const [outputs, setOutputs] = useState<Record<string, number | ''>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalOutput = useMemo(() => Object.values(outputs).reduce<number>((sum, v) => sum + num(v), 0), [outputs]);
  const liveOutturn = num(inputKg) > 0 ? calculateOutturnPct(totalOutput, num(inputKg)) : 0;

  async function save() {
    const origin = sourceFields(source);
    if (!origin) return setError('Choose the source CWS or supplier.');
    if (!product.trim()) return setError('Enter the process / product.');
    if (num(inputKg) <= 0) return setError('Enter the parchment input.');
    setSaving(true);
    setError(null);
    try {
      const batch = await api<DryMillBatch>('/drymill/batches/', {
        method: 'POST',
        body: {
          ...origin,
          process_product: product.trim().toUpperCase(),
          processing_date: processingDate,
          batch_no: batchNo.trim(),
          parch_input_kg: num(inputKg),
          outputs: Object.entries(outputs)
            .filter(([, v]) => num(v) > 0)
            .map(([export_grade, v]) => ({ export_grade, qty_kg: num(v) })),
        },
      });
      onSaved(batch);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal opened onClose={onClose} title="Record dry mill batch" size="lg">
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select label="Source CWS / supplier" required data={sourceOptions(sources.data ?? [])} value={source} onChange={setSource} searchable />
          <Autocomplete label="Process / product" required data={Array.from(new Set([...knownProducts, ...COMMON_PRODUCTS]))} value={product} onChange={setProduct} />
          <TextInput label="Processing date" type="date" value={processingDate} onChange={(e) => setProcessingDate(e.currentTarget.value)} />
          <TextInput label="Batch no." placeholder="Automatic if empty" value={batchNo} onChange={(e) => setBatchNo(e.currentTarget.value)} />
          <NumberInput label="Parchment input (kg)" required value={inputKg} onChange={(v) => setInputKg(v === '' ? '' : Number(v))} min={0} hideControls thousandSeparator="," />
        </SimpleGrid>

        <Card withBorder p="sm">
          <Text fw={600} mb="xs">Green coffee output by grade</Text>
          {grades.loading && !grades.data ? (
            <Loading />
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
              {(grades.data ?? []).map((g) => (
                <NumberInput
                  key={g.id}
                  label={`${g.name} (kg)`}
                  value={outputs[g.id] ?? ''}
                  onChange={(v) => setOutputs((prev) => ({ ...prev, [g.id]: v === '' ? '' : Number(v) }))}
                  min={0}
                  hideControls
                  thousandSeparator=","
                />
              ))}
            </SimpleGrid>
          )}
        </Card>

        <Text size="sm" c="dimmed">
          Total green output: <strong>{kg(totalOutput)} kg</strong>
          {num(inputKg) > 0 && totalOutput > 0 && <> · live out-turn <strong>{pct(liveOutturn, 2)}</strong></>}
        </Text>
        <ErrorMessage>{error}</ErrorMessage>
        <Button onClick={save} loading={saving}>Save batch</Button>
      </Stack>
    </Modal>
  );
}
