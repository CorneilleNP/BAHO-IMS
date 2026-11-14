import { BarChart } from '@mantine/charts';
import { Card, Text } from '@mantine/core';
import { chartRows } from '../lib/format';
import { EmptyState } from './Feedback';
import { ChartSkeleton } from './Skeletons';

interface ChartCardProps {
  title: string;
  rows: Array<{ label: string; kg: string | number }>;
  loading?: boolean;
  color?: string;
  /** Width reserved for the category labels on the left. */
  labelWidth?: number;
  maxBars?: number;
}

/** Horizontal "kg by X" bar chart with skeleton and empty state. */
export function ChartCard({ title, rows, loading = false, color = 'coffee.6', labelWidth = 110, maxBars = 12 }: ChartCardProps) {
  const data = chartRows(rows.slice(0, maxBars));
  return (
    <Card withBorder radius="md" p="md">
      <Text fw={600} mb="sm">
        {title}
      </Text>
      {loading && rows.length === 0 ? (
        <ChartSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState title="No data yet" />
      ) : (
        <BarChart
          h={Math.max(160, data.length * 34)}
          data={data}
          dataKey="label"
          series={[{ name: 'kg', color }]}
          orientation="vertical"
          yAxisProps={{ width: labelWidth }}
          valueFormatter={(v) => `${v.toLocaleString()} kg`}
          withTooltip
        />
      )}
    </Card>
  );
}
