import { Card, Group, Skeleton, Text, ThemeIcon } from '@mantine/core';
import { IconTrendingDown, IconTrendingUp } from '@tabler/icons-react';
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

/** Headline figure on dashboards: icon tile, label, big value, optional trend pill. */
export function KpiCard({ label, value, icon: Icon, accent = 'baho', delta, loading = false }: KpiCardProps) {
  const isPositive = delta ? !delta.startsWith('-') : true;

  return (
    <Card padding="lg" className="kpi-card" style={{ flex: 1 }}>
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
        <Text size="sm" c="dimmed" fw={600} lh={1.3} className="kpi-label">
          {label}
        </Text>
        {Icon && (
          <ThemeIcon color={accent} variant="light" size={40} radius="lg" className="kpi-icon" style={{ flex: 'none' }}>
            <Icon size={21} />
          </ThemeIcon>
        )}
      </Group>
      {loading ? (
        <Skeleton height={30} width="60%" mt={10} radius="md" />
      ) : (
        <Text fz={28} fw={800} mt={6} lh={1.15} className="kpi-value" style={{ letterSpacing: -0.5 }}>
          {value}
        </Text>
      )}
      {delta && !loading && (
        <Group
          gap={4}
          mt={10}
          px={8}
          py={2}
          w="fit-content"
          style={{ borderRadius: 999, background: isPositive ? 'var(--mantine-color-baho-0)' : '#fdecec' }}
        >
          {isPositive ? <IconTrendingUp size={14} color="#1d8762" /> : <IconTrendingDown size={14} color="#c92a2a" />}
          <Text size="xs" fw={700} c={isPositive ? 'baho.7' : 'red.8'}>
            {delta}
          </Text>
        </Group>
      )}
    </Card>
  );
}
