import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setSessionExpiredHandler, tokens } from './api';
import type { CurrentUser } from './access';
import { AuthContext } from './authContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(() => Boolean(tokens.access || tokens.refresh));

  const logout = useCallback(() => {
    tokens.clear();
    setUser(null);
  }, []);

  // Restore a saved session on page load.
  useEffect(() => {
    if (!tokens.access && !tokens.refresh) return;
    let cancelled = false;
    api<CurrentUser>('/auth/me/')
      .then((me) => !cancelled && setUser(me))
      .catch(() => !cancelled && logout())
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [logout]);

  // If a token can't be renewed mid-session, drop back to the login screen.
  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null));
    return () => setSessionExpiredHandler(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api<{ access: string; refresh: string }>('/auth/login/', {
      method: 'POST',
      body: { email: email.trim().toLowerCase(), password },
      auth: false,
    });
    tokens.set(result.access, result.refresh);
    const me = await api<CurrentUser>('/auth/me/');
    setUser(me);
    return me;
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
