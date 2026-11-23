import { useState } from 'react';
import { Badge, Button, Card, Group, Progress, Select, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconDroplet, IconFlask, IconScale, IconX } from '@tabler/icons-react';
import { ChartCard } from '../../components/ChartCard';
import { DataTable } from '../../components/DataTable';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import { ErrorMessage } from '../../components/Feedback';
import { KpiCard } from '../../components/KpiCard';
import { PageHeader } from '../../components/PageHeader';
import { StockBalanceCard } from '../../components/StockBalanceCard';
import { VoidButton } from '../../components/VoidButton';
import { canWrite } from '../../lib/access';
import { useAuth } from '../../lib/authContext';
import { fetchAllPages } from '../../lib/exportTable';
import { ANY_DATE, changeLabel, kg, num, pct, type DateRange } from '../../lib/format';
import type { CatalogSubProcess, DryMillBatch, ProcessingSummary } from '../../lib/types';
import { query, useApi, useList } from '../../lib/useApi';
import { BatchWizard } from './BatchWizard';


export function ParchProcessingPage() {
  const { user } = useAuth();
  const writable = canWrite(user, 'drymill');
  const [range, setRange] = useState<DateRange>(ANY_DATE);
  const [source, setSource] = useState<string | null>(null);
  const [process, setProcess] = useState<string | null>(null);
  const [subProcess, setSubProcess] = useState<string | null>(null);
  const [grade, setGrade] = useState<string | null>(null);
  const [product, setProduct] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);

  const filters = { source, process, sub_process: subProcess, grade, process_product: product };
  const summary = useApi<ProcessingSummary>(`/reporting/drymill/processing/${query({ date_from: range[0], date_to: range[1], ...filters })}`);
  const subProcesses = useApi<CatalogSubProcess[]>(process && process !== 'none' ? `/processing/catalog/sub-processes/?process=${process}` : null);
  const batchesQuery = `/drymill/batches/${query({ processing_date__gte: range[0], processing_date__lte: range[1], ...filters })}`;
  const batches = useList<DryMillBatch>(`${batchesQuery}${batchesQuery.includes('?') ? '&' : '?'}page=${page}&page_size=25`);
  const s = summary.data;
  const kpiLoading = summary.loading && !s;
  const delta = changeLabel(s?.change_vs_previous_day_pct);
  const anyFilter = Boolean(range[0] || range[1] || source || process || subProcess || grade || product);
  const clearFilters = () => {
    setRange(ANY_DATE);
    setSource(null);
    setProcess(null);
    setSubProcess(null);
    setGrade(null);
    setProduct(null);
    setPage(1);
  };

  return (
    <Stack gap="lg">
      <PageHeader
        title="Parchment Processing"
        description="Parchment → green coffee at the HQ dry mill, by batch and product"
        actions={writable && <Button leftSection={<IconFlask size={16} />} onClick={() => setModalOpen(true)}>Record dry mill batch</Button>}
      />

      <ErrorMessage>{summary.error}</ErrorMessage>

      <Card p="md">
        <Group gap="sm" align="flex-end" wrap="wrap">
          <DateRangeFilter value={range} onChange={(v) => { setRange(v); setPage(1); }} label="Processing dates" w={250} />
          <Select label="Source" placeholder="All" data={s?.options.sources ?? []} value={source} onChange={(v) => { setSource(v); setPage(1); }} searchable clearable w={170} />
          <Select
            label="Process"
            placeholder="All"
            data={[{ value: 'none', label: 'Not assigned yet' }, ...(s?.options.processes ?? []).map((p) => ({ value: p.id, label: p.name }))]}
            value={process}
            onChange={(v) => { setProcess(v); setSubProcess(null); setPage(1); }}
            clearable
            w={220}
          />
          <Select
            label="Sub-process"
            placeholder={process && process !== 'none' ? 'All' : 'Choose process'}
            data={(subProcesses.data ?? []).map((sp) => ({ value: sp.id, label: sp.name }))}
            value={subProcess}
            onChange={(v) => { setSubProcess(v); setPage(1); }}
            disabled={!process || process === 'none'}
            searchable
            clearable
            w={200}
          />
          <Select label="Grade" placeholder="All" data={s?.options.grades ?? []} value={grade} onChange={(v) => { setGrade(v); setPage(1); }} searchable clearable w={110} />
          <Select label="Product" placeholder="All" data={s?.options.process_products ?? []} value={product} onChange={(v) => { setProduct(v); setPage(1); }} searchable clearable w={190} />
          {anyFilter && (
            <Button variant="subtle" leftSection={<IconX size={14} />} onClick={clearFilters}>
              Clear
            </Button>
          )}
        </Group>
        <Text size="xs" c="dimmed" mt={6}>
          Process, sub-process, grade and source are those of the stock receipts each batch milled.
        </Text>
      </Card>

      <StockBalanceCard
        title="Parchment received vs stock balance"
        received={s?.stock.received_kg}
        milled={s?.stock.milled_kg}
        adjusted={s?.stock.adjusted_kg}
        balance={s?.stock.balance_kg}
        extra={{ label: 'Accepted, ready to mill (kg)', value: s?.stock.available_to_mill_kg }}
        loading={kpiLoading}
      />

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

      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <ChartCard title="Parchment milled by process" rows={s?.by_process ?? []} loading={kpiLoading} labelWidth={170} />
        <ChartCard title="Parchment milled by origin (Baho / partner)" rows={s?.by_source ?? []} loading={kpiLoading} color="coffee.7" labelWidth={130} />
      </SimpleGrid>

      <Card p="md">
        <Text fw={600} mb="sm">Recent dry mill batches</Text>
        <DataTable
          rows={batches.items}
          rowKey={(b) => b.id}
          loading={batches.loading}
          error={batches.error}
          minWidth={1200}
          pagination={{ page, pageSize: 25, total: batches.total, onChange: setPage }}
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
              header: 'Parchment milled (receipt · process / sub-process · grade)',
              exportValue: (b) =>
                b.inputs
                  .map((i) => `${i.receipt_number} ${i.process_name || 'not assigned'}${i.sub_process_name ? ` / ${i.sub_process_name}` : ''} ${i.grade}: ${i.qty_kg}`)
                  .join('; '),
              render: (b) => (
                <Stack gap={2}>
                  {b.inputs.map((i) => (
                    <Text key={i.receipt} size="xs">
                      <Text span ff="monospace" size="xs">{i.receipt_number}</Text> · {i.process_name || 'not assigned'}
                      {i.sub_process_name && ` / ${i.sub_process_name}`} · {i.grade || '—'} · <strong>{kg(i.qty_kg)} kg</strong>
                    </Text>
                  ))}
                </Stack>
              ),
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

