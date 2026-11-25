import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Modal,
  PasswordInput,
  Select,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { IconKey, IconPlus, IconTrash, IconUserPlus } from '@tabler/icons-react';
import { DataTable } from '../../components/DataTable';
import { EmptyState, ErrorMessage } from '../../components/Feedback';
import { PageHeader } from '../../components/PageHeader';
import { isAdmin } from '../../lib/access';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/authContext';
import { toast } from '../../lib/toast';
import type { Facility, ManagedUser, Paginated, RoleOption } from '../../lib/types';
import { query, useApi, useList } from '../../lib/useApi';
import { useSubmit } from '../../lib/useSubmit';

const URL = '/auth/users/';

interface RoleRow {
  role: string | null;
  facility: string | null;
}

function dateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'Never';
}

/** Role + station rows. HQ roles cover every station, so their station field is hidden. */
function RolesEditor({ value, onChange, roles, stations }: { value: RoleRow[]; onChange: (rows: RoleRow[]) => void; roles: RoleOption[]; stations: Facility[] }) {
  const isGlobal = (code: string | null) => roles.find((r) => r.code === code)?.is_global ?? false;
  const update = (index: number, patch: Partial<RoleRow>) => onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>Roles</Text>
      {value.map((row, index) => (
        <Group key={index} gap="xs" align="flex-end" wrap="nowrap">
          <Select
            aria-label="Role"
            placeholder="Role"
            data={roles.map((r) => ({ value: r.code, label: r.name }))}
            value={row.role}
            onChange={(role) => update(index, { role, facility: isGlobal(role) ? null : row.facility })}
            style={{ flex: 1 }}
          />
          {isGlobal(row.role) ? (
            <Text size="sm" c="dimmed" style={{ flex: 1 }} pb={8}>All stations</Text>
          ) : (
            <Select
              aria-label="Station"
              placeholder="Station"
              data={stations.map((s) => ({ value: s.id, label: s.name }))}
              value={row.facility}
              onChange={(facility) => update(index, { facility })}
              searchable
              style={{ flex: 1 }}
            />
          )}
          <ActionIcon variant="subtle" color="red" aria-label="Remove role" onClick={() => onChange(value.filter((_, i) => i !== index))} mb={4}>
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      ))}
      <Button variant="light" size="xs" leftSection={<IconPlus size={14} />} onClick={() => onChange([...value, { role: null, facility: null }])} w="fit-content">
        Add role
      </Button>
    </Stack>
  );
}

function rolesPayload(rows: RoleRow[]): string | Array<{ role: string; facility: string | null }> {
  const filled = rows.filter((r) => r.role);
  if (!filled.length) return 'Give the user at least one role.';
  return filled.map((r) => ({ role: r.role as string, facility: r.facility }));
}

function UserModal({ user, roles, stations, onClose, onSaved }: { user: ManagedUser | null; roles: RoleOption[]; stations: Facility[]; onClose: () => void; onSaved: () => void }) {
  const submit = useSubmit();
  const [email, setEmail] = useState(user?.email ?? '');
  const [firstName, setFirstName] = useState(user?.first_name ?? '');
  const [lastName, setLastName] = useState(user?.last_name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [password, setPassword] = useState('');
  const [active, setActive] = useState(user?.is_active ?? true);
  const [roleRows, setRoleRows] = useState<RoleRow[]>(
    user?.roles.map((r) => ({ role: r.role, facility: r.facility?.id ?? null })) ?? [{ role: null, facility: null }],
  );
  const [resetPassword, setResetPassword] = useState('');

  const save = async () => {
    if (!firstName.trim() && !lastName.trim()) return submit.fail('Enter a first name or a last name (at least one).');
    const rolesBody = rolesPayload(roleRows);
    if (typeof rolesBody === 'string') return submit.fail(rolesBody);
    const missingStation = rolesBody.some((r) => !roles.find((o) => o.code === r.role)?.is_global && !r.facility);
    if (missingStation) return submit.fail('Choose a station for every station role.');
    if (!user) {
      if (!email.trim()) return submit.fail('Enter the email address.');
      if (password.length < 8) return submit.fail('The temporary password needs at least 8 characters.');
    }
    const saved = await submit.run(() =>
      user
        ? api(`${URL}${user.id}/`, { method: 'PATCH', body: { first_name: firstName, last_name: lastName, phone, is_active: active, roles: rolesBody } })
        : api(URL, { method: 'POST', body: { email, first_name: firstName, last_name: lastName, phone, password, roles: rolesBody } }),
    );
    if (saved === undefined) return;
    toast.success(user ? 'User updated.' : 'User created. Give them the temporary password; they must change it when they sign in.');
    onSaved();
  };

  const reset = async () => {
    if (!user) return;
    if (resetPassword.length < 8) return submit.fail('The temporary password needs at least 8 characters.');
    const done = await submit.run(() => api(`${URL}${user.id}/reset-password/`, { method: 'POST', body: { new_password: resetPassword } }));
    if (done === undefined) return;
    toast.success(`Temporary password set for ${user.full_name}. They are signed out everywhere and must change it at next sign-in.`, 'Password reset');
    setResetPassword('');
    onSaved();
  };

  return (
    <Modal opened onClose={onClose} title={user ? `Edit ${user.full_name}` : 'New user'} size="lg">
      <Stack>
        <ErrorMessage>{submit.error}</ErrorMessage>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label="Email" type="email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} disabled={Boolean(user)} required data-autofocus={!user} />
          <TextInput label="First name" value={firstName} onChange={(e) => setFirstName(e.currentTarget.value)} />
          <TextInput label="Last name" value={lastName} onChange={(e) => setLastName(e.currentTarget.value)} />
          <TextInput label="Phone" placeholder="07…" value={phone} onChange={(e) => setPhone(e.currentTarget.value)} />
          {!user && (
            <PasswordInput label="Temporary password" description="They choose their own at first sign-in." value={password} onChange={(e) => setPassword(e.currentTarget.value)} required />
          )}
        </SimpleGrid>
        <RolesEditor value={roleRows} onChange={setRoleRows} roles={roles} stations={stations} />
        {user && <Switch label="Active (can sign in)" checked={active} onChange={(e) => setActive(e.currentTarget.checked)} />}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={submit.saving}>{user ? 'Save changes' : 'Create user'}</Button>
        </Group>
        {user && (
          <>
            <Divider label="Reset password" labelPosition="left" />
            <Group align="flex-end">
              <PasswordInput label="New temporary password" value={resetPassword} onChange={(e) => setResetPassword(e.currentTarget.value)} style={{ flex: 1 }} />
              <Button variant="light" color="orange" leftSection={<IconKey size={16} />} onClick={reset} loading={submit.saving}>
                Reset
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}

/** Admins create accounts, assign roles per station, deactivate and reset passwords. */
export function UsersPage() {
  const { user: me } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('true');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<{ user: ManagedUser | null } | null>(null);
  const users = useList<ManagedUser>(`${URL}${query({ search, is_active: status === 'all' ? null : status, page })}`);
  const roles = useApi<RoleOption[]>(`${URL}roles/`);
  const stations = useApi<Paginated<Facility>>('/organization/facilities/?facility_type=CWS&page_size=500&ordering=name');

  if (!isAdmin(me)) {
    return <EmptyState title="Administrators only">Only an administrator can manage user accounts.</EmptyState>;
  }

  return (
    <Stack gap="lg" maw={1200}>
      <PageHeader
        eyebrow="Administration"
        title="Users"
        description="Who can sign in, what they can do and at which stations."
        actions={<Button leftSection={<IconUserPlus size={16} />} onClick={() => setEditing({ user: null })}>New user</Button>}
      />
      <Card p="lg">
        <Stack>
          <Group align="flex-end">
            <TextInput label="Search" placeholder="Name, email or phone" value={search} onChange={(e) => { setSearch(e.currentTarget.value); setPage(1); }} w={280} />
            <SegmentedControl
              value={status}
              onChange={(v) => { setStatus(v); setPage(1); }}
              data={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }, { value: 'all', label: 'All' }]}
            />
          </Group>
          <DataTable
            rows={users.items}
            rowKey={(u) => u.id}
            loading={users.loading}
            error={users.error}
            minWidth={900}
            empty={{ title: 'No users match', hint: 'Change the search or the status filter.' }}
            exportName="users"
            onRowClick={(u) => setEditing({ user: u })}
            pagination={{ page, pageSize: 50, total: users.total, onChange: setPage }}
            columns={[
              { key: 'name', header: 'Name', render: (u) => u.full_name },
              { key: 'email', header: 'Email', render: (u) => u.email },
              { key: 'phone', header: 'Phone', render: (u) => u.phone || '—', optional: true },
              {
                key: 'roles',
                header: 'Roles',
                exportValue: (u) => u.roles.map((r) => (r.facility ? `${r.role_name} @ ${r.facility.name}` : r.role_name)).join('; '),
                render: (u) => (
                  <Group gap={4}>
                    {u.roles.map((r) => (
                      <Badge key={`${r.role}-${r.facility?.id ?? 'all'}`} variant="light" color={r.facility ? 'coffee' : 'teal'}>
                        {r.facility ? `${r.role_name} · ${r.facility.name}` : r.role_name}
                      </Badge>
                    ))}
                  </Group>
                ),
              },
              { key: 'last_login', header: 'Last sign-in', nowrap: true, render: (u) => dateTime(u.last_login) },
              {
                key: 'status',
                header: 'Status',
                nowrap: true,
                exportValue: (u) => (u.is_active ? (u.must_change_password ? 'Must change password' : 'Active') : 'Inactive'),
                render: (u) =>
                  !u.is_active ? (
                    <Badge color="gray" variant="light">Inactive</Badge>
                  ) : u.must_change_password ? (
                    <Badge color="yellow" variant="light">Temporary password</Badge>
                  ) : (
                    <Badge color="teal" variant="light">Active</Badge>
                  ),
              },
            ]}
          />
        </Stack>
      </Card>
      {editing && roles.data && (
        <UserModal
          key={editing.user?.id ?? 'new'}
          user={editing.user}
          roles={roles.data}
          stations={stations.data?.results ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            users.reload();
          }}
        />
      )}
    </Stack>
  );
}
