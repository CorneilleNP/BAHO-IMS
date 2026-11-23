import { ActionIcon, Avatar, Group, Menu, Text } from '@mantine/core';
import { IconCloudUpload, IconKey, IconLogout, IconMenu2 } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import type { CurrentUser } from '../../lib/access';
import { SyncIndicator } from '../SyncIndicator';

interface MobileAppBarProps {
  title: string;
  user: CurrentUser;
  /** Opens the full menu (drawer). Hidden when there is no menu, e.g. the section chooser. */
  onMenu?: () => void;
  onSignOut: () => void;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

/** Phone header: menu, current page title, sync status and the account menu. */
export function MobileAppBar({ title, user, onMenu, onSignOut }: MobileAppBarProps) {
  const navigate = useNavigate();
  const role = user.roles[0];

  return (
    <Group h="100%" px="sm" justify="space-between" wrap="nowrap" gap="xs">
      <Group gap={6} wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
        {onMenu ? (
          <ActionIcon variant="subtle" color="dark" size="lg" radius="xl" onClick={onMenu} aria-label="Open menu">
            <IconMenu2 size={22} />
          </ActionIcon>
        ) : (
          <img src="/baho-image.jpg" alt="Baho" style={{ height: 36, width: 'auto', borderRadius: 8 }} />
        )}
        <Text fw={700} size="lg" lineClamp={1} style={{ minWidth: 0 }}>
          {title}
        </Text>
      </Group>

      <Group gap={8} wrap="nowrap">
        <SyncIndicator compact />
        <Menu position="bottom-end" shadow="md" width={240} withinPortal>
          <Menu.Target>
            <ActionIcon variant="transparent" size="lg" radius="xl" aria-label="Account">
              <Avatar size={34} radius="xl" color="teal" variant="filled">
                {initials(user.full_name) || '?'}
              </Avatar>
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>
              <Text size="sm" fw={700} c="dark">{user.full_name}</Text>
              <Text size="xs" c="dimmed" lineClamp={2}>
                {role ? (role.facility ? `${role.role_name} · ${role.facility.name}` : role.role_name) : user.email}
              </Text>
            </Menu.Label>
            <Menu.Divider />
            <Menu.Item leftSection={<IconCloudUpload size={16} />} onClick={() => navigate('/sync')}>
              Sync & offline
            </Menu.Item>
            <Menu.Item leftSection={<IconKey size={16} />} onClick={() => navigate('/account/password')}>
              Change password
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item color="red" leftSection={<IconLogout size={16} />} onClick={onSignOut}>
              Sign out
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
    </Group>
  );
}
