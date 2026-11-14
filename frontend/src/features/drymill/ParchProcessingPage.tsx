import { useState } from 'react';
import { Badge, Button, Card, Group, NativeSelect, Progress, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconDroplet, IconFlask, IconScale } from '@tabler/icons-react';
import { ChartCard } from '../../components/ChartCard';
import { DataTable } from '../../components/DataTable';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import { ErrorMessage } from '../../components/Feedback';
import { KpiCard } from '../../components/KpiCard';
import { PageHeader } from '../../components/PageHeader';
import { VoidButton } from '../../components/VoidButton';
import { canWrite } from '../../lib/access';
import { useAuth } from '../../lib/authContext';
import { fetchAllPages } from '../../lib/exportTable';
import { ANY_DATE, changeLabel, kg, num, pct, type DateRange } from '../../lib/format';
import type { DryMillBatch, ProcessingSummary } from '../../lib/types';
import { query, useApi, useList } from '../../lib/useApi';
import { BatchWizard } from './BatchWizard';


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
            {
              key: 'from',
              header: 'Parchment from',
              exportValue: (b) => b.inputs.map((i) => `${i.receipt_number} (${i.source_name}): ${i.qty_kg}`).join('; '),
              render: (b) => <Text size="xs">{b.inputs.map((i) => `${i.receipt_number} · ${kg(i.qty_kg)} kg`).join(' • ') || '—'}</Text>,
            },
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
        <BatchWizard
          knownProducts={s?.options.process_products ?? []}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            summary.reload();
            batches.reload();
          }}
        />
      )}
    </Stack>
  );
}

