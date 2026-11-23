import { Card, Checkbox, Group, SimpleGrid, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import type { Column } from '../DataTable';

interface MobileCardListProps<T> {
  cols: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  selection?: { selected: Set<string>; onChange: (next: Set<string>) => void };
  loading?: boolean;
}

/** A column is an "action" (buttons) when it has no text header or isn't exported. */
const isAction = <T,>(col: Column<T>) => col.exportValue === false || typeof col.header !== 'string' || !col.header;

/**
 * Phone layout of DataTable: one card per row instead of a squeezed table.
 * Which column goes where is decided once here, from the column definitions:
 *   title     -> `mobile: 'title'`, else the first column
 *   subtitle  -> `mobile: 'subtitle'`, else the second column
 *   fields    -> every other column as label / value
 *   actions   -> buttons (columns without a header) at the bottom
 * A column can opt out with `mobile: 'hide'`.
 */
export function MobileCardList<T>({ cols, rows, rowKey, onRowClick, selection, loading }: MobileCardListProps<T>) {
  const visible = cols.filter((c) => c.mobile !== 'hide');
  const data = visible.filter((c) => !isAction(c));
  const actions = visible.filter(isAction);
  const title = data.find((c) => c.mobile === 'title') ?? data[0];
  const subtitle = data.find((c) => c.mobile === 'subtitle') ?? data.find((c) => c !== title && !c.mobile);
  const fields = data.filter((c) => c !== title && c !== subtitle);
  const totals = visible.filter((c) => c.footer !== undefined && c.footer !== null && c.footer !== '');

  const toggle = (key: string) => {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    selection.onChange(next);
  };

  return (
    <Stack gap="sm" style={{ opacity: loading ? 0.6 : 1 }}>
      {rows.map((row) => {
        const key = rowKey(row);
        const selected = selection?.selected.has(key);
        const body: ReactNode = (
          <Stack gap={10}>
            <Group justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
              <Group gap="sm" wrap="nowrap" align="flex-start" style={{ minWidth: 0, flex: 1 }}>
                {selection && (
                  <Checkbox aria-label="Select" checked={!!selected} onChange={() => toggle(key)} onClick={(e) => e.stopPropagation()} mt={3} />
                )}
                <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                  {title && (
                    <Text fw={700} size="md" ff={title.mono ? 'monospace' : undefined} style={{ wordBreak: 'break-word' }}>
                      {title.render(row)}
                    </Text>
                  )}
                  {subtitle && (
                    <Text size="sm" c="dimmed" component="div" ff={subtitle.mono ? 'monospace' : undefined}>
                      {subtitle.render(row)}
                    </Text>
                  )}
                </Stack>
              </Group>
              {onRowClick && <IconChevronRight size={18} color="var(--mantine-color-gray-5)" style={{ flex: 'none', marginTop: 2 }} />}
            </Group>

            {fields.length > 0 && (
              <SimpleGrid cols={2} spacing="sm" verticalSpacing={8}>
                {fields.map((col) => (
                  <div key={col.key} style={{ minWidth: 0 }}>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600} lts={0.3}>
                      {col.header}
                    </Text>
                    <Text size="sm" component="div" ff={col.mono ? 'monospace' : undefined} style={{ wordBreak: 'break-word' }}>
                      {col.render(row)}
                    </Text>
                  </div>
                ))}
              </SimpleGrid>
            )}

            {actions.length > 0 && (
              <Group gap="xs" onClick={(e) => e.stopPropagation()}>
                {actions.map((col) => (
                  <div key={col.key}>{col.render(row)}</div>
                ))}
              </Group>
            )}
          </Stack>
        );

        return (
          <Card
            key={key}
            withBorder
            radius="lg"
            padding="md"
            bg={selected ? 'var(--mantine-color-coffee-0)' : undefined}
            style={{ borderColor: 'var(--mantine-color-gray-2)' }}
          >
            {onRowClick ? (
              <UnstyledButton onClick={() => onRowClick(row)} style={{ display: 'block', width: '100%' }}>
                {body}
              </UnstyledButton>
            ) : (
              body
            )}
          </Card>
        );
      })}

      {totals.length > 0 && (
        <Card radius="lg" padding="md" bg="var(--mantine-color-gray-0)">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700} mb={6}>
            Totals
          </Text>
          <SimpleGrid cols={2} spacing="sm">
            {totals.map((col) => (
              <div key={col.key}>
                <Text size="xs" c="dimmed">{col.header}</Text>
                <Text size="sm" fw={700} component="div">{col.footer}</Text>
              </div>
            ))}
          </SimpleGrid>
        </Card>
      )}
    </Stack>
  );
}
