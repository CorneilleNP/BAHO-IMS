import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, tokens } from '../api';
import { resetDbForTests } from './db';
import { outboxEntries, setOfflineUser, updateSyncStatus, withQueued } from './store';
import { requestSync, retryEntry } from './sync';

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function json(status: number, body: unknown) {
  return new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const offline: Handler = () => {
  throw new TypeError('Failed to fetch');
};

function mockFetch(handler: Handler) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => handler(String(input), init ?? {}));
}

const headersOf = (init: RequestInit) => (init.headers ?? {}) as Record<string, string>;
const FARMERS = '/farmers/?home_facility=s1&is_active=true&page_size=500';

afterEach(async () => {
  // Let any background sync a test started finish before the next test's fetch mock.
  vi.restoreAllMocks();
  mockFetch(offline);
  await requestSync();
  vi.restoreAllMocks();
});

beforeEach(async () => {
  // A fresh device database for every test.
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  tokens.set('A1');
  setOfflineUser('user-1');
  updateSyncStatus({ online: true, pending: 0, failed: 0 });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('offline reads', () => {
  it('serves the last answer from the device when the server cannot be reached', async () => {
    mockFetch(() => json(200, { count: 1, results: [{ id: 'f1', full_name: 'Jean' }] }));
    await api(FARMERS);
    vi.restoreAllMocks();
    mockFetch(offline);
    const cached = await api<{ results: Array<{ full_name: string }> }>(FARMERS);
    expect(cached.results[0].full_name).toBe('Jean');
  });

  it('keeps each user’s cache separate', async () => {
    mockFetch(() => json(200, { count: 1, results: [{ id: 'f1' }] }));
    await api(FARMERS);
    vi.restoreAllMocks();
    setOfflineUser('user-2');
    mockFetch(offline);
    await expect(api(FARMERS)).rejects.toMatchObject({ status: 0 });
  });
});

describe('offline writes', () => {
  it('queues a save made without connection and shows it in lists straight away', async () => {
    mockFetch(offline);
    updateSyncStatus({ online: false });
    const farmer = await api<{ id: string; _pending: boolean }>('/farmers/', { method: 'POST', body: { full_name: 'Offline Farmer', home_facility: 's1' } });
    expect(farmer._pending).toBe(true);
    expect(farmer.id).toMatch(/^[0-9a-f-]{36}$/);

    const [entry] = await outboxEntries();
    expect(entry).toMatchObject({ method: 'POST', path: '/farmers/', status: 'pending', tempId: farmer.id });

    const list = await withQueued(FARMERS, { count: 0, results: [] as Array<{ id: string }> });
    expect(list.count).toBe(1);
    expect(list.results[0].id).toBe(farmer.id);
  });

  it('queues when the connection drops during the save, with the same idempotency key', async () => {
    const fetchMock = mockFetch(offline);
    await api('/farmers/', { method: 'POST', body: { full_name: 'X', home_facility: 's1' } });
    const sentKey = headersOf(fetchMock.mock.calls[0][1] as RequestInit)['Idempotency-Key'];
    const [entry] = await outboxEntries();
    expect(sentKey).toBeTruthy();
    expect(entry.key).toBe(sentKey);
  });

  it('never queues file uploads or sign-in', async () => {
    mockFetch(offline);
    const form = new FormData();
    await expect(api('/imports/cherry-receipts/', { method: 'POST', body: form })).rejects.toMatchObject({ status: 0 });
    await expect(api('/auth/login/', { method: 'POST', body: {}, auth: false })).rejects.toMatchObject({ status: 0 });
    expect(await outboxEntries()).toHaveLength(0);
  });
});

describe('sync', () => {
  it('sends the queue in order and rewires records that pointed at an offline-created one', async () => {
    mockFetch(offline);
    updateSyncStatus({ online: false });
    const farmer = await api<{ id: string }>('/farmers/', { method: 'POST', body: { full_name: 'New', home_facility: 's1' } });
    await api('/reception/receipts/', { method: 'POST', body: { farmer: farmer.id, facility: 's1', lines: [] } });
    vi.restoreAllMocks();

    const sent: Array<{ url: string; body: Record<string, unknown>; key: string }> = [];
    mockFetch((url, init) => {
      const body = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;
      sent.push({ url, body, key: headersOf(init)['Idempotency-Key'] });
      return url.endsWith('/farmers/') ? json(201, { id: 'real-farmer-id' }) : json(201, { id: 'real-grn-id' });
    });
    await requestSync();

    expect(sent.map((s) => s.url)).toEqual(['/api/v1/farmers/', '/api/v1/reception/receipts/']);
    expect(sent[1].body.farmer).toBe('real-farmer-id');
    expect(sent.every((s) => s.key)).toBe(true);
    expect(await outboxEntries()).toHaveLength(0);
  });

  it('marks a refused save as failed and carries on with the rest', async () => {
    mockFetch(offline);
    updateSyncStatus({ online: false });
    await api('/labor/pay-periods/p1/close/', { method: 'POST' });
    await api('/farmers/', { method: 'POST', body: { full_name: 'OK', home_facility: 's1' } });
    vi.restoreAllMocks();

    mockFetch((url) => (url.includes('/close/') ? json(400, { status: ['Only open periods can be closed.'] }) : json(201, { id: 'f9' })));
    await requestSync();
    const left = await outboxEntries();
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ status: 'failed', error: 'status: Only open periods can be closed.' });
  });

  it('stops without losing anything while still offline, and a failed entry can be retried', async () => {
    mockFetch(offline);
    updateSyncStatus({ online: false });
    await api('/farmers/', { method: 'POST', body: { full_name: 'A', home_facility: 's1' } });
    await requestSync();
    expect(await outboxEntries()).toHaveLength(1);
    vi.restoreAllMocks();

    mockFetch(() => json(400, { detail: 'nope' }));
    await requestSync();
    const [failed] = await outboxEntries();
    expect(failed.status).toBe('failed');
    vi.restoreAllMocks();

    mockFetch(() => json(201, { id: 'f1' }));
    await retryEntry(failed.seq as number);
    expect(await outboxEntries()).toHaveLength(0);
  });

  it('later saves wait behind queued ones, even when online again', async () => {
    mockFetch(offline);
    updateSyncStatus({ online: false });
    await api('/farmers/', { method: 'POST', body: { full_name: 'First', home_facility: 's1' } });
    vi.restoreAllMocks();
    // Online again, but the sync has not run yet: the next save must queue behind.
    updateSyncStatus({ online: true });
    const fetchMock = mockFetch(() => json(201, { id: 'x' }));
    const second = await api<{ _pending?: boolean }>('/farmers/', { method: 'POST', body: { full_name: 'Second', home_facility: 's1' } });
    expect(second._pending).toBe(true);
    await requestSync();
    const names = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).full_name);
    expect(names).toEqual(['First', 'Second']);
  });
});
