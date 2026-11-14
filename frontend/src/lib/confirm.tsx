import { Stack, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { ReasonField } from '../components/ReasonField';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  /** Red confirm button for destructive actions (void, delete). */
  danger?: boolean;
  /** Ask for a reason (required, min 3 characters), e.g. why a GRN is voided. */
  requireReason?: boolean;
}

/**
 * Ask the user to confirm. Resolves with the reason ('' when no reason was
 * asked) or null if they cancelled.
 *
 *   const reason = await confirmAction({ title: 'Void GRN?', message: '…', danger: true, requireReason: true });
 *   if (reason === null) return;
 */
export function confirmAction({ title, message, confirmLabel = 'Confirm', danger = false, requireReason = false }: ConfirmOptions): Promise<string | null> {
  return new Promise((resolve) => {
    let reason = '';
    let showError = () => {};
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const id = modals.openConfirmModal({
      title,
      centered: true,
      closeOnConfirm: false,
      labels: { confirm: confirmLabel, cancel: 'Cancel' },
      confirmProps: { color: danger ? 'red' : undefined },
      children: (
        <Stack gap="sm">
          <Text size="sm">{message}</Text>
          {requireReason && (
            <ReasonField
              onChange={(next) => {
                reason = next;
              }}
              registerShowError={(show) => {
                showError = show;
              }}
            />
          )}
        </Stack>
      ),
      onCancel: () => finish(null),
      onClose: () => finish(null),
      onConfirm: () => {
        if (requireReason && reason.trim().length < 3) {
          showError();
          return;
        }
        finish(requireReason ? reason.trim() : '');
        modals.close(id);
      },
    });
  });
}
