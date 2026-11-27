import { useState } from 'react';
import { BarChart, LineChart } from '@mantine/charts';
import { Badge, Card, Group, SegmentedControl, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconArrowDownRight, IconBuildingBank, IconCoffee, IconReceipt, IconScale, IconUsers, IconWallet, IconHourglass } from '@tabler/icons-react';
import { DataTable } from '../../components/DataTable';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import { EmptyState, ErrorMessage } from '../../components/Feedback';
import { KpiCard } from '../../components/KpiCard';
import { PageHeader } from '../../components/PageHeader';
import { ChartSkeleton } from '../../components/Skeletons';
import { ANY_DATE, num, type DateRange } from '../../lib/format';
import { query, useApi } from '../../lib/useApi';
import { Balance, StationFilter } from './financeShared';
import { KIND_LABEL, money, moneyRwf } from './financeUtils';
import type { FinanceGroup, FinanceSummary, LedgerEntry, StationFinance } from './types';

const GROUPS: Array<{ value: FinanceGroup; label: string }> = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
];

function periodLabel(period: string, group: FinanceGroup): string {
  const d = new Date(`${period}T00:00:00`);
  if (group === 'month') return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  if (group === 'week') return `Week of ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * Finance dashboard: funds HQ gave the stations vs what they spent (expenses,
 * payments to farmers, casual labor), the balance (negative when overspent),
 * and where the money went - by category, by station and over time.
 */
export function FinanceDashboardPage() {
  const [station, setStation] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange>(ANY_DATE);
  const [group, setGroup] = useState<FinanceGroup>('month');
  const summary = useApi<FinanceSummary>(
    `/finance/summary/${query({ station, date_from: range[0], date_to: range[1], group })}`,
  );
  const s = summary.data;
  const loading = summary.loading && !s;
  const timeline = (s?.timeline ?? []).map((p) => ({
    label: periodLabel(p.period, s?.group ?? group),
    'Funds given': num(p.allocated),
    Expenses: num(p.expenses),
    'Cherry paid': num(p.cherry),
    'Casual labor': num(p.labor),
    Balance: num(p.balance),
  }));
  const categories = (s?.by_category ?? []).map((c) => ({ label: c.label, Amount: num(c.amount) }));

  return (
    <Stack gap="lg">
      <PageHeader
        eyebrow="Finance"
        title="Finance dashboard"
        description="Funds given to each CWS against what it spent on expenses, cherry and casual labor. A negative balance means the station spent more than it was given."
      />

      <Card p="md">
        <Group align="flex-end" gap="sm" wrap="wrap">
          <StationFilter value={station} onChange={setStation} />
          <DateRangeFilter value={range} onChange={setRange} label="Dates" />
          <div>
            <Text size="sm" fw={500} mb={4}>Show by</Text>
            <SegmentedControl value={group} onChange={(v) => setGroup(v as FinanceGroup)} data={GROUPS} />
          </div>
        </Group>
      </Card>

      <ErrorMessage>{summary.error}</ErrorMessage>

      <SimpleGrid cols={{ base: 2, lg: 4 }}>
        <KpiCard label="Funds given" value={moneyRwf(s?.allocated)} icon={IconBuildingBank} loading={loading} />
        <KpiCard label="Spent" value={moneyRwf(s?.spent)} icon={IconArrowDownRight} accent="coffee" loading={loading} />
        <KpiCard
          label={num(s?.balance) < 0 ? 'Balance (overspent)' : 'Balance'}
          value={moneyRwf(s?.balance)}
          icon={IconWallet}
          accent={num(s?.balance) < 0 ? 'red' : 'green'}
          loading={loading}
        />
        <KpiCard label="Owed to farmers" value={moneyRwf(s?.owed_to_farmers)} icon={IconHourglass} accent="gray" loading={loading} />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 2, lg: range[0] ? 4 : 3 }}>
        <KpiCard label="Expenses" value={moneyRwf(s?.expenses)} icon={IconReceipt} accent="gray" loading={loading} />
        <KpiCard label="Cherry paid to farmers" value={moneyRwf(s?.cherry_paid)} icon={IconCoffee} accent="gray" loading={loading} />
        <KpiCard label="Casual labor paid" value={moneyRwf(s?.labor_paid)} icon={IconUsers} accent="gray" loading={loading} />
        {range[0] && <KpiCard label={`Opening balance (${range[0]})`} value={moneyRwf(s?.opening_balance)} icon={IconScale} accent="gray" loading={loading} />}
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Card p="md">
          <Text fw={600} mb="sm">Funds given vs spent</Text>
          {loading ? (
            <ChartSkeleton />
          ) : timeline.length === 0 ? (
            <EmptyState title="No money movements in this period" />
          ) : (
            <BarChart
              h={280}
              data={timeline}
              dataKey="label"
              // Not type="stacked" (that forces one stack): funds given is one bar, spending another (stacked by source).
              series={[
                { name: 'Funds given', color: 'baho.6', stackId: 'in' },
                { name: 'Expenses', color: 'coffee.6', stackId: 'out' },
                { name: 'Cherry paid', color: 'orange.5', stackId: 'out' },
                { name: 'Casual labor', color: 'gray.5', stackId: 'out' },
              ]}
              valueFormatter={(v) => moneyRwf(v)}
              withLegend
              withTooltip
            />
          )}
        </Card>
        <Card p="md">
          <Text fw={600} mb="sm">Balance over time</Text>
          {loading ? (
            <ChartSkeleton />
          ) : timeline.length === 0 ? (
            <EmptyState title="No money movements in this period" />
          ) : (
            <LineChart
              h={280}
              data={timeline}
              dataKey="label"
              series={[{ name: 'Balance', color: 'baho.7' }]}
              referenceLines={[{ y: 0, color: 'red.6', label: '0' }]}
              valueFormatter={(v) => moneyRwf(v)}
              curveType="linear"
              withTooltip
            />
          )}
        </Card>
      </SimpleGrid>

      <Card p="md">
        <Text fw={600} mb="sm">Where the money went</Text>
        {loading ? (
          <ChartSkeleton />
        ) : categories.length === 0 ? (
          <EmptyState title="Nothing spent in this period" />
        ) : (
          <BarChart
            h={Math.max(160, categories.length * 34)}
            data={categories}
            dataKey="label"
            series={[{ name: 'Amount', color: 'coffee.6' }]}
            orientation="vertical"
            yAxisProps={{ width: 220 }}
            valueFormatter={(v) => moneyRwf(v)}
            withTooltip
          />
        )}
      </Card>

      <Card p="md">
        <Text fw={600}>By station</Text>
        <Text size="xs" c="dimmed" mb="sm">Click a station to see only its figures.</Text>
        <DataTable<StationFinance>
          rows={s?.by_station ?? []}
          rowKey={(r) => r.facility}
          loading={summary.loading}
          minWidth={980}
          onRowClick={(r) => setStation(r.facility)}
          empty={{ title: 'No station to show' }}
          exportName="finance-by-station"
          columns={[
            { key: 'station', header: 'Station', mobile: 'title', render: (r) => <Text fw={600} size="sm">{r.label}</Text>, exportValue: (r) => r.label },
            range[0] ? { key: 'open', header: 'Opening', align: 'right', render: (r) => <Balance value={r.opening_balance} suffix={false} />, exportValue: (r) => r.opening_balance } : null,
            { key: 'in', header: 'Funds given', align: 'right', render: (r) => money(r.allocated), exportValue: (r) => r.allocated },
            { key: 'exp', header: 'Expenses', align: 'right', render: (r) => money(r.expenses), exportValue: (r) => r.expenses },
            { key: 'cherry', header: 'Cherry paid', align: 'right', render: (r) => money(r.cherry_paid), exportValue: (r) => r.cherry_paid },
            { key: 'labor', header: 'Casual labor', align: 'right', render: (r) => money(r.labor_paid), exportValue: (r) => r.labor_paid },
            { key: 'spent', header: 'Spent', align: 'right', render: (r) => money(r.spent), exportValue: (r) => r.spent },
            { key: 'bal', header: 'Balance (RWF)', align: 'right', mobile: 'subtitle', render: (r) => <Balance value={r.balance} suffix={false} />, exportValue: (r) => r.balance },
            { key: 'owed', header: 'Owed to farmers', align: 'right', render: (r) => money(r.owed_to_farmers), exportValue: (r) => r.owed_to_farmers },
          ]}
        />
      </Card>

      <Card p="md">
        <Text fw={600} mb="sm">Recent movements</Text>
        <DataTable<LedgerEntry>
          rows={s?.recent ?? []}
          rowKey={(r) => `${r.kind}-${r.number}-${r.date}-${r.money_in}-${r.money_out}`}
          loading={summary.loading}
          minWidth={900}
          empty={{ title: 'No money movements yet' }}
          columns={[
            { key: 'date', header: 'Date', nowrap: true, render: (r) => r.date },
            { key: 'kind', header: 'Type', render: (r) => <Badge variant="light" color={r.kind === 'ALLOCATION' ? 'teal' : 'gray'}>{KIND_LABEL[r.kind]}</Badge>, exportValue: (r) => KIND_LABEL[r.kind] },
            { key: 'station', header: 'Station', render: (r) => r.facility_name },
            { key: 'cat', header: 'Category', render: (r) => r.category },
            { key: 'desc', header: 'Description', mobile: 'title', render: (r) => r.description },
            { key: 'in', header: 'In', align: 'right', render: (r) => (num(r.money_in) ? money(r.money_in) : '') },
            { key: 'out', header: 'Out', align: 'right', render: (r) => (num(r.money_out) ? money(r.money_out) : '') },
          ]}
        />
      </Card>
    </Stack>
  );
}
