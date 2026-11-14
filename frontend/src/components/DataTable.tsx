import { Table } from '@mantine/core';
import type { ReactNode } from 'react';
import { EmptyState, ErrorMessage } from './Feedback';
import { TableSkeleton } from './Skeletons';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  /** Monospace, for document numbers (GRN, lot, batch…). */
  mono?: boolean;
}

interface DataTableProps<T> {
  columns: Array<Column<T> | false | null | undefined>;
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  empty: { title: string; hint?: ReactNode };
  minWidth?: number;
}

/**
 * The one table used for every list: skeleton on first load, an error
 * message if the request failed, an empty state when there are no records.
 */
export function DataTable<T>({ columns, rows, rowKey, loading = false, error, empty, minWidth = 700 }: DataTableProps<T>) {
  const cols = columns.filter(Boolean) as Array<Column<T>>;

  if (error) return <ErrorMessage>{error}</ErrorMessage>;
  if (loading && rows.length === 0) return <TableSkeleton columns={Math.min(cols.length, 6)} />;
  if (rows.length === 0) return <EmptyState title={empty.title}>{empty.hint}</EmptyState>;

  return (
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
  );
}
