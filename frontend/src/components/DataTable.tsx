import { useState } from 'react';
import { Button, Group, Menu, Table } from '@mantine/core';
import { IconDownload, IconFileSpreadsheet, IconFileTypeCsv } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { exportCsv, exportExcel, type ExportColumn } from '../lib/exportTable';
import { toast } from '../lib/toast';
import { errorText } from '../lib/useApi';
import { EmptyState, ErrorMessage } from './Feedback';
import { TableSkeleton } from './Skeletons';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  /** Monospace, for document numbers (GRN, lot, batch…). */
  mono?: boolean;
  /** Plain value for CSV/Excel. Defaults to render() when that is text/number; false = leave out (e.g. action buttons). */
  exportValue?: ((row: T) => string | number | null | undefined) | false;
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
}

/**
 * The one table used for every list: skeleton on first load, an error
 * message if the request failed, an empty state when there are no records,
 * and optional CSV/Excel export of everything matching the current filters.
 */
export function DataTable<T>({ columns, rows, rowKey, loading = false, error, empty, minWidth = 700, exportName, fetchAll }: DataTableProps<T>) {
  const cols = columns.filter(Boolean) as Array<Column<T>>;
  const [exporting, setExporting] = useState(false);

  async function runExport(format: 'csv' | 'xlsx') {
    if (!exportName) return;
    setExporting(true);
    try {
      const all = fetchAll ? await fetchAll() : rows;
      const exportColumns: ExportColumn<T>[] = cols
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
  if (loading && rows.length === 0) return <TableSkeleton columns={Math.min(cols.length, 6)} />;
  if (rows.length === 0) return <EmptyState title={empty.title}>{empty.hint}</EmptyState>;

  return (
    <>
      {exportName && (
        <Group justify="flex-end" mb="xs">
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
        </Group>
      )}
      <Table.ScrollContainer minWidth={minWidth}>
        <Table striped highlightOnHover verticalSpacing="sm" style={{ opacity: loading ? 0.6 : 1 }}>
          <Table.Thead>
            <Table.Tr>
              {cols.map((col) => (
                <Table.Th key={col.key} ta={col.align}>
                  {col.header}
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((row) => (
              <Table.Tr key={rowKey(row)}>
                {cols.map((col) => (
                  <Table.Td key={col.key} ta={col.align} ff={col.mono ? 'monospace' : undefined}>
                    {col.render(row)}
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </>
  );
}
