import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, refreshAccessToken, saveRefreshToken, serverLogout, setSessionExpiredHandler, tokens } from './api';
import type { CurrentUser } from './access';
import { AuthContext } from './authContext';
import { cacheClear, setOfflineUser } from './offline/store';
import { requestSync, startAutoSync } from './offline/sync';
import { kv } from './platform';

const ME_KEY = 'baho.me';

async function rememberUser(me: CurrentUser | null) {
  await kv.set(ME_KEY, me ? JSON.stringify(me) : null);
}

async function rememberedUser(): Promise<CurrentUser | null> {
  try {
    const raw = await kv.get(ME_KEY);
    return raw ? (JSON.parse(raw) as CurrentUser) : null;
  } catch {
    return null;
  }
}

function activate(me: CurrentUser) {
  setOfflineUser(me.id);
  startAutoSync();
  void requestSync();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    setUser(null);
    setOfflineUser(null);
    void (async () => {
      await cacheClear(); // shared phones: the next person must not see this user's data
      await rememberUser(null);
      await serverLogout();
    })();
  }, []);

  // Restore the session on start. Without a connection, keep working as the
  // last signed-in user (data comes from the device until the server is back).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await refreshAccessToken();
        if (result === 'ok') {
          const me = await api<CurrentUser>('/auth/me/');
          await rememberUser(me);
          if (!cancelled) {
            activate(me);
            setUser(me);
          }
        } else if (result === 'offline') {
          const me = await rememberedUser();
          if (me && !cancelled) {
            activate(me);
            setUser(me);
          }
        }
      } catch {
        const me = await rememberedUser();
        if (me && !cancelled) {
          activate(me);
          setUser(me);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // If a token can't be renewed mid-session, drop back to the login screen.
  // Queued offline work stays on the device and is sent after signing in again.
  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null));
    return () => setSessionExpiredHandler(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api<{ access: string; refresh?: string }>('/auth/login/', {
      method: 'POST',
      body: { email: email.trim().toLowerCase(), password },
      auth: false,
    });
    tokens.set(result.access);
    await saveRefreshToken(result.refresh);
    const me = await api<CurrentUser>('/auth/me/');
    await rememberUser(me);
    activate(me);
    setUser(me);
    return me;
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const result = await api<{ access: string; refresh?: string }>('/auth/change-password/', {
      method: 'POST',
      body: { current_password: currentPassword, new_password: newPassword },
    });
    tokens.set(result.access);
    await saveRefreshToken(result.refresh);
    const me = await api<CurrentUser>('/auth/me/');
    await rememberUser(me);
    setUser(me);
    return me;
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout, changePassword }),
    [user, loading, login, logout, changePassword],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
