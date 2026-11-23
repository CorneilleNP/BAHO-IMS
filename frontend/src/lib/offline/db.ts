/**
 * The device database (IndexedDB) behind offline mode.
 *
 *   cache   GET responses by URL, so screens opened before still work offline
 *   outbox  writes made offline (or while older ones wait), sent in order later
 *   idmap   temporary id -> real server id, for records created offline
 *           that later writes refer to (e.g. a GRN for a farmer registered offline)
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface CacheEntry {
  url: string;
  userId: string;
  data: unknown;
  savedAt: number;
}

export type OutboxStatus = 'pending' | 'failed';

export interface OutboxEntry {
  seq?: number;
  /** Sent as the Idempotency-Key: a retry never creates a second record. */
  key: string;
  userId: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  /** For creates: the id the app showed until the server assigns the real one. */
  tempId?: string;
  /** Short human description for the Sync screen, e.g. "POST /farmers/". */
  label: string;
  status: OutboxStatus;
  error?: string;
  attempts: number;
  createdAt: number;
}

interface BahoDB extends DBSchema {
  cache: { key: string; value: CacheEntry };
  outbox: { key: number; value: OutboxEntry; indexes: { byUser: string } };
  idmap: { key: string; value: { tempId: string; realId: string } };
}

let dbPromise: Promise<IDBPDatabase<BahoDB>> | null = null;

export function db(): Promise<IDBPDatabase<BahoDB>> {
  dbPromise ??= openDB<BahoDB>('baho-offline', 1, {
    upgrade(database) {
      database.createObjectStore('cache', { keyPath: 'url' });
      const outbox = database.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
      outbox.createIndex('byUser', 'userId');
      database.createObjectStore('idmap', { keyPath: 'tempId' });
    },
  });
  return dbPromise;
}

/** Tests only: forget the open connection so each test gets a fresh database. */
export function resetDbForTests() {
  dbPromise = null;
}
