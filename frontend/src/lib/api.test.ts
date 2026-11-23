import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, refreshAccessToken, serverLogout, tokens } from './api';

const headersOf = (init: RequestInit | undefined) => (init?.headers ?? {}) as Record<string, string>;

function json(status: number, body: unknown) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('api()', () => {
  beforeEach(() => tokens.clear());

  it('never keeps tokens in localStorage', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(200, { access: 'A1' }));
    await refreshAccessToken();
    expect(tokens.access).toBe('A1');
    expect(localStorage.getItem('baho.access')).toBeNull();
    expect(localStorage.getItem('baho.refresh')).toBeNull();
  });

  it('sends the access token and the cookie', async () => {
    tokens.set('A1');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(200, { ok: true }));
    await api('/auth/me/');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/auth/me/');
    expect(headersOf(init).Authorization).toBe('Bearer A1');
    expect(init?.credentials).toBe('same-origin');
  });

  it('renews the access token once on 401 and retries', async () => {
    tokens.set('expired');
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(401, { detail: 'expired' }))
      .mockResolvedValueOnce(json(200, { access: 'fresh' }))
      .mockResolvedValueOnce(json(200, { id: 'u1' }));
    await expect(api('/auth/me/')).resolves.toEqual({ id: 'u1' });
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/auth/refresh/');
    expect(headersOf(fetchMock.mock.calls[2][1]).Authorization).toBe('Bearer fresh');
  });

  it('gives up and clears the token when the refresh cookie is gone', async () => {
    tokens.set('expired');
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(401, { detail: 'expired' }))
      .mockResolvedValueOnce(json(401, { detail: 'Not signed in.' }));
    await expect(api('/auth/me/')).rejects.toBeInstanceOf(ApiError);
    expect(tokens.access).toBeNull();
  });

  it('explains throttling in plain words', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(429, null));
    await expect(api('/auth/login/', { method: 'POST', body: {}, auth: false })).rejects.toThrow(/Too many attempts/);
  });

  it('sends FormData as multipart without forcing JSON', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(200, {}));
    const form = new FormData();
    form.append('station', 'GITOKI');
    await api('/imports/cherry-receipts/', { method: 'POST', body: form });
    const init = fetchMock.mock.calls[0][1];
    expect(init?.body).toBe(form);
    expect(headersOf(init)['Content-Type']).toBeUndefined();
  });

  it('logout revokes the cookie on the server and forgets the token', async () => {
    tokens.set('A1');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 204 }));
    await serverLogout();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/auth/logout/');
    expect(tokens.access).toBeNull();
  });
});
