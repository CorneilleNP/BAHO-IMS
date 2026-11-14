import { useCallback, useState } from 'react';
import { errorText } from './useApi';

/**
 * Saving + error state for a form submit, shared by every form.
 *
 *   const submit = useSubmit();
 *   const saved = await submit.run(() => api('/x/', { method: 'POST', body }));
 *   if (saved) …   // undefined when it failed; submit.error holds the message
 */
export function useSubmit() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    setSaving(true);
    setError(null);
    try {
      return await action();
    } catch (err) {
      setError(errorText(err));
      return undefined;
    } finally {
      setSaving(false);
    }
  }, []);

  /** Show a validation message without calling the server. */
  const fail = useCallback((message: string) => {
    setError(message);
    return undefined;
  }, []);

  return { saving, error, run, fail, clearError: () => setError(null) };
}
