import { Drawer, SimpleGrid, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconLogout } from '@tabler/icons-react';
import type { ComponentType } from 'react';

export interface MoreItem {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number; stroke?: number }>;
}

interface MobileMoreSheetProps {
  opened: boolean;
  onClose: () => void;
  /** Groups of screens not on the bottom bar (current section first, then others, then account). */
  groups: Array<{ label: string; items: MoreItem[] }>;
  activePath: string;
  onNavigate: (to: string) => void;
  onSignOut: () => void;
}

/** "More" on phones: a bottom sheet of large icon tiles for everything not on the bottom bar. */
export function MobileMoreSheet({ opened, onClose, groups, activePath, onNavigate, onSignOut }: MobileMoreSheetProps) {
  const tile = (key: string, label: string, Icon: MoreItem['icon'], active: boolean, onClick: () => void, danger = false) => (
    <UnstyledButton
      key={key}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        padding: '14px 6px',
        borderRadius: 16,
        background: active ? 'var(--mantine-color-baho-0)' : '#f6f8f7',
        border: active ? '1px solid var(--mantine-color-baho-2)' : '1px solid transparent',
        textAlign: 'center',
      }}
    >
      <span
        style={{
          display: 'grid',
          placeItems: 'center',
          width: 44,
          height: 44,
          borderRadius: 14,
          background: danger ? '#fdecec' : active ? 'var(--mantine-color-baho-7)' : '#fff',
          color: danger ? '#c92a2a' : active ? '#fff' : 'var(--mantine-color-baho-7)',
          boxShadow: active || danger ? 'none' : '0 1px 3px rgba(16, 35, 28, 0.08)',
        }}
      >
        <Icon size={22} stroke={1.8} />
      </span>
      <Text size="xs" fw={600} lh={1.2} c={danger ? 'red.8' : 'dark.6'} lineClamp={2}>
        {label}
      </Text>
    </UnstyledButton>
  );

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="bottom"
      size="auto"
      radius="xl"
      title="More"
      styles={{
        // As tall as its tiles (a real bottom sheet), never more than most of the screen.
        content: {
          height: 'auto',
          maxHeight: '88dvh',
          flex: 'none',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingBottom: 'env(safe-area-inset-bottom)',
        },
        body: { paddingBottom: 24 },
      }}
    >
      <Stack gap="lg">
        {groups
          .filter((group) => group.items.length > 0)
          .map((group) => (
            <div key={group.label}>
              <Text size="11px" fw={700} c="gray.6" tt="uppercase" lts={0.6} mb={8}>
                {group.label}
              </Text>
              <SimpleGrid cols={3} spacing="sm">
                {group.items.map((item) =>
                  tile(item.to, item.label, item.icon, activePath === item.to, () => {
                    onClose();
                    onNavigate(item.to);
                  }),
                )}
              </SimpleGrid>
            </div>
          ))}
        <SimpleGrid cols={3} spacing="sm">
          {tile('sign-out', 'Sign out', IconLogout, false, () => {
            onClose();
            onSignOut();
          }, true)}
        </SimpleGrid>
      </Stack>
    </Drawer>
  );
}
