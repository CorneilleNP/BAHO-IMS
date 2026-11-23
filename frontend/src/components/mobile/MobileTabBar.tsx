import { Group, Text, UnstyledButton } from '@mantine/core';
import { IconDots } from '@tabler/icons-react';
import type { ComponentType } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export interface MobileTab {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number; stroke?: number }>;
}

interface MobileTabBarProps {
  /** The section's main screens (up to 4); everything else is under "More". */
  tabs: MobileTab[];
  onMore: () => void;
}

/** Phone bottom navigation: main screens of the current section + "More" (opens the full menu). */
export function MobileTabBar({ tabs, onMore }: MobileTabBarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const items = tabs.slice(0, 4);

  const tab = (key: string, label: string, Icon: MobileTab['icon'], active: boolean, onClick: () => void) => (
    <UnstyledButton
      key={key}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '6px 2px' }}
    >
      <span
        style={{
          display: 'grid',
          placeItems: 'center',
          width: 56,
          height: 30,
          borderRadius: 999,
          background: active ? 'rgba(11, 91, 64, 0.12)' : 'transparent',
          color: active ? '#0b5b40' : '#5f6b66',
          transition: 'background 120ms ease',
        }}
      >
        <Icon size={22} stroke={active ? 2.2 : 1.7} />
      </span>
      <Text size="11px" fw={active ? 700 : 500} c={active ? '#0b5b40' : '#5f6b66'} lineClamp={1}>
        {label}
      </Text>
    </UnstyledButton>
  );

  return (
    <Group
      h="100%"
      gap={0}
      wrap="nowrap"
      px={4}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {items.map((t) => tab(t.to, t.label, t.icon, location.pathname === t.to, () => navigate(t.to)))}
      {tab('more', 'More', IconDots, false, onMore)}
    </Group>
  );
}
