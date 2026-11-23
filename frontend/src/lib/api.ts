/**
 * Fetch wrapper for the Django API, with offline support.
 *
 * Sessions
 * - The short-lived access token is kept in memory only.
 * - Browser: the refresh token is an httpOnly cookie JavaScript never sees.
 * - Android app: the refresh token is kept in app storage and sent in the body
 *   (`X-Baho-Client: mobile`), because the app has no cookie jar shared with the site.
 *
 * Offline
 * - Every successful GET is saved on the device; when the server can't be
 *   reached, the saved answer is used, so screens opened before still work.
 * - Writes carry an `Idempotency-Key`. When the device is offline (or older
 *   writes are still waiting) they go into the outbox instead and the caller
 *   gets an optimistic answer (`_pending: true`). The outbox is sent, in order,
 *   as soon as the connection is back (see offline/sync.ts); the key makes a
 *   repeated send harmless.
 * - File uploads and sign-in/password calls always need a connection.
 */
import { apiBase, isNative, kv } from './platform';
import {
  cacheGet,
  cachePut,
  getSyncStatus,
  hasQueuedWrites,
  offlineUser,
  outboxAdd,
  resolveIds,
  updateSyncStatus,
  withQueued,
} from './offline/store';
import { requestSync } from './offline/sync';
import { toast } from './toast';

const REFRESH_KEY = 'baho.refresh';
let accessToken: string | null = null;

// Sessions from before the cookie change kept tokens in localStorage: remove them.
if (!isNative) {
  try {
    localStorage.removeItem('baho.access');
    localStorage.removeItem('baho.refresh');
  } catch {
    // storage unavailable: nothing to clean up
  }
}

export const tokens = {
  get access() {
    return accessToken;
  },
  set(access: string | null) {
    accessToken = access;
  },
  clear() {
    accessToken = null;
  },
};

/** App only: remember the refresh token the server handed out. */
export async function saveRefreshToken(refresh: string | undefined | null) {
  if (isNative && refresh !== undefined) await kv.set(REFRESH_KEY, refresh);
}

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, data: unknown) {
    super(ApiError.messageFrom(status, data));
    this.status = status;
    this.data = data;
  }

  /** True when the server could not be reached at all (no connection). */
  get isNetwork() {
    return this.status === 0;
  }

  private static messageFrom(status: number, data: unknown): string {
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      if (typeof record.detail === 'string') return record.detail;
      const first = Object.values(record)[0];
      if (Array.isArray(first) && typeof first[0] === 'string') return first[0];
    }
    if (status === 0) return 'No connection to the server. Check the internet and try again.';
    if (status === 429) return 'Too many attempts. Please wait a few minutes and try again.';
    return `Request failed (${status}).`;
  }
}

/** Called when the session can no longer be renewed (AuthProvider logs out). */
let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

function clientHeaders(): Record<string, string> {
  return isNative ? { 'X-Baho-Client': 'mobile' } : {};
}

function markOnline(online: boolean) {
  if (getSyncStatus().online !== online) updateSyncStatus({ online });
}

export type RefreshResult = 'ok' | 'signed-out' | 'offline';

let refreshing: Promise<RefreshResult> | null = null;

/** Gets a new access token. "offline" means the server could not be reached (session kept). */
export async function refreshAccessToken(): Promise<RefreshResult> {
  refreshing ??= (async (): Promise<RefreshResult> => {
    try {
      const stored = isNative ? await kv.get(REFRESH_KEY) : null;
      if (isNative && !stored) return 'signed-out';
      const res = await fetch(`${apiBase()}/auth/refresh/`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...clientHeaders() },
        body: JSON.stringify(stored ? { refresh: stored } : {}),
      });
      markOnline(true);
      if (!res.ok) {
        if (isNative && res.status === 401) await kv.set(REFRESH_KEY, null);
        return res.status === 401 || res.status === 400 ? 'signed-out' : 'offline';
      }
      const data = (await res.json()) as { access: string; refresh?: string };
      tokens.set(data.access);
      await saveRefreshToken(data.refresh);
      return 'ok';
    } catch {
      markOnline(false);
      return 'offline';
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Revokes the refresh token on the server. Never throws. */
export async function serverLogout(): Promise<void> {
  try {
    const stored = isNative ? await kv.get(REFRESH_KEY) : null;
    await fetch(`${apiBase()}/auth/logout/`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...clientHeaders() },
      body: JSON.stringify(stored ? { refresh: stored } : {}),
    });
  } catch {
    // offline: the token still expires on its own
  }
  if (isNative) await kv.set(REFRESH_KEY, null);
  tokens.clear();
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface RawResult {
  ok: boolean;
  status: number;
  data: unknown;
}

/**
 * One request with the session handled (renews the access token once on 401).
 * Network failure gives status 0. Used by api() and by the outbox sync.
 */
export async function sendRaw(path: string, method: Method, body: unknown, { auth = true, idempotencyKey }: { auth?: boolean; idempotencyKey?: string } = {}): Promise<RawResult> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const send = () => {
    const headers: Record<string, string> = { Accept: 'application/json', ...clientHeaders() };
    // FormData sets its own multipart Content-Type (with the boundary).
    if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
    if (auth && tokens.access) headers.Authorization = `Bearer ${tokens.access}`;
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    return fetch(`${apiBase()}${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
  };

  let res: Response;
  try {
    res = await send();
    if (res.status === 401 && auth && (await refreshAccessToken()) === 'ok') res = await send();
  } catch {
    markOnline(false);
    return { ok: false, status: 0, data: null };
  }
  markOnline(true);
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

interface RequestOptions {
  method?: Method;
  /** JSON body, or FormData for file uploads (sent as multipart; never queued). */
  body?: unknown;
  auth?: boolean;
}

const UUID_IN_PATH = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
}

function canQueue(path: string, method: Method, body: unknown, auth: boolean): boolean {
  return (
    method !== 'GET' &&
    auth &&
    Boolean(offlineUser()) &&
    !(typeof FormData !== 'undefined' && body instanceof FormData) &&
    !path.startsWith('/auth/')
  );
}

/** Put a write in the outbox and hand back what the screen would have got. */
async function queueWrite<T>(path: string, method: Method, body: unknown, key: string): Promise<T> {
  // A POST to a collection creates a record; actions on a record (…/<uuid>/void/) don't.
  const createsRecord = method === 'POST' && !UUID_IN_PATH.test(path);
  const tempId = createsRecord ? newId() : undefined;
  await outboxAdd({ key, method: method as Exclude<Method, 'GET'>, path, body, tempId, label: `${method} ${path}` });
  toast.queued();
  void requestSync();
  if (method === 'DELETE') return null as T;
  const idFromPath = path.match(/\/([0-9a-f-]{36})\/$/)?.[1];
  return { ...((body as object) ?? {}), id: tempId ?? idFromPath, _pending: true } as T;
}

export async function api<T>(path: string, { method = 'GET', body, auth = true }: RequestOptions = {}): Promise<T> {
  if (offlineUser()) path = await resolveIds(path);

  if (method === 'GET') {
    const res = await sendRaw(path, 'GET', undefined, { auth });
    if (res.status === 0 && auth) {
      const cached = await cacheGet(path);
      if (cached) return (await withQueued(path, cached.data)) as T;
    }
    if (res.status === 401 && auth) {
      tokens.clear();
      onSessionExpired?.();
    }
    if (!res.ok) throw new ApiError(res.status, res.data);
    if (auth && !path.startsWith('/auth/')) await cachePut(path, res.data);
    return (auth ? await withQueued(path, res.data) : res.data) as T;
  }

  const queueable = canQueue(path, method, body, auth);
  const key = newId();
  if (queueable) {
    body = await resolveIds(body);
    // Keep the order: anything behind a waiting write waits too.
    if (!getSyncStatus().online || (await hasQueuedWrites())) return queueWrite<T>(path, method, body, key);
  }

  const res = await sendRaw(path, method, body, { auth, idempotencyKey: queueable ? key : undefined });
  if (res.status === 0 && queueable) return queueWrite<T>(path, method, body, key);
  if (res.status === 401 && auth) {
    tokens.clear();
    onSessionExpired?.();
  }
  if (!res.ok) throw new ApiError(res.status, res.data);
  return res.data as T;
}
