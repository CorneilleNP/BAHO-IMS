import { Card, Group, Progress, SimpleGrid, Skeleton, Text, Tooltip } from '@mantine/core';
import { IconPackage } from '@tabler/icons-react';
import { kgWhole, num, pct } from '../lib/format';

interface StockBalanceCardProps {
  title?: string;
  /** Pure weight received. */
  received: string | number | null | undefined;
  /** Taken out by dry mill batches. */
  milled: string | number | null | undefined;
  /** Stock adjustments (negative = removed). */
  adjusted: string | number | null | undefined;
  balance: string | number | null | undefined;
  /** Optional extra figure, e.g. "available to mill". */
  extra?: { label: string; value: string | number | null | undefined };
  loading?: boolean;
}

/** Received vs stock balance: how much of what came in has been milled / adjusted, and what is left. */
export function StockBalanceCard({ title = 'Received vs stock balance', received, milled, adjusted, balance, extra, loading }: StockBalanceCardProps) {
  const rec = num(received);
  const milledPct = rec > 0 ? (num(milled) / rec) * 100 : 0;
  const adjustedPct = rec > 0 ? (Math.max(0, -num(adjusted)) / rec) * 100 : 0;
  const balancePct = rec > 0 ? (num(balance) / rec) * 100 : 0;
  const figures: Array<[string, string, string?]> = [
    ['Received (pure kg)', kgWhole(received)],
    ['Milled (kg)', kgWhole(milled), 'Taken out of stock by dry mill batches'],
    ['Adjusted (kg)', kgWhole(adjusted), 'Stock corrections, incl. opening balances of receipts marked Completed'],
    ['In stock (kg)', kgWhole(balance)],
  ];
  if (extra) figures.push([extra.label, kgWhole(extra.value)]);

  return (
    <Card withBorder radius="md" p="md">
      <Group justify="space-between" mb="sm">
        <Group gap={8}>
          <IconPackage size={18} />
          <Text fw={600}>{title}</Text>
        </Group>
        {!loading && <Text size="sm" c="dimmed">{pct(balancePct, 1)} of received still in stock</Text>}
      </Group>
      <SimpleGrid cols={{ base: 2, sm: figures.length }} mb="sm">
        {figures.map(([label, value, hint]) => (
          <div key={label}>
            <Tooltip label={hint} disabled={!hint} withArrow multiline w={240}>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{label}</Text>
            </Tooltip>
            {loading ? <Skeleton height={22} width="70%" mt={6} /> : <Text fw={700} size="lg">{value}</Text>}
          </div>
        ))}
      </SimpleGrid>
      <Progress.Root size="lg" aria-label="Received split into milled, adjusted and in stock">
        <Tooltip label={`Milled ${pct(milledPct, 1)}`}><Progress.Section value={milledPct} color="coffee.6" /></Tooltip>
        <Tooltip label={`Adjusted out ${pct(adjustedPct, 1)}`}><Progress.Section value={adjustedPct} color="gray.5" /></Tooltip>
        <Tooltip label={`In stock ${pct(balancePct, 1)}`}><Progress.Section value={balancePct} color="teal.6" /></Tooltip>
      </Progress.Root>
    </Card>
  );
}
