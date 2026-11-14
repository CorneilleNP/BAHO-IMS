import { Group, SimpleGrid, Skeleton, Stack } from '@mantine/core';

/** Placeholder rows shaped like the table that is loading. */
export function TableSkeleton({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <Stack gap="xs" aria-busy="true" aria-label="Loading table">
      <Group gap="md" wrap="nowrap">
        {Array.from({ length: columns }, (_, c) => (
          <Skeleton key={c} height={12} radius="sm" style={{ flex: 1 }} />
        ))}
      </Group>
      {Array.from({ length: rows }, (_, r) => (
        <Group key={r} gap="md" wrap="nowrap" py={6}>
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} height={16} radius="sm" style={{ flex: 1 }} width={c === 0 ? '70%' : undefined} />
          ))}
        </Group>
      ))}
    </Stack>
  );
}

/** Placeholder bars for a horizontal bar chart. */
export function ChartSkeleton({ bars = 5, height = 200 }: { bars?: number; height?: number }) {
  return (
    <Stack gap="sm" justify="center" h={height} aria-busy="true" aria-label="Loading chart">
      {Array.from({ length: bars }, (_, i) => (
        <Group key={i} gap="sm" wrap="nowrap">
          <Skeleton height={12} width={80} radius="sm" />
          <Skeleton height={18} radius="sm" width={`${90 - i * 14}%`} />
        </Group>
      ))}
    </Stack>
  );
}

/** Placeholder inputs while a form's options load. */
export function FormSkeleton({ fields = 4, columns = 2 }: { fields?: number; columns?: number }) {
  return (
    <SimpleGrid cols={{ base: 1, sm: columns }} aria-busy="true" aria-label="Loading form">
      {Array.from({ length: fields }, (_, i) => (
        <Stack key={i} gap={6}>
          <Skeleton height={12} width="40%" radius="sm" />
          <Skeleton height={36} radius="md" />
        </Stack>
      ))}
    </SimpleGrid>
  );
}

/** Whole-page placeholder: header line, then a card of form fields and a table. */
export function PageSkeleton() {
  return (
    <Stack gap="lg" aria-busy="true" aria-label="Loading page">
      <Stack gap={6}>
        <Skeleton height={10} width={120} radius="sm" />
        <Skeleton height={28} width={280} radius="sm" />
      </Stack>
      <FormSkeleton fields={4} columns={2} />
      <TableSkeleton rows={4} />
    </Stack>
  );
}
