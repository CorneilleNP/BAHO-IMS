import { useMemo, useState } from 'react';
import { Badge, Button, Card, Group, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { IconAlertTriangle, IconBuildingWarehouse, IconCheck, IconDroplet, IconPackage, IconScale, IconSearch, IconTrendingDown, IconTrendingUp, IconWeight, IconX } from '@tabler/icons-react';
import { ChartCard } from '../../components/ChartCard';
import { DataTable, type Column } from '../../components/DataTable';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import { ErrorMessage } from '../../components/Feedback';
import { KpiCard } from '../../components/KpiCard';
import { PageHeader } from '../../components/PageHeader';
import { StockBalanceCard } from '../../components/StockBalanceCard';
import { api } from '../../lib/api';
import { canWrite } from '../../lib/access';
import { useAuth } from '../../lib/authContext';
import { confirmAction } from '../../lib/confirm';
import { fetchAllPages } from '../../lib/exportTable';
import { ANY_DATE, changeLabel, kg, kgWhole, type DateRange } from '../../lib/format';
import { processingColor, processingLabel, qualityColor, qualityLabel } from '../../lib/stockLabels';
import { toast } from '../../lib/toast';
import type { CatalogSubProcess, CoffeeSource, HqStockReceipt, StockSummary, StockTotals, TransferSummary } from '../../lib/types';
import { errorText, query, useApi, useList } from '../../lib/useApi';
import { StockReceiptDrawer } from './StockReceiptDrawer';
import { StockReceiptWizard } from './StockReceiptWizard';

const PAGE_SIZE = 25;
const UNASSIGNED = 'none';

interface Filters {
  range: DateRange;
  source: string | null;
  process: string | null;
  sub_process: string | null;
  grade: string | null;
  quality_status: string | null;
  processing_status: string | null;
  search: string;
}

const NO_FILTERS: Filters = {
  range: ANY_DATE,
  source: null,
  process: null,
  sub_process: null,
  grade: null,
  quality_status: null,
  processing_status: null,
  search: '',
};

export function StockUpdatePage() {
  const { user } = useAuth();
  const writable = canWrite(user, 'drymill');
  const [day, setDay] = useState('');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [wizard, setWizard] = useState<{ receipt: HqStockReceipt | null } | null>(null);
  const [drawerVersion, setDrawerVersion] = useState(0);

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value, ...(key === 'process' ? { sub_process: null } : {}) }));
    setPage(1);
    setSelected(new Set());
  };

  const summary = useApi<StockSummary>(
    `/reporting/drymill/stock/${query({
      date: day,
      process: filters.process,
      sub_process: filters.sub_process,
      grade: filters.grade,
      date_from: filters.range[0],
      date_to: filters.range[1],
    })}`,
  );
  const transferSummary = useApi<TransferSummary>(
    `/reporting/transfers/${query({ date_from: filters.range[0], date_to: filters.range[1] })}`,
  );
  const sources = useApi<CoffeeSource[]>('/drymill/sources/');
  const subProcesses = useApi<CatalogSubProcess[]>(
    filters.process && filters.process !== UNASSIGNED ? `/processing/catalog/sub-processes/?process=${filters.process}` : null,
  );

  const listQuery = `/drymill/stock-receipts/${query({
    arrival_date__gte: filters.range[0],
    arrival_date__lte: filters.range[1],
    source: filters.source,
    process: filters.process !== UNASSIGNED ? filters.process : null,
    process_unassigned: filters.process === UNASSIGNED ? 'true' : null,
    sub_process: filters.sub_process,
    grade: filters.grade,
    quality_status: filters.quality_status,
    processing_status: filters.processing_status,
    search: filters.search.trim(),
    ordering: '-arrival_date',
  })}`;
  const sep = listQuery.includes('?') ? '&' : '?';
  const receipts = useList<HqStockReceipt>(`${listQuery}${sep}page=${page}&page_size=${PAGE_SIZE}`);
  const totals = useApi<StockTotals>(listQuery.replace('/drymill/stock-receipts/', '/drymill/stock-receipts/totals/'));

  const s = summary.data;
  const kpiLoading = summary.loading && !s;
  const delta = changeLabel(s?.change_vs_previous_pct);
  const reloadAll = () => {
    summary.reload();
    transferSummary.reload();
    receipts.reload();
    totals.reload();
  };

  async function bulkQuality(status: 'ACCEPTED' | 'REJECTED') {
    const ids = [...selected];
    const comment = await confirmAction({
      title: `${status === 'ACCEPTED' ? 'Accept' : 'Reject'} ${ids.length} receipt${ids.length === 1 ? '' : 's'}?`,
      message: status === 'ACCEPTED' ? 'Accepted coffee becomes available for dry mill batches.' : 'Rejected coffee cannot be milled.',
      confirmLabel: status === 'ACCEPTED' ? 'Accept' : 'Reject',
      danger: status === 'REJECTED',
      requireReason: status === 'REJECTED',
    });
    if (comment === null) return;
    try {
      const result = await api<{ updated: number }>('/drymill/stock-receipts/quality/', { method: 'POST', body: { ids, quality_status: status, comment } });
      toast.success(`${result.updated} receipt${result.updated === 1 ? '' : 's'} ${status.toLowerCase()}.`, 'Quality updated');
      setSelected(new Set());
      reloadAll();
    } catch (err) {
      toast.error(errorText(err), 'Could not update quality');
    }
  }

  const sourceOptions = useMemo(
    () => (sources.data ?? []).map((src) => ({ value: src.origin_type === 'OWN_CWS' ? src.code : src.name, label: src.name })),
    [sources.data],
  );
  const t = totals.data;

  const columns: Array<Column<HqStockReceipt>> = [
    { key: 'no', header: 'Receipt', mono: true, render: (r) => r.receipt_number },
    { key: 'date', header: 'Arrival', nowrap: true, render: (r) => r.arrival_date },
    { key: 'source', header: 'Source', render: (r) => r.source_name },
    { key: 'origin', header: 'Origin', optional: true, render: (r) => (r.origin_type === 'OWN_CWS' ? 'Baho' : 'Partner') },
    { key: 'type', header: 'Type', optional: true, render: (r) => (r.item_type === 'PARCH' ? 'Parch' : 'Green') },
    {
      key: 'process',
      header: 'Process',
      exportValue: (r) => r.process_name || 'Not assigned yet',
      render: (r) => r.process_name || <Badge color="orange" variant="light" leftSection={<IconAlertTriangle size={10} />}>Not assigned</Badge>,
    },
    { key: 'sub', header: 'Sub-process', render: (r) => r.sub_process_name || '—', exportValue: (r) => r.sub_process_name },
    { key: 'grade', header: 'Grade', render: (r) => r.grade || '—', exportValue: (r) => r.grade },
    { key: 'lot', header: 'Lot ID', optional: true, render: (r) => r.lot_reference || '—', exportValue: (r) => r.lot_reference },
    { key: 'dn', header: 'Delivery note no.', optional: true, render: (r) => r.delivery_note_no || '—', exportValue: (r) => r.delivery_note_no },
    { key: 'dnq', header: 'Delivery note (kg)', optional: true, align: 'right', render: (r) => (r.delivery_note_qty_kg ? kg(r.delivery_note_qty_kg) : '—'), exportValue: (r) => r.delivery_note_qty_kg },
    { key: 'net', header: 'Net (kg)', align: 'right', render: (r) => kg(r.net_weight_kg), exportValue: (r) => r.net_weight_kg, footer: t && kg(t.net_weight_kg) },
    { key: 'bags', header: 'Bags (kg)', optional: true, align: 'right', render: (r) => kg(r.weight_of_bags_kg, 2), exportValue: (r) => r.weight_of_bags_kg, footer: t && kg(t.weight_of_bags_kg, 2) },
    { key: 'pure', header: 'Pure (kg)', align: 'right', render: (r) => kg(r.pure_weight_kg), exportValue: (r) => r.pure_weight_kg, footer: t && kg(t.pure_weight_kg) },
    { key: 'processed', header: 'Processed (kg)', align: 'right', render: (r) => kg(r.processed_kg), exportValue: (r) => r.processed_kg, footer: t && kg(t.processed_kg) },
    {
      key: 'balance',
      header: 'Balance (kg)',
      align: 'right',
      render: (r) => <Text size="sm" fw={600}>{kg(r.stock_balance_kg)}</Text>,
      exportValue: (r) => r.stock_balance_kg,
      footer: t && kg(t.stock_balance_kg),
    },
    {
      key: 'quality',
      header: 'Quality',
      nowrap: true,
      exportValue: (r) => qualityLabel[r.quality_status],
      render: (r) => <Badge color={qualityColor[r.quality_status]} variant="light">{qualityLabel[r.quality_status]}</Badge>,
    },
    {
      key: 'processing',
      header: 'Processing',
      nowrap: true,
      exportValue: (r) => processingLabel[r.processing_status],
      render: (r) => <Badge color={processingColor[r.processing_status]} variant="light">{processingLabel[r.processing_status]}</Badge>,
    },
    { key: 'pdate', header: 'Processing date', optional: true, render: (r) => r.processing_date ?? '—', exportValue: (r) => r.processing_date },
    { key: 'contract', header: 'Purchase contract', optional: true, render: (r) => r.purchase_contract_number || '—', exportValue: (r) => r.purchase_contract_number },
    { key: 'wrn', header: 'WRN', optional: true, render: (r) => r.wrn_number || '—', exportValue: (r) => r.wrn_number },
    { key: 'cell', header: 'Warehouse cell', optional: true, render: (r) => r.warehouse_cell || '—', exportValue: (r) => r.warehouse_cell },
    { key: 'card', header: 'Stock card', optional: true, render: (r) => r.stock_card_number || '—', exportValue: (r) => r.stock_card_number },
  ];

  return (
    <Stack gap="lg">
      <PageHeader
        title="Baho Dry Mill Stock Update"
        description="Parchment & green coffee received at HQ, and how much of each receipt is still in stock"
        actions={writable && <Button leftSection={<IconPackage size={16} />} onClick={() => setWizard({ receipt: null })}>Log new stock receipt</Button>}
      />
      <ErrorMessage>{summary.error}</ErrorMessage>

      {/* Same three figures as the Power BI "Baho Dry Mill Stock Update" page, for the current filters. */}
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <KpiCard label="Net weight (kg)" value={kgWhole(s?.season.net_weight_kg)} icon={IconScale} loading={kpiLoading} />
        <KpiCard label="Pure weight (kg)" value={kgWhole(s?.season.pure_weight_kg)} icon={IconBuildingWarehouse} loading={kpiLoading} />
        <KpiCard label="Weight of bags (kg)" value={kgWhole(s?.season.weight_of_bags_kg)} icon={IconPackage} loading={kpiLoading} />
      </SimpleGrid>
      <StockBalanceCard
        received={s?.season.pure_weight_kg}
        milled={s?.season.processed_kg}
        adjusted={s?.season.adjusted_kg}
        balance={s?.season.stock_balance_kg}
        loading={kpiLoading}
      />
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <KpiCard label={`Received on ${s?.date ?? ''} (kg net)`} value={kgWhole(s?.day.net_weight_kg)} icon={IconScale} delta={delta} accent="gray" loading={kpiLoading} />
        <KpiCard label={`Waiting for quality (${s?.awaiting_quality.receipts ?? 0})`} value={`${kgWhole(s?.awaiting_quality.net_weight_kg)} kg`} icon={IconAlertTriangle} accent="yellow" loading={kpiLoading} />
      </SimpleGrid>

      {/* Blind double-entry reconciliation against each CWS's own delivery notes. */}
      <Text fw={600} mt="xs">CWS transfers: confirmed vs the station's own numbers</Text>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }}>
        <KpiCard label="Gross weight (kg)" value={kgWhole(transferSummary.data?.gross_weight_kg)} icon={IconScale} loading={transferSummary.loading && !transferSummary.data} />
        <KpiCard label="Weight of bags (kg)" value={kgWhole(transferSummary.data?.weight_of_bags_kg)} icon={IconWeight} loading={transferSummary.loading && !transferSummary.data} accent="gray" />
        <KpiCard label="Net weight (kg)" value={kgWhole(transferSummary.data?.net_weight_kg)} icon={IconDroplet} loading={transferSummary.loading && !transferSummary.data} accent="green" />
        <KpiCard label="Stock loss (kg)" value={kgWhole(transferSummary.data?.stock_loss_kg)} icon={IconTrendingDown} loading={transferSummary.loading && !transferSummary.data} accent="red" />
        <KpiCard label="Stock gain (kg)" value={kgWhole(transferSummary.data?.stock_gain_kg)} icon={IconTrendingUp} loading={transferSummary.loading && !transferSummary.data} accent="green" />
      </SimpleGrid>
      {(transferSummary.data?.rows.length ?? 0) > 0 && (
        <Card withBorder radius="md" p="md">
          <DataTable
            rows={transferSummary.data!.rows}
            rowKey={(r) => `${r.delivery_note_no}-${r.grade}`}
            minWidth={900}
            columns={[
              { key: 'note', header: 'Delivery note', mono: true, render: (r) => r.delivery_note_no },
              { key: 'station', header: 'Station', render: (r) => r.facility_name },
              { key: 'grade', header: 'Process / grade', render: (r) => `${r.process_name}${r.sub_process_name ? ` / ${r.sub_process_name}` : ''} · ${r.grade}` },
              { key: 'cws', header: "Station's net (kg)", align: 'right', render: (r) => kg(r.cws_net_kg), exportValue: (r) => r.cws_net_kg },
              { key: 'dm', header: 'Our net (kg)', align: 'right', render: (r) => kg(r.dry_mill_net_kg), exportValue: (r) => r.dry_mill_net_kg },
              {
                key: 'variance',
                header: 'Variance',
                exportValue: (r) => r.variance_status,
                render: (r) =>
                  r.variance_status === 'MATCH' ? (
                    '—'
                  ) : (
                    <Badge color={r.variance_status === 'STOCK_LOSS' ? 'red' : 'green'} variant="light">
                      {r.variance_status === 'STOCK_LOSS' ? 'Stock loss' : 'Stock gain'} · {kg(Math.abs(Number(r.variance_kg)), 2)} kg
                    </Badge>
                  ),
              },
              { key: 'comment', header: 'Comment', render: (r) => r.comment || '—' },
            ]}
            exportName="cws-transfer-variance"
          />
        </Card>
      )}

      <Card withBorder radius="md" p="md">
        <Group gap="sm" align="flex-end" wrap="wrap">
          <DateRangeFilter value={filters.range} onChange={(v) => setFilter('range', v)} label="Arrival dates" w={250} />
          <Select label="Source" placeholder="All" data={sourceOptions} value={filters.source} onChange={(v) => setFilter('source', v)} searchable clearable w={180} />
          <Select
            label="Process"
            placeholder="All"
            data={[{ value: UNASSIGNED, label: '⚠ Not assigned yet' }, ...(s?.options.processes ?? []).map((p) => ({ value: p.id, label: p.name }))]}
            value={filters.process}
            onChange={(v) => setFilter('process', v)}
            clearable
            w={220}
          />
          <Select
            label="Sub-process"
            placeholder={filters.process && filters.process !== UNASSIGNED ? 'All' : 'Choose process'}
            data={(subProcesses.data ?? []).map((sp) => ({ value: sp.id, label: sp.name }))}
            value={filters.sub_process}
            onChange={(v) => setFilter('sub_process', v)}
            disabled={!filters.process || filters.process === UNASSIGNED}
            searchable
            clearable
            w={200}
          />
          <Select label="Grade" placeholder="All" data={s?.options.grades ?? []} value={filters.grade} onChange={(v) => setFilter('grade', v)} clearable searchable w={110} />
          <Select
            label="Quality"
            placeholder="All"
            data={Object.entries(qualityLabel).map(([value, label]) => ({ value, label }))}
            value={filters.quality_status}
            onChange={(v) => setFilter('quality_status', v)}
            clearable
            w={130}
          />
          <Select
            label="Processing"
            placeholder="All"
            data={Object.entries(processingLabel).map(([value, label]) => ({ value, label }))}
            value={filters.processing_status}
            onChange={(v) => setFilter('processing_status', v)}
            clearable
            w={170}
          />
          <TextInput
            label="Search"
            placeholder="Receipt, lot, DN, WRN…"
            leftSection={<IconSearch size={14} />}
            value={filters.search}
            onChange={(e) => setFilter('search', e.currentTarget.value)}
            w={200}
          />
          <TextInput label="KPI day" type="date" value={day || s?.date || ''} onChange={(e) => setDay(e.currentTarget.value)} w={150} />
          {JSON.stringify(filters) !== JSON.stringify(NO_FILTERS) && (
            <Button variant="subtle" leftSection={<IconX size={14} />} onClick={() => { setFilters(NO_FILTERS); setPage(1); }}>Clear</Button>
          )}
        </Group>
      </Card>

      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <ChartCard title="Net weight by process" rows={s?.by_process ?? []} loading={kpiLoading} labelWidth={170} />
        <ChartCard title="Net weight by sub-process (top 12)" rows={s?.by_sub_process ?? []} loading={kpiLoading} color="coffee.5" labelWidth={170} />
        <ChartCard title="Net weight by source (CWS / supplier)" rows={s?.by_source ?? []} loading={kpiLoading} color="coffee.7" />
        <ChartCard title="In stock now, by grade" rows={s?.balance_by_grade ?? []} loading={kpiLoading} color="teal.6" />
      </SimpleGrid>

      <Card withBorder radius="md" p="md">
        <Group justify="space-between" mb="xs">
          <Text fw={600}>Stock receipts</Text>
          <Text size="sm" c="dimmed">{t ? `${t.receipts.toLocaleString()} receipts match` : ''}</Text>
        </Group>
        <DataTable
          rows={receipts.items}
          rowKey={(r) => r.id}
          loading={receipts.loading}
          error={receipts.error}
          minWidth={1350}
          columns={columns}
          columnsKey="stock-receipts"
          onRowClick={(r) => setOpenId(r.id)}
          selection={writable ? { selected, onChange: setSelected } : undefined}
          pagination={{ page, pageSize: PAGE_SIZE, total: receipts.total, onChange: setPage }}
          empty={{ title: 'No stock receipts match', hint: 'Change the filters, or use “Log new stock receipt”.' }}
          exportName="hq-stock-receipts"
          fetchAll={() => fetchAllPages<HqStockReceipt>(listQuery)}
          toolbar={
            selected.size > 0 && (
              <>
                <Text size="sm" fw={600}>{selected.size} selected</Text>
                <Button size="compact-sm" color="green" variant="light" leftSection={<IconCheck size={14} />} onClick={() => bulkQuality('ACCEPTED')}>Accept quality</Button>
                <Button size="compact-sm" color="red" variant="light" leftSection={<IconX size={14} />} onClick={() => bulkQuality('REJECTED')}>Reject</Button>
                <Button size="compact-sm" variant="subtle" onClick={() => setSelected(new Set())}>Clear</Button>
              </>
            )
          }
        />
      </Card>

      <StockReceiptDrawer
        key={drawerVersion}
        receiptId={openId}
        writable={writable}
        onClose={() => setOpenId(null)}
        onEdit={(receipt) => setWizard({ receipt })}
        onChanged={reloadAll}
      />

      {wizard && (
        <StockReceiptWizard
          key={wizard.receipt?.id ?? 'new'}
          opened
          receipt={wizard.receipt}
          knownGrades={s?.options.grades ?? []}
          canAddSubProcess={writable}
          onClose={() => setWizard(null)}
          onSaved={() => {
            setWizard(null);
            setDrawerVersion((v) => v + 1);
            reloadAll();
          }}
        />
      )}
    </Stack>
  );
}
