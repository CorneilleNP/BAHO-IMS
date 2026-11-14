import { useEffect, useState } from 'react';
import { Textarea } from '@mantine/core';

interface ReasonFieldProps {
  onChange: (reason: string) => void;
  /** Receives a function the dialog calls to show "reason required". */
  registerShowError: (show: () => void) => void;
}

/** Required "Reason" box inside confirmation dialogs (e.g. voiding a GRN). */
export function ReasonField({ onChange, registerShowError }: ReasonFieldProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    registerShowError(() => setError('Please give a reason (at least 3 characters).'));
  }, [registerShowError]);

  return (
    <Textarea
      label="Reason"
      required
      autosize
      minRows={2}
      data-autofocus
      value={value}
      error={error}
      onChange={(event) => {
        const next = event.currentTarget.value;
        setValue(next);
        onChange(next);
        if (error && next.trim().length >= 3) setError(null);
      }}
    />
  );
}
