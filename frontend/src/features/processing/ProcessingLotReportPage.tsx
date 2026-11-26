import { useState } from 'react';
import { Card, Group, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconClipboardList, IconDroplet, IconPercentage, IconScale, IconSearch } from '@tabler/icons-react';
import { ChartCard } from '../../components/ChartCard';
import { DataTable } from '../../components/DataTable';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import { ErrorMessage } from '../../components/Feedback';
import { KpiCard } from '../../components/KpiCard';
import { PageHeader } from '../../components/PageHeader';
import { ProcessPicker } from '../../components/ProcessPicker';
import { ANY_DATE, changeLabel, kgWhole, num, pct, type DateRange } from '../../lib/format';
import { useMyStations } from '../../lib/stations';
import type { Decimal, LotSummary } from '../../lib/types';
import { fetchAllPages } from '../../lib/exportTable';
import type { ProcessingLot } from '../../lib/types';
import { query, useApi, useList } from '../../lib/useApi';
import { LotDetailDrawer } from './LotDetailDrawer';
import { StatusBadge } from './ProcessingLotForm';
import { VarianceKg, VariancePct, type LotWithVariance, type Variance } from './variance';

const LOTS_PAGE_SIZE = 25;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Estimate vs actual compares only grade results with an actual recorded (`compared_estimated_kg`). */
type GradeVariance = Variance & { compared_estimated_kg: Decimal };
type LotReport = Omit<LotSummary, 'by_grade'> &
  GradeVariance & {
    by_grade: Array<LotSummary['by_grade'][number] & GradeVariance>;
  };

/**
 * Processing Lots dashboard: cherry input, estimated vs actual sorted kg,
 * out-turn %, and where it came from (station / process). Admin/HQ roles see
 * every station's lots; a CWS clerk sees their own (the server scopes it).
 */
export function ProcessingLotReportPage() {
  const [range, setRange] = useState<DateRange>(ANY_DATE);
  // A clerk's list only holds their own stations; the server scopes the figures either way.
  const stations = useMyStations();
  const [station, setStation] = useState<string | null>(null);
  const [process, setProcess] = useState<{ process: string | null; subProcess: string | null }>({ process: null, subProcess: null });
  // Lot number (any part, any case) or the lot's id; narrows every figure and the lots table.
  const [lotSearch, setLotSearch] = useState('');
  const [lot] = useDebouncedValue(lotSearch.trim(), 350);
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const summary = useApi<LotReport>(
    `/reporting/cws/lots/${query({
      date_from: range[0],
      date_to: range[1],
      station,
      process: process.process,
      sub_process: process.subProcess,
      lot,
    })}`,
  );
  const lotsQuery = `/processing/lots/${query({
    facility: station,
    process_type__process: process.process,
    process_type__sub_process_ref: process.subProcess,
    lot_date__gte: range[0],
    lot_date__lte: range[1],
    ...(UUID_RE.test(lot) ? { id: lot } : { search: lot }),
    ordering: '-lot_date',
  })}`;
  const lotList = useList<ProcessingLot>(`${lotsQuery}${lotsQuery.includes('?') ? '&' : '?'}page=${page}&page_size=${LOTS_PAGE_SIZE}`);
  const detail = useApi<LotWithVariance>(detailId ? `/processing/lots/${detailId}/` : null);
  const s = summary.data;
  const kpiLoading = summary.loading && !s;

  return (
    <Stack gap="lg">
      <PageHeader
        title="Processing Lots Report"
        description="Cherry sorted into grades across stations: estimated vs actual, and out-turn"
      />

      <Card p="md">
        <Group align="flex-end" gap="sm" wrap="wrap">
          <Select
            label="CWS station"
            placeholder={stations.loading ? 'Loading…' : stations.options.length > 1 ? 'All stations' : 'My station'}
            data={stations.options}
            value={station}
            onChange={(v) => { setStation(v); setPage(1); }}
            clearable
            searchable
            w={220}
          />
          <TextInput
            label="Lot ID / number"
            placeholder="e.g. GTK-FW-014"
            leftSection={<IconSearch size={16} />}
            value={lotSearch}
            onChange={(e) => { setLotSearch(e.currentTarget.value); setPage(1); }}
            w={220}
          />
          <ProcessPicker process={process.process} subProcess={process.subProcess} onChange={(v) => { setProcess(v); setPage(1); }} required={false} />
          <DateRangeFilter value={range} onChange={(v) => { setRange(v); setPage(1); }} label="Lot date" />
        </Group>
      </Card>

      <ErrorMessage>{summary.error}</ErrorMessage>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        <KpiCard label="Lots" value={String(s?.lots ?? 0)} icon={IconClipboardList} loading={kpiLoading} />
        <KpiCard label="Cherry input (kg)" value={kgWhole(s?.cherry_input_kg)} icon={IconDroplet} loading={kpiLoading} />
        <KpiCard label="Actual sorted (kg)" value={kgWhole(s?.actual_kg)} icon={IconScale} accent="green" loading={kpiLoading} delta={changeLabel(s?.change_vs_previous_day_pct)} />
        <KpiCard label="Out-turn %" value={s ? pct(s.outturn_pct, 2) : '—'} icon={IconPercentage} accent="gray" loading={kpiLoading} />
      </SimpleGrid>

      <Text size="xs" c="dimmed" mt={-8}>
        {s?.open_lots ? `${s.open_lots} lot${s.open_lots === 1 ? '' : 's'} still awaiting actuals.` : 'Every lot in range has actuals recorded.'}
        {' '}"vs last day" compares the last lot date with actuals to the day before it.
      </Text>

      <Card p="md">
        <Text fw={600}>By grade: estimated vs actual (kg)</Text>
        <Text size="xs" c="dimmed" mb="sm">
          Variance = actual − estimate of the same lots' grades that have an actual recorded (lots still awaiting actuals don't count as a loss). Green is a gain, red a loss.
        </Text>
        <DataTable
          rows={s?.by_grade ?? []}
          rowKey={(g) => g.code}
          loading={summary.loading}
          minWidth={720}
          empty={{ title: 'No grades configured' }}
          exportName="lots-by-grade"
          columns={[
            { key: 'grade', header: 'Grade', render: (g) => <Text fw={600} size="sm">{g.name}</Text>, exportValue: (g) => g.name, footer: 'Total' },
            { key: 'est', header: 'Estimated (kg)', align: 'right', render: (g) => kgWhole(g.estimated_kg), exportValue: (g) => g.estimated_kg, footer: s ? kgWhole(s.estimated_kg) : undefined },
            { key: 'act', header: 'Actual (kg)', align: 'right', render: (g) => kgWhole(g.actual_kg), exportValue: (g) => g.actual_kg, footer: s ? kgWhole(s.actual_kg) : undefined },
            {
              key: 'cmp',
              header: 'Estimate with actuals (kg)',
              align: 'right',
              render: (g) => kgWhole(g.compared_estimated_kg),
              exportValue: (g) => g.compared_estimated_kg,
              footer: s ? kgWhole(s.compared_estimated_kg) : undefined,
            },
            {
              key: 'var',
              header: 'Variance (kg)',
              align: 'right',
              render: (g) => <VarianceKg value={num(g.compared_estimated_kg) === 0 && num(g.actual_kg) === 0 ? null : g.variance_kg} />,
              exportValue: (g) => g.variance_kg,
              footer: s ? <VarianceKg value={s.variance_kg} fw={700} /> : undefined,
            },
            {
              key: 'varpct',
              header: 'Variance %',
              align: 'right',
              render: (g) => <VariancePct value={g.variance_pct} />,
              exportValue: (g) => g.variance_pct,
              footer: s ? <VariancePct value={s.variance_pct} fw={700} /> : undefined,
            },
          ]}
        />
      </Card>

      <Card p="md">
        <Text fw={600}>Lots</Text>
        <Text size="xs" c="dimmed" mb="sm">
          The lots behind the figures above (same filters). Click a lot to see its estimate vs actual by grade.
        </Text>
        <DataTable
          rows={lotList.items}
          rowKey={(l) => l.id}
          loading={lotList.loading}
          error={lotList.error}
          minWidth={960}
          onRowClick={(l) => setDetailId(l.id)}
          pagination={{ page, pageSize: LOTS_PAGE_SIZE, total: lotList.total, onChange: setPage }}
          empty={{ title: lot ? `No lot matches “${lot}”` : 'No lots', hint: lot ? 'Check the lot number or clear the other filters.' : undefined }}
          exportName="processing-lots"
          fetchAll={() => fetchAllPages<ProcessingLot>(lotsQuery)}
          columns={[
            { key: 'lot', header: 'Lot', mono: true, mobile: 'title', render: (l) => l.lot_number },
            { key: 'date', header: 'Date', nowrap: true, render: (l) => l.lot_date },
            { key: 'station', header: 'Station', render: (l) => l.facility_name },
            { key: 'process', header: 'Process', mobile: 'subtitle', render: (l) => l.process_label },
            { key: 'cherry', header: 'Cherry (kg)', align: 'right', render: (l) => kgWhole(l.cherry_input_kg), exportValue: (l) => l.cherry_input_kg },
            { key: 'est', header: 'Estimated (kg)', align: 'right', render: (l) => kgWhole(l.total_estimated_kg), exportValue: (l) => l.total_estimated_kg },
            { key: 'act', header: 'Actual (kg)', align: 'right', render: (l) => (l.total_actual_kg === null ? '—' : kgWhole(l.total_actual_kg)), exportValue: (l) => l.total_actual_kg },
            { key: 'out', header: 'Out-turn %', align: 'right', render: (l) => (l.total_outturn_pct === null ? '—' : pct(l.total_outturn_pct, 2)), exportValue: (l) => l.total_outturn_pct },
            { key: 'status', header: 'Status', nowrap: true, render: (l) => <StatusBadge status={l.status} />, exportValue: (l) => l.status },
          ]}
        />
      </Card>

      <LotDetailDrawer
        lotId={detailId}
        detail={detail}
        statusBadge={(l) => <StatusBadge status={l.status} />}
        onClose={() => setDetailId(null)}
      />

      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <ChartCard title="Cherry input by station (kg)" rows={s?.by_station ?? []} loading={kpiLoading} color="coffee.6" />
        <ChartCard title="Cherry input by process (kg)" rows={s?.by_process ?? []} loading={kpiLoading} color="green.6" />
      </SimpleGrid>

      <Card p="md">
        <Text fw={600}>Sorted at the station vs delivered to dry mill</Text>
        <Text size="xs" c="dimmed" mb="sm">
          What each station has sorted into parchment (all-time, not limited by the date filter above, but limited to the chosen station / process / sub-process) minus what it has already sent to HQ dry mill as stock receipts - the balance is still sitting at the station.
        </Text>
        <DataTable
          rows={s?.cws_stock ?? []}
          rowKey={(r) => `${r.facility_name}-${r.process_name}-${r.sub_process_name}-${r.grade}`}
          loading={summary.loading}
          minWidth={760}
          empty={{ title: 'Nothing sorted yet', hint: 'Record actuals on a lot to see it here.' }}
          exportName="cws-stock-vs-delivered"
          columns={[
            { key: 'station', header: 'Station', render: (r) => <Text fw={600} size="sm">{r.facility_name}</Text> },
            { key: 'process', header: 'Process / sub-process', render: (r) => (r.sub_process_name ? `${r.process_name} / ${r.sub_process_name}` : r.process_name) },
            { key: 'grade', header: 'Grade', render: (r) => r.grade },
            { key: 'processed', header: 'Processed (kg)', align: 'right', render: (r) => kgWhole(r.processed_kg), exportValue: (r) => r.processed_kg },
            { key: 'delivered', header: 'Delivered to dry mill (kg)', align: 'right', render: (r) => kgWhole(r.delivered_kg), exportValue: (r) => r.delivered_kg },
            {
              key: 'balance',
              header: 'Still at station (kg)',
              align: 'right',
              exportValue: (r) => r.balance_kg,
              render: (r) => <Text size="sm" c={num(r.balance_kg) < 0 ? 'red' : undefined}>{kgWhole(r.balance_kg)}</Text>,
            },
          ]}
        />
      </Card>
    </Stack>
  );
}
