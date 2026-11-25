import { useState } from 'react';
import { Badge, Card, Group, Select, Stack, Text } from '@mantine/core';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { useMyStations } from '../../lib/stations';
import { query, useApi } from '../../lib/useApi';

/** One deleted record waiting for permanent removal (GET /core/trash/). */
interface TrashItem {
  id: string;
  type: string;
  type_label: string;
  number: string;
  facility: string | null;
  facility_name: string;
  deleted_by: string;
  deleted_at: string;
  reason: string;
  purge_after: string;
}

interface TrashResponse {
  retention_hours: number;
  types: Array<{ code: string; label: string }>;
  count: number;
  results: TrashItem[];
}

function dateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** "in 5 h 20 min", or null once the removal time has passed. */
function timeLeft(purgeAfter: string, now: number): string | null {
  const minutes = Math.floor((new Date(purgeAfter).getTime() - now) / 60_000);
  if (minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `in ${hours} h ${minutes % 60} min` : `in ${minutes} min`;
}

function retentionText(hours: number): string {
  return hours % 24 === 0 ? `${hours / 24} day${hours === 24 ? '' : 's'}` : `${hours} hours`;
}

/**
 * Trash: records deleted (with a reason) in the last retention period, before
 * they are removed from the database for good. Read-only; station users see
 * their own stations' records, HQ and admin roles see everything.
 */
export function TrashPage() {
  const [type, setType] = useState<string | null>(null);
  const [facility, setFacility] = useState<string | null>(null);
  const stations = useMyStations();
  const trash = useApi<TrashResponse>(`/core/trash/${query({ type, facility })}`);
  const data = trash.data;
  const [now] = useState(() => Date.now());

  return (
    <Stack gap="lg" maw={1400}>
      <PageHeader
        eyebrow="Records"
        title="Trash"
        description={`Deleted records are kept here for ${retentionText(data?.retention_hours ?? 24)} with the reason they were deleted, then removed permanently. Their numbers are never reused.`}
      />
      <Card p="lg">
        <Group align="flex-end" gap="md">
          <Select
            label="Type"
            placeholder="All types"
            data={(data?.types ?? []).map((t) => ({ value: t.code, label: t.label }))}
            value={type}
            onChange={setType}
            clearable
            w={220}
          />
          {stations.options.length > 0 && (
            <Select
              label="Station"
              placeholder="All stations"
              data={stations.options}
              value={facility}
              onChange={setFacility}
              clearable
              w={240}
            />
          )}
        </Group>
      </Card>

      <Card p="lg">
        <DataTable<TrashItem>
          rows={data?.results ?? []}
          rowKey={(r) => `${r.type}-${r.id}`}
          loading={trash.loading}
          error={trash.error}
          minWidth={1150}
          empty={{ title: 'The trash is empty', hint: 'Nothing has been deleted recently.' }}
          exportName="trash"
          columnsKey="trash"
          columns={[
            { key: 'number', header: 'Record', mono: true, mobile: 'title', render: (r) => r.number },
            {
              key: 'type',
              header: 'Type',
              nowrap: true,
              mobile: 'subtitle',
              exportValue: (r) => r.type_label,
              render: (r) => <Badge variant="light" color="gray">{r.type_label}</Badge>,
            },
            { key: 'station', header: 'Station', render: (r) => r.facility_name || 'HQ' },
            { key: 'by', header: 'Deleted by', render: (r) => r.deleted_by || '—' },
            { key: 'at', header: 'Deleted at', nowrap: true, render: (r) => dateTime(r.deleted_at) },
            { key: 'reason', header: 'Reason', render: (r) => r.reason || '—' },
            {
              key: 'purge',
              header: 'Permanently removed on',
              nowrap: true,
              exportValue: (r) => dateTime(r.purge_after),
              render: (r) => {
                const left = timeLeft(r.purge_after, now);
                return (
                  <Stack gap={0}>
                    <Text size="sm">{dateTime(r.purge_after)}</Text>
                    <Text size="xs" c={left ? 'dimmed' : 'orange'}>{left ?? 'Due: removed at the next clean-up'}</Text>
                  </Stack>
                );
              },
            },
          ]}
        />
      </Card>
    </Stack>
  );
}
