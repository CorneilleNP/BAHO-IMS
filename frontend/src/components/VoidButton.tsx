import { useState } from 'react';
import { ActionIcon, Tooltip } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { api } from '../lib/api';
import { confirmAction } from '../lib/confirm';
import { toast } from '../lib/toast';
import { errorText } from '../lib/useApi';

interface VoidButtonProps {
  /** API path of the record, e.g. `/reception/receipts/<id>/` (the `void/` action is appended). */
  path: string;
  /** What is being deleted, e.g. "GRN GITOKI-2026-00001". */
  label: string;
  onDone: () => void;
}

/**
 * Row "Delete" action: confirm with a mandatory reason, then move the record to
 * the Trash (the API's soft-delete `void/` action), toast, refresh.
 */
export function VoidButton({ path, label, onDone }: VoidButtonProps) {
  const [busy, setBusy] = useState(false);

  async function handle() {
    const reason = await confirmAction({
      title: `Delete ${label}?`,
      message: 'It disappears from lists and totals and goes to the Trash, where it is kept for about a day before being removed permanently. Its number is never reused.',
      confirmLabel: 'Delete',
      reasonLabel: 'Why are you deleting it?',
      danger: true,
      requireReason: true,
    });
    if (reason === null) return;
    setBusy(true);
    try {
      await api(`${path}void/`, { method: 'POST', body: { reason } });
      toast.success(`${label} was moved to the Trash.`, 'Deleted');
      onDone();
    } catch (err) {
      toast.error(errorText(err), `Could not delete ${label}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Tooltip label="Delete" withArrow>
      <ActionIcon variant="subtle" color="red" aria-label={`Delete ${label}`} loading={busy} onClick={handle}>
        <IconTrash size={16} />
      </ActionIcon>
    </Tooltip>
  );
}
