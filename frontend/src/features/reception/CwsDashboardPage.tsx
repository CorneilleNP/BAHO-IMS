import { useState } from 'react';
import { Card, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconCoffee, IconDroplet, IconScale, IconUserPlus } from '@tabler/icons-react';
import { ChartCard } from '../../components/ChartCard';
import { DataTable } from '../../components/DataTable';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import { ErrorMessage } from '../../components/Feedback';
import { KpiCard } from '../../components/KpiCard';
import { PageHeader } from '../../components/PageHeader';
import { ANY_DATE, kgWhole, rwf, type DateRange } from '../../lib/format';
import type { CwsSummary } from '../../lib/types';
import { query, useApi } from '../../lib/useApi';

/**
 * Cherry Reception dashboard: how much cherry has been bought, good vs float,
 * the full price per kg paid (cherry + transport + commission), which station
 * bought how much, and who registered most recently. Admin/HQ roles see every
 * station; a CWS clerk sees their own (the server scopes it).
 */
export function CwsDashboardPage() {
  const [range, setRange] = useState<DateRange>(ANY_DATE);
  const summary = useApi<CwsSummary>(`/reporting/cws/${query({ date_from: range[0], date_to: range[1] })}`);
  const s = summary.data;
  const kpiLoading = summary.loading && !s;

  return (
    <Stack gap="lg">
      <PageHeader
        title="CWS Dashboard"
        description="Cherry bought across stations: good vs float, price paid, and recent registrations"
        actions={<DateRangeFilter value={range} onChange={setRange} label="Received" />}
      />

      <ErrorMessage>{summary.error}</ErrorMessage>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        <KpiCard label="Total cherry bought (kg)" value={kgWhole(s?.total_kg)} icon={IconCoffee} loading={kpiLoading} />
        <KpiCard label="Good cherry (kg)" value={kgWhole(s?.good.kg)} icon={IconDroplet} accent="green" loading={kpiLoading} />
        <KpiCard label="Float cherry (kg)" value={kgWhole(s?.float.kg)} icon={IconDroplet} accent="yellow" loading={kpiLoading} />
        <KpiCard label="Total paid (RWF)" value={rwf(s?.total_amount)} icon={IconScale} accent="gray" loading={kpiLoading} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <KpiCard label="Avg. cost of cherry / kg — good (RWF)" value={rwf(s?.good.avg_cost_per_kg)} icon={IconScale} accent="green" loading={kpiLoading} />
        <KpiCard label="Avg. cost of cherry / kg — float (RWF)" value={rwf(s?.float.avg_cost_per_kg)} icon={IconScale} accent="yellow" loading={kpiLoading} />
      </SimpleGrid>
      <Text size="xs" c="dimmed" mt={-8}>
        Average cost per kg is the full amount paid for that grade (cherry price + transport + commission), divided by its kg.
      </Text>

      <ChartCard title="Cherry bought by station (kg)" rows={s?.by_station ?? []} loading={kpiLoading} color="coffee.6" />

      <Card withBorder radius="md" p="md">
        <Text fw={600} mb="sm">Recently registered farmers</Text>
        <DataTable
          rows={s?.recent_farmers ?? []}
          rowKey={(f) => f.id}
          loading={summary.loading}
          minWidth={760}
          empty={{ title: 'No farmers registered yet', hint: 'Use "Register farmer" on Cherry Reception.' }}
          exportName="recent-farmers"
          columns={[
            { key: 'code', header: 'Code', mono: true, render: (f) => f.farmer_code },
            { key: 'name', header: 'Name', render: (f) => f.full_name },
            { key: 'station', header: 'Station', render: (f) => f.home_facility_name },
            { key: 'location', header: 'Location', render: (f) => f.location_label || '—' },
            { key: 'phone', header: 'Phone', render: (f) => f.phone || '—' },
            { key: 'household', header: 'Household', align: 'right', render: (f) => f.household_size ?? '—' },
            { key: 'land', header: 'Land (ha)', align: 'right', render: (f) => (f.land_area_ha ? f.land_area_ha : '—') },
            { key: 'registered', header: 'Registered', render: (f) => new Date(f.created_at).toLocaleDateString() },
          ]}
        />
      </Card>

      {s?.recent_farmers.length === 0 && !summary.loading && (
        <Text size="xs" c="dimmed" ta="center">
          <IconUserPlus size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          Register farmers from the Cherry Reception screen to see them here.
        </Text>
      )}
    </Stack>
  );
}
