/**
 * Sends the outbox to the server, oldest first, whenever the device is online.
 *
 * - Success: the record's temporary id is mapped to the real one (later writes
 *   that referred to it are rewritten), the entry is removed.
 * - No connection / server busy (409) / session expired: stop and try later.
 * - Refused by the server (validation, permissions): the entry is marked
 *   "failed" with the reason and stays on the Sync screen until someone retries
 *   or discards it; the rest of the queue carries on.
 */
import { Network } from '@capacitor/network';
import { sendRaw } from '../api';
import { isNative } from '../platform';
import {
  mapId,
  notifyDataSynced,
  offlineUser,
  outboxDelete,
  outboxEntries,
  outboxUpdate,
  refreshStatus,
  resolveIds,
  updateSyncStatus,
} from './store';

let running: Promise<void> | null = null;
let again = false;

function messageOf(data: unknown, status: number): string {
  if (data && typeof data === 'object') {
    const parts: string[] = [];
    Object.entries(data as Record<string, unknown>).forEach(([field, value]) => {
      const text = (Array.isArray(value) ? value.flat(3) : [value]).filter((v) => typeof v === 'string').join(' ');
      if (text) parts.push(field === 'detail' || field === 'non_field_errors' ? text : `${field.replace(/_/g, ' ')}: ${text}`);
    });
    if (parts.length) return parts.join(' · ');
  }
  return `The server refused it (${status}).`;
}

async function runOnce(): Promise<void> {
  if (!offlineUser()) return;
  updateSyncStatus({ syncing: true });
  let synced = 0;
  try {
    for (const entry of await outboxEntries()) {
      if (entry.status === 'failed') continue;
      const path = await resolveIds(entry.path);
      const body = await resolveIds(entry.body);
      const res = await sendRaw(path, entry.method, body, { idempotencyKey: entry.key });
      if (res.status === 0 || res.status === 409 || res.status === 401 || res.status >= 500) break;
      if (res.ok) {
        const id = (res.data as { id?: string } | null)?.id;
        if (entry.tempId && id) await mapId(entry.tempId, id);
        await outboxDelete(entry.seq as number);
        synced += 1;
      } else {
        await outboxUpdate({ ...entry, status: 'failed', error: messageOf(res.data, res.status), attempts: entry.attempts + 1 });
      }
    }
  } finally {
    updateSyncStatus({ syncing: false, lastSync: Date.now() });
    await refreshStatus();
    if (synced) notifyDataSynced();
  }
}

/** Send whatever is waiting. Safe to call often: runs one at a time. */
export function requestSync(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await runOnce();
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Put a failed entry back in the queue and try again. */
export async function retryEntry(seq: number) {
  const entry = (await outboxEntries()).find((e) => e.seq === seq);
  if (!entry) return;
  await outboxUpdate({ ...entry, status: 'pending', error: undefined });
  await refreshStatus();
  await requestSync();
}

let started = false;

/** Sync when the connection comes back, when the app returns to the foreground, and every minute. */
export function startAutoSync() {
  if (started) return;
  started = true;
  const goOnline = () => {
    updateSyncStatus({ online: true });
    void requestSync();
  };
  window.addEventListener('online', goOnline);
  window.addEventListener('offline', () => updateSyncStatus({ online: false }));
  if (isNative) {
    void Network.addListener('networkStatusChange', (s) => (s.connected ? goOnline() : updateSyncStatus({ online: false })));
    void Network.getStatus().then((s) => updateSyncStatus({ online: s.connected }));
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void requestSync();
  });
  window.setInterval(() => void requestSync(), 60_000);
}
