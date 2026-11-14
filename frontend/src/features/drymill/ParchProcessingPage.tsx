import { useMemo, useState } from 'react';
import { Autocomplete, Badge, Button, Card, Group, Modal, NativeSelect, NumberInput, Progress, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { IconDroplet, IconFlask, IconScale } from '@tabler/icons-react';
import { ChartCard } from '../../components/ChartCard';
import { DataTable } from '../../components/DataTable';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import { ErrorMessage } from '../../components/Feedback';
import { KpiCard } from '../../components/KpiCard';
import { PageHeader } from '../../components/PageHeader';
import { FormSkeleton } from '../../components/Skeletons';
import { SourceSelect } from '../../components/SourceSelect';
import { VoidButton } from '../../components/VoidButton';
import { api } from '../../lib/api';
import { canWrite } from '../../lib/access';
import { useAuth } from '../../lib/authContext';
import { fetchAllPages } from '../../lib/exportTable';
import { ANY_DATE, calculateOutturnPct, changeLabel, kg, num, pct, today, type DateRange } from '../../lib/format';
import { toast } from '../../lib/toast';
import { sourceFields } from '../../lib/sources';
import type { DryMillBatch, ExportGrade, ProcessingSummary } from '../../lib/types';
import { query, useApi, useList } from '../../lib/useApi';
import { useSubmit } from '../../lib/useSubmit';

// Suggestions only; any product name can be typed and is remembered once used.
const COMMON_PRODUCTS = ['FULLWASHED A1', 'FULLWASHED A2', 'FULLWASHED A3', 'NATURAL A1', 'HONEY A1', 'FW HG', 'NATURAL HG', 'SEMI-WASHED A1'];

export function ParchProcessingPage() {
  const { user } = useAuth();
  const writable = canWrite(user, 'drymill');
  const [range, setRange] = useState<DateRange>(ANY_DATE);
  const [source, setSource] = useState('All');
  const [product, setProduct] = useState('All');
  const [modalOpen, setModalOpen] = useState(false);

  const summary = useApi<ProcessingSummary>(
    `/reporting/drymill/processing/${query({ date_from: range[0], date_to: range[1], source, process_product: product })}`,
  );
  const batchesQuery = `/drymill/batches/${query({ processing_date__gte: range[0], processing_date__lte: range[1], process_product: product, source })}`;
  const batches = useList<DryMillBatch>(`${batchesQuery}${batchesQuery.includes('?') ? '&' : '?'}page_size=25`);
  const s = summary.data;
  const kpiLoading = summary.loading && !s;
  const delta = changeLabel(s?.change_vs_previous_day_pct, s ? 'previous day' : null);

  return (
    <Stack gap="lg">
      <PageHeader
        title="Parchment Processing"
        description="Parchment → green coffee at the HQ dry mill, by batch and product"
        actions={writable && <Button leftSection={<IconFlask size={16} />} onClick={() => setModalOpen(true)}>Record dry mill batch</Button>}
      />

      <ErrorMessage>{summary.error}</ErrorMessage>

      <Group justify="flex-end" gap="md" align="flex-end">
        <DateRangeFilter value={range} onChange={setRange} label="Processing dates" />
        <NativeSelect label="Source" data={['All', ...(s?.options.sources ?? [])]} value={source} onChange={(e) => setSource(e.currentTarget.value)} miw={170} />
        <NativeSelect label="Process / product" data={['All', ...(s?.options.process_products ?? [])]} value={product} onChange={(e) => setProduct(e.currentTarget.value)} miw={190} />
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        <KpiCard label="Parchment input (kg)" value={kg(s?.totals.parch_input_kg)} icon={IconScale} loading={kpiLoading} />
        <KpiCard label="Green output (kg)" value={kg(s?.totals.green_output_kg)} icon={IconDroplet} delta={delta} loading={kpiLoading} />
        <KpiCard label="Parch → green out-turn" value={pct(s?.totals.outturn_pct, 2)} icon={IconFlask} loading={kpiLoading} />
        <KpiCard label="HG out-turn (17+ & 15+)" value={pct(s?.totals.hg_outturn_pct, 2)} icon={IconFlask} loading={kpiLoading} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }}>
        {kpiLoading
          ? Array.from({ length: 5 }, (_, i) => <KpiCard key={i} label="Grade (kg)" value="" loading />)
          : (s?.by_grade ?? []).map((g) => <KpiCard key={g.code} label={`${g.name} (kg)`} value={kg(g.kg)} />)}
      </SimpleGrid>

      <ChartCard title="Green output by origin (Baho / partner)" rows={s?.by_source ?? []} loading={kpiLoading} labelWidth={130} />

      <Card withBorder radius="md" p="md">
        <Text fw={600} mb="sm">Recent dry mill batches</Text>
        <DataTable
          rows={batches.items}
          rowKey={(b) => b.id}
          loading={batches.loading}
          error={batches.error}
          minWidth={1000}
          empty={{ title: 'No batches recorded yet', hint: 'Use “Record dry mill batch” after each milling run.' }}
          exportName="dry-mill-batches"
          fetchAll={() => fetchAllPages<DryMillBatch>(batchesQuery)}
          columns={[
            { key: 'no', header: 'Batch', mono: true, render: (b) => b.batch_no },
            { key: 'date', header: 'Date', render: (b) => b.processing_date },
            { key: 'origin', header: 'Origin', render: (b) => b.source_name },
            { key: 'product', header: 'Process / product', render: (b) => b.process_product },
            { key: 'in', header: 'Parch input (kg)', align: 'right', render: (b) => kg(b.parch_input_kg), exportValue: (b) => b.parch_input_kg },
            { key: 'out', header: 'Green output (kg)', align: 'right', render: (b) => kg(b.green_output_kg), exportValue: (b) => b.green_output_kg },
            {
              key: 'breakdown',
              header: 'Product breakdown',
              exportValue: (b) => b.outputs.map((o) => `${o.grade_name}: ${o.qty_kg}`).join('; '),
              render: (b) => <Text size="xs">{b.outputs.map((o) => `${o.grade_name}: ${kg(o.qty_kg)} kg`).join(' • ') || '—'}</Text>,
            },
            {
              key: 'outturn',
              header: 'Out-turn %',
              exportValue: (b) => b.outturn_pct,
              render: (b) => (
                <Group gap={6} wrap="nowrap">
                  <Progress value={Math.min(num(b.outturn_pct), 100)} size="sm" w={70} color="coffee" />
                  <Text size="sm">{pct(b.outturn_pct)}</Text>
                </Group>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              exportValue: (b) => b.status,
              render: (b) => <Badge color={b.status === 'COMPLETED' ? 'teal' : 'blue'} variant="light">{b.status.replace('_', ' ')}</Badge>,
            },
            writable && {
              key: 'void',
              header: '',
              exportValue: false,
              render: (b) => (
                <VoidButton
                  path={`/drymill/batches/${b.id}/`}
                  label={`batch ${b.batch_no}`}
                  onDone={() => {
                    summary.reload();
                    batches.reload();
                  }}
                />
              ),
            },
          ]}
        />
      </Card>

      {modalOpen && (
        <BatchModal
          knownProducts={s?.options.process_products ?? []}
          onClose={() => setModalOpen(false)}
          onSaved={(batch) => {
            setModalOpen(false);
            toast.success(`${batch.batch_no}: ${kg(batch.green_output_kg)} kg green from ${kg(batch.parch_input_kg)} kg parchment (${pct(batch.outturn_pct, 2)}).`, 'Batch saved');
            summary.reload();
            batches.reload();
          }}
        />
      )}
    </Stack>
  );
}

function BatchModal({ knownProducts, onClose, onSaved }: { knownProducts: string[]; onClose: () => void; onSaved: (b: DryMillBatch) => void }) {
  const grades = useApi<ExportGrade[]>('/drymill/export-grades/');
  const [source, setSource] = useState<string | null>(null);
  const [product, setProduct] = useState('');
  const [processingDate, setProcessingDate] = useState(today());
  const [batchNo, setBatchNo] = useState('');
  const [inputKg, setInputKg] = useState<number | ''>('');
  const [outputs, setOutputs] = useState<Record<string, number | ''>>({});
  const submit = useSubmit();

  const totalOutput = useMemo(() => Object.values(outputs).reduce<number>((sum, v) => sum + num(v), 0), [outputs]);
  const liveOutturn = num(inputKg) > 0 ? calculateOutturnPct(totalOutput, num(inputKg)) : 0;

  async function save() {
    const origin = sourceFields(source);
    if (!origin) return submit.fail('Choose the source CWS or supplier.');
    if (!product.trim()) return submit.fail('Enter the process / product.');
    if (num(inputKg) <= 0) return submit.fail('Enter the parchment input.');
    const batch = await submit.run(() =>
      api<DryMillBatch>('/drymill/batches/', {
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
      }),
    );
    if (batch) onSaved(batch);
  }

  return (
    <Modal opened onClose={onClose} title="Record dry mill batch" size="lg">
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <SourceSelect label="Source CWS / supplier" value={source} onChange={setSource} required />
          <Autocomplete label="Process / product" required data={Array.from(new Set([...knownProducts, ...COMMON_PRODUCTS]))} value={product} onChange={setProduct} />
          <TextInput label="Processing date" type="date" value={processingDate} onChange={(e) => setProcessingDate(e.currentTarget.value)} />
          <TextInput label="Batch no." placeholder="Automatic if empty" value={batchNo} onChange={(e) => setBatchNo(e.currentTarget.value)} />
          <NumberInput label="Parchment input (kg)" required value={inputKg} onChange={(v) => setInputKg(v === '' ? '' : Number(v))} min={0} hideControls thousandSeparator="," />
        </SimpleGrid>

        <Card withBorder p="sm">
          <Text fw={600} mb="xs">Green coffee output by grade</Text>
          {grades.loading && !grades.data ? (
            <FormSkeleton fields={6} />
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
        <ErrorMessage>{submit.error}</ErrorMessage>
        <Button onClick={save} loading={submit.saving}>Save batch</Button>
      </Stack>
    </Modal>
  );
}
