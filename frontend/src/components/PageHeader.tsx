import { Group, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  /** Small uppercase label above the title, e.g. "CWS operations". */
  eyebrow?: string;
  description?: string;
  /** Buttons/selects shown on the right (wraps under the title on phones). */
  actions?: ReactNode;
}

export function PageHeader({ title, eyebrow, description, actions }: PageHeaderProps) {
  return (
    <Group justify="space-between" align="flex-end" gap="md">
      <div>
        {eyebrow && (
          <Text c="gray.6" fw={700} tt="uppercase" size="xs">
            {eyebrow}
          </Text>
        )}
        <Title order={2}>{title}</Title>
        {description && (
          <Text c="dimmed" size="sm">
            {description}
          </Text>
        )}
      </div>
      {actions && (
        <Group gap="sm" align="flex-end">
          {actions}
        </Group>
      )}
    </Group>
  );
}
