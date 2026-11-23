/**
 * Offline cache + outbox operations, and the sync status the UI shows.
 */
import { db, type OutboxEntry } from './db';

// --- who is signed in (cache and outbox are per user) -----------------------------

let currentUserId: string | null = null;

export function setOfflineUser(userId: string | null) {
  currentUserId = userId;
  void refreshStatus();
}

export function offlineUser(): string | null {
  return currentUserId;
}

// --- status shown in the header and on the Sync screen ----------------------------

export interface SyncStatus {
  online: boolean;
  syncing: boolean;
  pending: number;
  failed: number;
  lastSync: number | null;
}

let status: SyncStatus = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  syncing: false,
  pending: 0,
  failed: 0,
  lastSync: null,
};
const listeners = new Set<(s: SyncStatus) => void>();

export function getSyncStatus(): SyncStatus {
  return status;
}

export function updateSyncStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l(status));
}

export function subscribeSyncStatus(listener: (s: SyncStatus) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function refreshStatus() {
  const entries = await outboxEntries();
  updateSyncStatus({
    pending: entries.filter((e) => e.status === 'pending').length,
    failed: entries.filter((e) => e.status === 'failed').length,
  });
}

/** Fired after queued writes reached the server, so open screens reload. */
const dataListeners = new Set<() => void>();
export function onDataSynced(listener: () => void): () => void {
  dataListeners.add(listener);
  return () => dataListeners.delete(listener);
}
export function notifyDataSynced() {
  dataListeners.forEach((l) => l());
}

// --- cache --------------------------------------------------------------------------

const cacheKey = (url: string) => `${currentUserId ?? 'anon'}|${url}`;

export async function cachePut(url: string, data: unknown) {
  if (!currentUserId) return;
  await (await db()).put('cache', { url: cacheKey(url), userId: currentUserId, data, savedAt: Date.now() });
}

export async function cacheGet(url: string): Promise<{ data: unknown; savedAt: number } | null> {
  if (!currentUserId) return null;
  const entry = await (await db()).get('cache', cacheKey(url));
  return entry ? { data: entry.data, savedAt: entry.savedAt } : null;
}

/** Remove every cached response (sign-out on a shared device). Queued writes are kept. */
export async function cacheClear() {
  await (await db()).clear('cache');
}

// --- outbox -------------------------------------------------------------------------

export async function outboxEntries(): Promise<OutboxEntry[]> {
  if (!currentUserId) return [];
  return (await db()).getAllFromIndex('outbox', 'byUser', currentUserId);
}

export async function outboxAdd(entry: Omit<OutboxEntry, 'seq' | 'userId' | 'status' | 'attempts' | 'createdAt'>) {
  if (!currentUserId) throw new Error('Sign in before saving.');
  await (await db()).add('outbox', { ...entry, userId: currentUserId, status: 'pending', attempts: 0, createdAt: Date.now() });
  await refreshStatus();
}

export async function outboxUpdate(entry: OutboxEntry) {
  await (await db()).put('outbox', entry);
}

export async function outboxDelete(seq: number) {
  await (await db()).delete('outbox', seq);
  await refreshStatus();
}

export async function hasQueuedWrites(): Promise<boolean> {
  return (await outboxEntries()).length > 0;
}

// --- temporary ids of records created offline --------------------------------------

export async function mapId(tempId: string, realId: string) {
  await (await db()).put('idmap', { tempId, realId });
}

/** Replace every temporary id that has a real one now (in a path or a JSON body). */
export async function resolveIds<T>(value: T): Promise<T> {
  const all = await (await db()).getAll('idmap');
  if (!all.length) return value;
  let text = JSON.stringify(value);
  if (text === undefined) return value;
  for (const { tempId, realId } of all) text = text.split(tempId).join(realId);
  return JSON.parse(text) as T;
}

// --- show queued creates/edits in lists before they reach the server ---------------

function collectionOf(path: string): string {
  return path.split('?')[0];
}

function overlayItems<T extends Record<string, unknown>>(items: T[], queued: OutboxEntry[], base: string): T[] {
  let rows = [...items];
  for (const entry of queued) {
    const body = (entry.body ?? {}) as Record<string, unknown>;
    if (entry.method === 'POST' && collectionOf(entry.path) === base && entry.tempId) {
      if (!rows.some((r) => r.id === entry.tempId)) rows = [{ ...body, id: entry.tempId, _pending: true } as unknown as T, ...rows];
    }
    if (entry.method === 'PATCH') {
      const match = entry.path.match(/^(.*\/)([^/]+)\/$/);
      if (match && match[1] === base) rows = rows.map((r) => (r.id === match[2] ? ({ ...r, ...body, _pending: true } as T) : r));
    }
  }
  return rows;
}

/**
 * Add what is waiting in the outbox to a list response for the same collection,
 * so a farmer registered offline can be picked for a GRN straight away.
 */
export async function withQueued<T>(path: string, data: T): Promise<T> {
  const queued = (await outboxEntries()).filter((e) => e.status === 'pending' && !e.path.includes('/void/'));
  if (!queued.length || !data) return data;
  const base = collectionOf(path);
  if (Array.isArray(data)) return overlayItems(data as Record<string, unknown>[], queued, base) as T;
  const page = data as { results?: unknown; count?: number };
  if (Array.isArray(page.results)) {
    const results = overlayItems(page.results as Record<string, unknown>[], queued, base);
    return { ...page, results, count: (page.count ?? 0) + (results.length - page.results.length) } as T;
  }
  return data;
}
