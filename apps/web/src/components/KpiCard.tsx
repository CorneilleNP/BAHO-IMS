import { Card, Group, Text, ThemeIcon } from '@mantine/core';
import type { ComponentType } from 'react';

interface KpiCardProps {
  label: string;
  value: string;
  icon?: ComponentType<{ size?: number }>;
  accent?: string;
  delta?: string;
}

export function KpiCard({ label, value, icon: Icon, accent = 'coffee', delta }: KpiCardProps) {
  const isPositive = delta ? !delta.startsWith('-') : true;

  return (
    <Card withBorder radius="md" padding="md" style={{ flex: 1, minWidth: 160, boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)' }}>
      <Group justify="space-between" align="flex-start">
        <div>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {label}
          </Text>
          <Text size="xl" fw={700} mt={4}>
            {value}
          </Text>
          {delta && (
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
