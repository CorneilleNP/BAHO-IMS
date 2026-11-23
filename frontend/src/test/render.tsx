import { MantineProvider } from '@mantine/core';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { CurrentUser } from '../lib/access';
import { AuthContext, type AuthContextValue } from '../lib/authContext';

export function fakeUser(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: 'u1',
    email: 'clerk@test.local',
    full_name: 'Test Clerk',
    phone: '',
    is_global: false,
    must_change_password: false,
    roles: [{ role: 'CWS_CLERK', role_name: 'CWS clerk', facility: { id: 'f1', code: 'GITOKI', name: 'Gitoki CWS', facility_type: 'CWS' } }],
    ...overrides,
  };
}

/** Render inside Mantine, a router and a fake signed-in user. */
export function renderWithApp(ui: ReactElement, { user = fakeUser(), auth = {}, path = '/' }: { user?: CurrentUser | null; auth?: Partial<AuthContextValue>; path?: string } = {}) {
  const value: AuthContextValue = {
    user,
    loading: false,
    login: async () => user as CurrentUser,
    logout: () => {},
    changePassword: async () => user as CurrentUser,
    ...auth,
  };
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[path]}>
        <AuthContext.Provider value={value}>{ui}</AuthContext.Provider>
      </MemoryRouter>
    </MantineProvider>,
  );
}
