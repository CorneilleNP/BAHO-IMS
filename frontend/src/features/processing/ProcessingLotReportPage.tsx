import { useState } from 'react';
import { Card, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconClipboardList, IconDroplet, IconPercentage, IconScale } from '@tabler/icons-react';
import { ChartCard } from '../../components/ChartCard';
import { DataTable } from '../../components/DataTable';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import { ErrorMessage } from '../../components/Feedback';
import { KpiCard } from '../../components/KpiCard';
import { PageHeader } from '../../components/PageHeader';
import { ANY_DATE, changeLabel, kgWhole, pct, type DateRange } from '../../lib/format';
import type { LotSummary } from '../../lib/types';
import { query, useApi } from '../../lib/useApi';

/**
 * Processing Lots dashboard: cherry input, estimated vs actual sorted kg,
 * out-turn %, and where it came from (station / process). Admin/HQ roles see
 * every station's lots; a CWS clerk sees their own (the server scopes it).
 */
export function ProcessingLotReportPage() {
  const [range, setRange] = useState<DateRange>(ANY_DATE);
  const summary = useApi<LotSummary>(`/reporting/cws/lots/${query({ date_from: range[0], date_to: range[1] })}`);
  const s = summary.data;
  const kpiLoading = summary.loading && !s;

  return (
    <Stack gap="lg">
      <PageHeader
        title="Processing Lots Report"
        description="Cherry sorted into grades across stations: estimated vs actual, and out-turn"
        actions={<DateRangeFilter value={range} onChange={setRange} label="Lot date" />}
      />

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

      <Card withBorder radius="md" p="md">
        <Text fw={600} mb="sm">By grade: estimated vs actual (kg)</Text>
        <DataTable
          rows={s?.by_grade ?? []}
          rowKey={(g) => g.code}
          loading={summary.loading}
          minWidth={480}
          empty={{ title: 'No grades configured' }}
          exportName="lots-by-grade"
          columns={[
            { key: 'grade', header: 'Grade', render: (g) => <Text fw={600} size="sm">{g.name}</Text>, exportValue: (g) => g.name },
            { key: 'est', header: 'Estimated (kg)', align: 'right', render: (g) => kgWhole(g.estimated_kg), exportValue: (g) => g.estimated_kg },
            { key: 'act', header: 'Actual (kg)', align: 'right', render: (g) => kgWhole(g.actual_kg), exportValue: (g) => g.actual_kg },
          ]}
        />
      </Card>

      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <ChartCard title="Cherry input by station (kg)" rows={s?.by_station ?? []} loading={kpiLoading} color="coffee.6" />
        <ChartCard title="Cherry input by process (kg)" rows={s?.by_process ?? []} loading={kpiLoading} color="green.6" />
      </SimpleGrid>
    </Stack>
  );
}
