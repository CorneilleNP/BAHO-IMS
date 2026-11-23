import { useState } from 'react';
import { Button, Checkbox, Group, Menu, Pagination, Popover, Stack, Table, Text } from '@mantine/core';
import { IconColumns, IconDownload, IconFileSpreadsheet, IconFileTypeCsv } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { exportCsv, exportExcel, type ExportColumn } from '../lib/exportTable';
import { toast } from '../lib/toast';
import { errorText } from '../lib/useApi';
import { EmptyState, ErrorMessage } from './Feedback';
import { MobileCardList } from './mobile/MobileCardList';
import { useIsMobile } from './mobile/useIsMobile';
import { TableSkeleton } from './Skeletons';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  /** Monospace, for document numbers (GRN, lot, batch…). Never wraps. */
  mono?: boolean;
  /** Keep on one line (dates, status badges). */
  nowrap?: boolean;
  /** Plain value for CSV/Excel. Defaults to render() when that is text/number; false = leave out (e.g. action buttons). */
  exportValue?: ((row: T) => string | number | null | undefined) | false;
  /** Cell for the totals row at the bottom. */
  footer?: ReactNode;
  /** Hidden until switched on in the column chooser. */
  optional?: boolean;
  /** Phone card layout: card title / subtitle, or left out. Default: 1st column = title, 2nd = subtitle. */
  mobile?: 'title' | 'subtitle' | 'hide';
}

interface DataTableProps<T> {
  columns: Array<Column<T> | false | null | undefined>;
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  empty: { title: string; hint?: ReactNode };
  minWidth?: number;
  /** Enables the Export menu; used as the file name, e.g. "cherry-receipts". */
  exportName?: string;
  /** Rows to export (e.g. every page from the API). Defaults to the rows shown. */
  fetchAll?: () => Promise<T[]>;
  /** Checkbox column; `selected` holds row keys. */
  selection?: { selected: Set<string>; onChange: (next: Set<string>) => void };
  onRowClick?: (row: T) => void;
  /** Server-side paging. */
  pagination?: { page: number; pageSize: number; total: number; onChange: (page: number) => void };
  /** Adds a "Columns" chooser; the choice is remembered under this key. */
  columnsKey?: string;
  /** Extra buttons shown left of Columns / Export (e.g. bulk actions). */
  toolbar?: ReactNode;
}

function readHidden(key: string | undefined, cols: Array<Column<unknown>>): Set<string> {
  const fallback = new Set(cols.filter((c) => c.optional).map((c) => c.key));
  if (!key) return fallback;
  try {
    const saved = localStorage.getItem(`baho.columns.${key}`);
    return saved ? new Set(JSON.parse(saved) as string[]) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * The one table used for every list: skeleton on first load, error and empty
 * states, optional selection, row click, totals row, paging, column chooser
 * and CSV/Excel export of everything matching the current filters.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  error,
  empty,
  minWidth = 700,
  exportName,
  fetchAll,
  selection,
  onRowClick,
  pagination,
  columnsKey,
  toolbar,
}: DataTableProps<T>) {
  const isMobile = useIsMobile();
  const allCols = columns.filter(Boolean) as Array<Column<T>>;
  const [exporting, setExporting] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(() => readHidden(columnsKey, allCols as Array<Column<unknown>>));
  const cols = columnsKey ? allCols.filter((c) => !hidden.has(c.key)) : allCols.filter((c) => !c.optional);
  const hasFooter = cols.some((c) => c.footer !== undefined);

  function toggleColumn(key: string) {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setHidden(next);
    try {
      localStorage.setItem(`baho.columns.${columnsKey}`, JSON.stringify([...next]));
    } catch {
      // not remembered
    }
  }

  async function runExport(format: 'csv' | 'xlsx') {
    if (!exportName) return;
    setExporting(true);
    try {
      const all = fetchAll ? await fetchAll() : rows;
      const exportColumns: ExportColumn<T>[] = allCols
        .filter((c) => c.exportValue !== false && typeof c.header === 'string' && c.header)
        .map((c) => ({
          header: c.header as string,
          value:
            typeof c.exportValue === 'function'
              ? c.exportValue
              : (row: T) => {
                  const shown = c.render(row);
                  return typeof shown === 'string' || typeof shown === 'number' ? shown : '';
                },
        }));
      if (format === 'csv') exportCsv(exportName, exportColumns, all);
      else await exportExcel(exportName, exportColumns, all);
      toast.success(`${all.length} ${all.length === 1 ? 'row' : 'rows'} exported.`, 'Export ready');
    } catch (err) {
      toast.error(errorText(err), 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  if (error) return <ErrorMessage>{error}</ErrorMessage>;

  const keys = rows.map(rowKey);
  const allSelected = !!selection && keys.length > 0 && keys.every((k) => selection.selected.has(k));
  const someSelected = !!selection && keys.some((k) => selection.selected.has(k));
  const toggleAll = () => {
    if (!selection) return;
    const next = new Set(selection.selected);
    keys.forEach((k) => (allSelected ? next.delete(k) : next.add(k)));
    selection.onChange(next);
  };
  const toggleRow = (key: string) => {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    selection.onChange(next);
  };

  const showToolbar = toolbar || exportName || columnsKey;

  return (
    <>
      {showToolbar && (
        <Group justify="space-between" mb="xs" gap="xs">
          <Group gap="xs">{toolbar}</Group>
          <Group gap="xs">
            {columnsKey && (
              <Popover position="bottom-end" withinPortal shadow="md">
                <Popover.Target>
                  <Button size="compact-sm" variant="default" leftSection={<IconColumns size={14} />}>
                    Columns
                  </Button>
                </Popover.Target>
                <Popover.Dropdown>
                  <Stack gap={6} mah={360} style={{ overflowY: 'auto' }}>
                    {allCols
                      .filter((c) => typeof c.header === 'string' && c.header)
                      .map((c) => (
                        <Checkbox key={c.key} size="xs" label={c.header} checked={!hidden.has(c.key)} onChange={() => toggleColumn(c.key)} />
                      ))}
                  </Stack>
                </Popover.Dropdown>
              </Popover>
            )}
            {exportName && rows.length > 0 && (
              <Menu position="bottom-end" withinPortal>
                <Menu.Target>
                  <Button size="compact-sm" variant="default" leftSection={<IconDownload size={14} />} loading={exporting}>
                    Export
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item leftSection={<IconFileSpreadsheet size={16} />} onClick={() => runExport('xlsx')}>
                    Excel (.xlsx)
                  </Menu.Item>
                  <Menu.Item leftSection={<IconFileTypeCsv size={16} />} onClick={() => runExport('csv')}>
                    CSV
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </Group>
        </Group>
      )}

      {loading && rows.length === 0 ? (
        <TableSkeleton columns={Math.min(cols.length, 6)} />
      ) : rows.length === 0 ? (
        <EmptyState title={empty.title}>{empty.hint}</EmptyState>
      ) : isMobile ? (
        <MobileCardList cols={cols} rows={rows} rowKey={rowKey} onRowClick={onRowClick} selection={selection} loading={loading} />
      ) : (
        <Table.ScrollContainer minWidth={minWidth}>
          <Table style={{ opacity: loading ? 0.6 : 1 }}>
            <Table.Thead>
              <Table.Tr>
                {selection && (
                  <Table.Th w={36}>
                    <Checkbox aria-label="Select all rows" checked={allSelected} indeterminate={someSelected && !allSelected} onChange={toggleAll} />
                  </Table.Th>
                )}
                {cols.map((col) => (
                  <Table.Th key={col.key} ta={col.align}>
                    {col.header}
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((row) => {
                const key = rowKey(row);
                return (
                  <Table.Tr
                    key={key}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    style={onRowClick ? { cursor: 'pointer' } : undefined}
                    bg={selection?.selected.has(key) ? 'var(--mantine-color-coffee-0)' : undefined}
                  >
                    {selection && (
                      <Table.Td onClick={(e) => e.stopPropagation()}>
                        <Checkbox aria-label="Select row" checked={selection.selected.has(key)} onChange={() => toggleRow(key)} />
                      </Table.Td>
                    )}
                    {cols.map((col) => (
                      <Table.Td
                    key={col.key}
                    ta={col.align}
                    ff={col.mono ? 'monospace' : undefined}
                    style={col.mono || col.nowrap ? { whiteSpace: 'nowrap' } : undefined}
                  >
                        {col.render(row)}
                      </Table.Td>
                    ))}
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
            {hasFooter && (
              <Table.Tfoot>
                <Table.Tr>
                  {selection && <Table.Th />}
                  {cols.map((col) => (
                    <Table.Th key={col.key} ta={col.align}>
                      {col.footer}
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Tfoot>
            )}
          </Table>
        </Table.ScrollContainer>
      )}

      {pagination && pagination.total > pagination.pageSize && (
        <Group justify={isMobile ? 'center' : 'space-between'} mt="sm" gap="xs">
          <Text size="xs" c="dimmed">
            {(pagination.page - 1) * pagination.pageSize + 1}–{Math.min(pagination.page * pagination.pageSize, pagination.total)} of{' '}
            {pagination.total.toLocaleString()}
          </Text>
          <Pagination size="sm" siblings={isMobile ? 0 : 1} value={pagination.page} onChange={pagination.onChange} total={Math.ceil(pagination.total / pagination.pageSize)} />
        </Group>
      )}
    </>
  );
}
