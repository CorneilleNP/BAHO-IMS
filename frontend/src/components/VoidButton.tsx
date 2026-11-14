import { useState } from 'react';
import { ActionIcon, Tooltip } from '@mantine/core';
import { IconBan } from '@tabler/icons-react';
import { api } from '../lib/api';
import { confirmAction } from '../lib/confirm';
import { toast } from '../lib/toast';
import { errorText } from '../lib/useApi';

interface VoidButtonProps {
  /** API path of the record, e.g. `/reception/receipts/<id>/` (the `void/` action is appended). */
  path: string;
  /** What is being voided, e.g. "GRN GITOKI-2026-00001". */
  label: string;
  onDone: () => void;
}

/** Row action: confirm with a mandatory reason, void (soft delete), toast, refresh. */
export function VoidButton({ path, label, onDone }: VoidButtonProps) {
  const [busy, setBusy] = useState(false);

  async function handle() {
    const reason = await confirmAction({
      title: `Void ${label}?`,
      message: 'It will disappear from lists and totals but stays in the records for audit. Its number is not reused.',
      confirmLabel: 'Void',
      danger: true,
      requireReason: true,
    });
    if (reason === null) return;
    setBusy(true);
    try {
      await api(`${path}void/`, { method: 'POST', body: { reason } });
      toast.success(`${label} was voided.`, 'Voided');
      onDone();
    } catch (err) {
      toast.error(errorText(err), `Could not void ${label}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Tooltip label="Void" withArrow>
      <ActionIcon variant="subtle" color="red" aria-label={`Void ${label}`} loading={busy} onClick={handle}>
        <IconBan size={16} />
      </ActionIcon>
    </Tooltip>
  );
}
