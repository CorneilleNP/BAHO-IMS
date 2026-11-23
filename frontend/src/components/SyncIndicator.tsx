import { Badge, Loader, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconCloudCheck, IconCloudOff, IconCloudUpload } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useSyncStatus } from '../lib/offline/useSyncStatus';

/** Header badge: offline / N waiting / problems / synced. Opens the Sync screen.
 *  `compact` (phone app bar): icon plus a count, no words. */
export function SyncIndicator({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  const { online, syncing, pending, failed } = useSyncStatus();

  let color = 'teal';
  let label = 'Synced';
  let icon = <IconCloudCheck size={14} />;
  let hint = 'Everything saved on this device has reached the server.';
  if (failed > 0) {
    color = 'red';
    label = `${failed} not sent`;
    icon = <IconAlertTriangle size={14} />;
    hint = 'The server refused some saves. Open to see why and retry or discard them.';
  } else if (!online) {
    color = 'gray';
    label = pending ? `Offline · ${pending} waiting` : 'Offline';
    icon = <IconCloudOff size={14} />;
    hint = 'No connection. You can keep working: saves stay on this device and are sent automatically when you are back online.';
  } else if (pending > 0) {
    color = 'yellow';
    label = `${pending} waiting`;
    icon = syncing ? <Loader size={12} color="yellow" /> : <IconCloudUpload size={14} />;
    hint = 'Sending saves made offline…';
  }

  const short = failed > 0 ? String(failed) : pending > 0 ? String(pending) : !online ? 'Offline' : '';

  return (
    <Tooltip label={hint} multiline w={260} withArrow disabled={compact}>
      <Badge
        component="button"
        type="button"
        onClick={() => navigate('/sync')}
        color={color}
        variant="light"
        leftSection={icon}
        size={compact ? 'lg' : 'md'}
        style={{ cursor: 'pointer', border: 'none', paddingInline: compact && !short ? 8 : undefined }}
        aria-label={label}
      >
        {compact ? short : label}
      </Badge>
    </Tooltip>
  );
}
