/**
 * Small fetch wrapper for the Django API.
 *
 * - Prefixes every path with VITE_API_URL (default "/api/v1", proxied to
 *   Django by Vite in development).
 * - Sends the JWT access token, and on a 401 tries once to renew it with
 *   the refresh token before giving up.
 */

const API_URL = import.meta.env.VITE_API_URL ?? '/api/v1';

const ACCESS_KEY = 'baho.access';
const REFRESH_KEY = 'baho.refresh';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode): session simply won't persist
  }
}

export const tokens = {
  get access() {
    return read(ACCESS_KEY);
  },
  get refresh() {
    return read(REFRESH_KEY);
  },
  set(access: string, refresh?: string) {
    write(ACCESS_KEY, access);
    if (refresh) write(REFRESH_KEY, refresh);
  },
  clear() {
    write(ACCESS_KEY, null);
    write(REFRESH_KEY, null);
  },
};

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, data: unknown) {
    super(ApiError.messageFrom(status, data));
    this.status = status;
    this.data = data;
  }

  private static messageFrom(status: number, data: unknown): string {
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      if (typeof record.detail === 'string') return record.detail;
      const first = Object.values(record)[0];
      if (Array.isArray(first) && typeof first[0] === 'string') return first[0];
    }
    if (status === 0) return 'Cannot reach the server. Is the backend running?';
    return `Request failed (${status}).`;
  }
}

/** Called when the session can no longer be renewed (AuthProvider logs out). */
let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

let refreshing: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refresh = tokens.refresh;
  if (!refresh) return false;
  // Share one refresh call between requests that fail at the same time.
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { access: string; refresh?: string };
      tokens.set(data.access, data.refresh);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  auth?: boolean;
}

export async function api<T>(path: string, { method = 'GET', body, auth = true }: RequestOptions = {}): Promise<T> {
  const send = () => {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const access = tokens.access;
    if (auth && access) headers.Authorization = `Bearer ${access}`;
    return fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };

  let res: Response;
  try {
    res = await send();
    if (res.status === 401 && auth && (await refreshAccessToken())) {
      res = await send();
    }
  } catch {
    throw new ApiError(0, null);
  }

  if (res.status === 401 && auth) {
    tokens.clear();
    onSessionExpired?.();
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}
