import { Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { useIsMobile } from './mobile/useIsMobile';

interface PageHeaderProps {
  title: string;
  /** Small uppercase label above the title, e.g. "CWS operations". */
  eyebrow?: string;
  description?: string;
  /** Buttons/selects shown on the right; on phones they go full width under the title. */
  actions?: ReactNode;
}

/** Flatten fragments so each action is its own grid cell on phones. */
function flat(node: ReactNode): ReactNode[] {
  return Children.toArray(node).flatMap((child) =>
    isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment
      ? flat(child.props.children)
      : [child],
  );
}

export function PageHeader({ title, eyebrow, description, actions }: PageHeaderProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    const items = flat(actions).filter(Boolean);
    return (
      <Stack gap="sm">
        <div>
          {eyebrow && (
            <Text c="teal.8" fw={700} tt="uppercase" size="11px" lts={0.6}>
              {eyebrow}
            </Text>
          )}
          <Title order={3} fz={24} lh={1.2}>
            {title}
          </Title>
          {description && (
            <Text c="dimmed" size="sm" mt={4} lineClamp={3}>
              {description}
            </Text>
          )}
        </div>
        {items.length > 0 && (
          // Each action stretches to a full-width, thumb-sized control.
          <SimpleGrid cols={items.length === 1 ? 1 : 2} spacing="xs" className="page-header-actions-mobile">
            {items.map((item, index) => (
              <div key={index} style={{ minWidth: 0 }}>{item}</div>
            ))}
          </SimpleGrid>
        )}
      </Stack>
    );
  }

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
