import { useState } from 'react';
import { Button, Card, CloseButton, Group, Image, Stack, Text } from '@mantine/core';
import { IconDownload, IconShare2, IconSquarePlus } from '@tabler/icons-react';
import { promptInstall, useInstallState } from '../lib/pwa';

const DISMISS_KEY = 'baho.installCard.dismissed';

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * "Install Baho IMS on this device". Shown only in a browser that can install
 * the website as an app (and not when it is already installed / the Android app).
 * `dismissible`: a close button hides it for good on this device.
 */
export function InstallAppCard({ dismissible = false }: { dismissible?: boolean }) {
  const { canPrompt, iosManual } = useInstallState();
  const [hidden, setHidden] = useState(() => dismissible && wasDismissed());
  if (hidden || (!canPrompt && !iosManual)) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // storage unavailable: hidden until the page reloads
    }
    setHidden(true);
  };

  return (
    <Card padding="lg">
      <Group align="flex-start" wrap="nowrap" gap="md">
        <Image src="/pwa-192.png" alt="" w={52} h={52} radius="md" style={{ flex: 'none', border: '1px solid var(--baho-border)' }} />
        <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
          <Text fw={700}>Install Baho IMS on this device</Text>
          {canPrompt ? (
            <>
              <Text size="sm" c="dimmed">
                Opens from your home screen or desktop like an app, full screen, and starts even without internet.
              </Text>
              <Group>
                <Button leftSection={<IconDownload size={16} />} onClick={() => void promptInstall()}>
                  Install app
                </Button>
              </Group>
            </>
          ) : (
            <Text size="sm" c="dimmed">
              In Safari, tap <IconShare2 size={15} style={{ verticalAlign: '-2px' }} /> <b>Share</b>, then{' '}
              <IconSquarePlus size={15} style={{ verticalAlign: '-2px' }} /> <b>Add to Home Screen</b>. It then opens like an app and starts
              even without internet.
            </Text>
          )}
        </Stack>
        {dismissible && <CloseButton aria-label="Hide" onClick={dismiss} />}
      </Group>
    </Card>
  );
}
