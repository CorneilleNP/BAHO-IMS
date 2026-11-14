import { Alert, Stack, Text } from '@mantine/core';
import { IconAlertCircle, IconCircleCheck } from '@tabler/icons-react';
import type { ReactNode } from 'react';

export function ErrorMessage({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <Alert color="red" variant="light" icon={<IconAlertCircle size={18} />} role="alert">
      {children}
    </Alert>
  );
}

export function SuccessMessage({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  if (!children) return null;
  return (
    <Alert color="teal" variant="light" icon={<IconCircleCheck size={18} />} withCloseButton={Boolean(onClose)} onClose={onClose} role="status">
      {children}
    </Alert>
  );
}

/** Shown in place of a table/chart when the database has no records yet. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Stack align="center" gap={4} py="xl" ta="center">
      <Text fw={600}>{title}</Text>
      {children && (
        <Text size="sm" c="dimmed" maw={420}>
          {children}
        </Text>
      )}
    </Stack>
  );
}
