import { createContext, useContext } from 'react';
import type { CurrentUser } from './access';

export interface AuthContextValue {
  user: CurrentUser | null;
  /** true while checking a saved session on page load */
  loading: boolean;
  login: (email: string, password: string) => Promise<CurrentUser>;
  logout: () => void;
  /** Changes the signed-in user's password; other sessions are signed out. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<CurrentUser>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
