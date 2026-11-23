import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Group, Stack, Text } from '@mantine/core';
import { IconCloudDownload, IconRefresh, IconTrash } from '@tabler/icons-react';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/authContext';
import { confirmAction } from '../../lib/confirm';
import type { OutboxEntry } from '../../lib/offline/db';
import { outboxDelete, outboxEntries, subscribeSyncStatus } from '../../lib/offline/store';
import { requestSync, retryEntry } from '../../lib/offline/sync';
import { useSyncStatus } from '../../lib/offline/useSyncStatus';
import { isNative, serverUrl } from '../../lib/platform';
import { toast } from '../../lib/toast';

/** Lists every screen's main data so it is on the device before going to the field. */
function offlineUrls(stationIds: string[], isGlobal: boolean): string[] {
  // Must match the URLs the screens request exactly (the cache is keyed by URL).
  const urls = [
    '/organization/facilities/?facility_type=CWS&is_active=true&page_size=200',
    '/organization/facilities/?facility_type=CWS&page_size=500&ordering=name',
    '/processing/catalog/processes/',
    '/drymill/sources/',
    '/drymill/export-grades/',
    '/reporting/cws/',
  ];
  for (const id of stationIds) {
    urls.push(
      `/farmers/?home_facility=${id}&is_active=true&page_size=500`, // GRN wizard farmer picker
      `/farmers/?home_facility=${id}&is_active=true&ordering=full_name&page=1`, // Farmers page
      `/reception/receipts/?facility=${id}&page=1&page_size=25`,
      `/processing/lots/?facility=${id}&page=1&page_size=25`,
      `/processing/process-types/?facility=${id}&is_active=true`,
      `/processing/process-types/?facility=${id}`,
      `/labor/laborers/?facility=${id}&ordering=full_name&page_size=500`,
      `/labor/pay-periods/?facility=${id}&ordering=-period_start&page_size=100`,
    );
  }
  if (isGlobal) urls.push('/drymill/suppliers/?page_size=500', '/sales/clients/?page_size=500');
  return urls;
}

const describe = (e: OutboxEntry) => {
  const path = e.path.split('?')[0];
  const what = path.replace(/\/[0-9a-f-]{36}\//gi, '/…/').replace(/^\/|\/$/g, '').replace(/[/-]/g, ' ');
  const verb = e.method === 'POST' ? (path.match(/[0-9a-f-]{36}/i) ? 'Action' : 'New') : e.method === 'DELETE' ? 'Delete' : 'Change';
  const body = (e.body ?? {}) as Record<string, unknown>;
  const name = ['full_name', 'name', 'reason', 'work_date', 'received_on'].map((k) => body[k]).find((v) => typeof v === 'string');
  return { verb, what, name: name as string | undefined };
};

/** Saves waiting on this device, problems to fix, and "download for offline". */
export function SyncPage() {
  const { user } = useAuth();
  const status = useSyncStatus();
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(() => {
    void outboxEntries().then(setEntries);
  }, []);
  useEffect(() => {
    load();
    return subscribeSyncStatus(load);
  }, [load]);

  const discard = async (entry: OutboxEntry) => {
    const ok = await confirmAction({
      title: 'Discard this save?',
      message: 'It was never accepted by the server and will be deleted from this device. This cannot be undone.',
      confirmLabel: 'Discard',
      danger: true,
    });
    if (ok === null) return;
    await outboxDelete(entry.seq as number);
    load();
  };

  const download = async () => {
    if (!user) return;
    setDownloading(true);
    let stations = user.roles.map((r) => r.facility?.id).filter((id): id is string => Boolean(id));
    if (user.is_global) {
      try {
        const all = await api<{ results: Array<{ id: string }> }>('/organization/facilities/?facility_type=CWS&is_active=true&page_size=200');
        stations = all.results.map((s) => s.id);
      } catch {
        // offline: keep what we have
      }
    }
    let ok = 0;
    for (const url of offlineUrls(stations, user.is_global)) {
      try {
        await api(url);
        ok += 1;
      } catch {
        // not allowed for this role, or offline: skip
      }
    }
    setDownloading(false);
    toast.success(`${ok} lists saved on this device. Screens you open while online are saved too.`, 'Ready for offline');
  };

  return (
    <Stack gap="lg" maw={1100}>
      <PageHeader
        eyebrow="This device"
        title="Sync"
        description="Work saved without a connection waits here and is sent automatically, oldest first, when the device is online."
        actions={
          <>
            <Button variant="light" leftSection={<IconCloudDownload size={16} />} onClick={download} loading={downloading} disabled={!status.online}>
              Download for offline
            </Button>
            <Button leftSection={<IconRefresh size={16} />} onClick={() => void requestSync()} loading={status.syncing} disabled={!status.online}>
              Sync now
            </Button>
          </>
        }
      />

      <Group>
        <Badge size="lg" color={status.online ? 'teal' : 'gray'} variant="light">{status.online ? 'Online' : 'Offline'}</Badge>
        <Text size="sm" c="dimmed">
          {status.pending} waiting · {status.failed} refused · last sync {status.lastSync ? new Date(status.lastSync).toLocaleTimeString() : 'not yet'}
          {isNative && ` · server ${serverUrl()}`}
        </Text>
      </Group>

      {status.failed > 0 && (
        <Alert color="red" variant="light" title="Some saves were refused by the server">
          Usually the data changed meanwhile (e.g. not enough stock, a period already closed). Read the reason, then Retry after fixing it on the
          server, or Discard it.
        </Alert>
      )}

      <Card withBorder radius="md" p="lg">
        <DataTable<OutboxEntry>
          rows={entries}
          rowKey={(e) => String(e.seq)}
          minWidth={760}
          empty={{ title: 'Nothing waiting', hint: 'Everything saved on this device has reached the server.' }}
          columns={[
            { key: 'when', header: 'Saved', nowrap: true, render: (e) => new Date(e.createdAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) },
            {
              key: 'what',
              header: 'What',
              render: (e) => {
                const d = describe(e);
                return (
                  <Stack gap={0}>
                    <Text size="sm" fw={600} tt="capitalize">{d.verb} · {d.what}</Text>
                    {d.name && <Text size="xs" c="dimmed">{d.name}</Text>}
                  </Stack>
                );
              },
            },
            {
              key: 'status',
              header: 'Status',
              render: (e) =>
                e.status === 'failed' ? (
                  <Stack gap={2}>
                    <Badge color="red" variant="light">Refused</Badge>
                    <Text size="xs" c="red" maw={320}>{e.error}</Text>
                  </Stack>
                ) : (
                  <Badge color="yellow" variant="light">Waiting</Badge>
                ),
            },
            {
              key: 'actions',
              header: '',
              render: (e) =>
                e.status === 'failed' && (
                  <Group gap={4} wrap="nowrap">
                    <Button size="compact-xs" variant="light" leftSection={<IconRefresh size={12} />} onClick={() => void retryEntry(e.seq as number).then(load)}>
                      Retry
                    </Button>
                    <Button size="compact-xs" variant="subtle" color="red" leftSection={<IconTrash size={12} />} onClick={() => void discard(e)}>
                      Discard
                    </Button>
                  </Group>
                ),
            },
          ]}
        />
      </Card>
    </Stack>
  );
}
