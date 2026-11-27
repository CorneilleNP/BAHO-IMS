import { useState } from 'react';
import { Card, Group, Select, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconCash, IconCoffee, IconDroplet, IconReceipt, IconScale } from '@tabler/icons-react';
import { ChartCard } from '../../components/ChartCard';
import { DataTable } from '../../components/DataTable';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import { ErrorMessage } from '../../components/Feedback';
import { KpiCard } from '../../components/KpiCard';
import { PageHeader } from '../../components/PageHeader';
import { ANY_DATE, kgWhole, num, rwf, type DateRange } from '../../lib/format';
import { PaymentBadge } from './payments';
import { useMyStations } from '../../lib/stations';
import type { CwsSummary } from '../../lib/types';
import { query, useApi } from '../../lib/useApi';

/**
 * Cherry Reception dashboard: how much cherry has been bought, good vs float,
 * the full price per kg paid (cherry + transport + commission), which station
 * bought how much, paid vs still owed to farmers, and the latest deliveries. Admin/HQ roles see every
 * station; a CWS clerk sees their own (the server scopes it).
 */
export function CwsDashboardPage() {
  const [range, setRange] = useState<DateRange>(ANY_DATE);
  const [station, setStation] = useState<string | null>(null);
  const myStations = useMyStations();
  const summary = useApi<CwsSummary>(`/reporting/cws/${query({ date_from: range[0], date_to: range[1], station })}`);
  const s = summary.data;
  const kpiLoading = summary.loading && !s;

  return (
    <Stack gap="lg">
      <PageHeader
        title="CWS Dashboard"
        description="Cherry bought across stations: good vs float, price, paid vs still owed, and the latest deliveries"
      />

      {/* Filters first: they apply to every figure, chart and table below. */}
      <Card padding="md">
        <Group align="flex-end" gap="md">
          <Select
            label="CWS station"
            placeholder={myStations.stations.length > 1 ? 'All stations' : 'My station'}
            data={myStations.options}
            value={station}
            onChange={setStation}
            clearable
            searchable
            w={{ base: '100%', sm: 260 }}
          />
          <DateRangeFilter value={range} onChange={setRange} label="Received" />
        </Group>
      </Card>

      <ErrorMessage>{summary.error}</ErrorMessage>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        <KpiCard label="Total cherry bought (kg)" value={kgWhole(s?.total_kg)} icon={IconCoffee} loading={kpiLoading} />
        <KpiCard label="Good cherry (kg)" value={kgWhole(s?.good.kg)} icon={IconDroplet} accent="green" loading={kpiLoading} />
        <KpiCard label="Float cherry (kg)" value={kgWhole(s?.float.kg)} icon={IconDroplet} accent="yellow" loading={kpiLoading} />
        <KpiCard label="Total amount due (RWF)" value={rwf(s?.total_amount)} icon={IconScale} accent="gray" loading={kpiLoading} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <KpiCard label="Amount paid to farmers (RWF)" value={rwf(s?.amount_paid)} icon={IconCash} accent="green" loading={kpiLoading} />
        <KpiCard label="Still to pay farmers (RWF)" value={rwf(s?.amount_owed)} icon={IconReceipt} accent="red" loading={kpiLoading} />
      </SimpleGrid>
      {s && (
        <Text size="xs" c="dimmed" mt={-8}>
          GRNs: {s.payment_status_counts.PAID} paid · {s.payment_status_counts.PARTIAL} partly paid · {s.payment_status_counts.UNPAID} not paid.
        </Text>
      )}

      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <KpiCard label="Avg. cost of cherry / kg — good (RWF)" value={rwf(s?.good.avg_cost_per_kg)} icon={IconScale} accent="green" loading={kpiLoading} />
        <KpiCard label="Avg. cost of cherry / kg — float (RWF)" value={rwf(s?.float.avg_cost_per_kg)} icon={IconScale} accent="yellow" loading={kpiLoading} />
      </SimpleGrid>
      <Text size="xs" c="dimmed" mt={-8}>
        Average cost per kg is the full amount paid for that grade (cherry price + transport + commission), divided by its kg.
      </Text>

      <ChartCard title="Cherry bought by station (kg)" rows={s?.by_station ?? []} loading={kpiLoading} color="coffee.6" />

      <Card p="md">
        <Text fw={600} mb="sm">Recent cherry received</Text>
        <DataTable
          rows={s?.recent_receipts ?? []}
          rowKey={(r) => r.id}
          loading={summary.loading}
          minWidth={900}
          empty={{ title: 'No cherry received yet', hint: 'Record deliveries with "New GRN" on Cherry Reception.' }}
          exportName="recent-cherry-received"
          columns={[
            { key: 'grn', header: 'GRN', mono: true, mobile: 'title', render: (r) => r.grn_number },
            { key: 'date', header: 'Date', nowrap: true, render: (r) => r.received_on },
            { key: 'farmer', header: 'Farmer', mobile: 'subtitle', render: (r) => r.farmer_name, exportValue: (r) => `${r.farmer_name} (${r.farmer_code})` },
            { key: 'station', header: 'Station', render: (r) => r.facility_name },
            { key: 'good', header: 'Good (kg)', align: 'right', render: (r) => kgWhole(r.good_kg), exportValue: (r) => r.good_kg },
            { key: 'float', header: 'Float (kg)', align: 'right', render: (r) => kgWhole(r.float_kg), exportValue: (r) => r.float_kg },
            { key: 'amount', header: 'Amount', align: 'right', render: (r) => rwf(r.total_amount), exportValue: (r) => r.total_amount },
            { key: 'paid', header: 'Paid', align: 'right', render: (r) => rwf(r.amount_paid), exportValue: (r) => r.amount_paid },
            {
              key: 'owed',
              header: 'Still owed',
              align: 'right',
              render: (r) => <Text span size="sm" c={num(r.balance) > 0 ? 'red.7' : undefined}>{rwf(r.balance)}</Text>,
              exportValue: (r) => r.balance,
            },
            { key: 'status', header: 'Payment', nowrap: true, render: (r) => <PaymentBadge status={r.payment_status} />, exportValue: (r) => r.payment_status },
          ]}
        />
      </Card>
    </Stack>
  );
}
