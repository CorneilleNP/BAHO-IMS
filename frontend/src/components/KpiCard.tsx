import { Card, Group, Skeleton, Text, ThemeIcon } from '@mantine/core';
import type { ComponentType } from 'react';

interface KpiCardProps {
  label: string;
  value: string;
  icon?: ComponentType<{ size?: number }>;
  accent?: string;
  delta?: string;
  /** Show a skeleton in place of the value while the figure loads. */
  loading?: boolean;
}

export function KpiCard({ label, value, icon: Icon, accent = 'coffee', delta, loading = false }: KpiCardProps) {
  const isPositive = delta ? !delta.startsWith('-') : true;

  return (
    <Card withBorder radius="md" padding="md" style={{ flex: 1, minWidth: 160, boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)' }}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div style={{ minWidth: 0, flex: 1 }}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {label}
          </Text>
          {loading ? (
            <Skeleton height={26} width="60%" mt={6} radius="sm" />
          ) : (
            <Text size="xl" fw={700} mt={4}>
              {value}
            </Text>
          )}
          {delta && !loading && (
            <Text size="xs" mt={6} fw={600} c={isPositive ? 'green.7' : 'red.7'}>
              {isPositive ? '▲' : '▼'} {delta}
            </Text>
          )}
        </div>
        {Icon && (
          <ThemeIcon color={accent} variant="light" size={38} radius="md">
            <Icon size={20} />
          </ThemeIcon>
        )}
      </Group>
    </Card>
  );
}
