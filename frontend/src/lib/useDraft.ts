import { useCallback, useEffect, useState } from 'react';

/**
 * Form state that survives closing the wizard by accident or reloading the page.
 * Pass key = null to keep it in memory only (e.g. when editing an existing record).
 */
export function useDraft<T>(key: string | null, initial: () => T) {
  const storageKey = key ? `baho.draft.${key}` : null;
  const [value, setValue] = useState<T>(() => {
    if (storageKey) {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) return { ...initial(), ...JSON.parse(saved) } as T;
      } catch {
        // unreadable draft: start fresh
      }
    }
    return initial();
  });

  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // storage full/blocked: draft just isn't kept
    }
  }, [storageKey, value]);

  const reset = useCallback(
    (next?: T) => {
      if (storageKey) {
        try {
          localStorage.removeItem(storageKey);
        } catch {
          // ignore
        }
      }
      setValue(next ?? initial());
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storageKey],
  );

  /** Update one field: set('grade')('A1'). */
  const set = useCallback(<K extends keyof T>(field: K) => (fieldValue: T[K]) => setValue((prev) => ({ ...prev, [field]: fieldValue })), []);

  return { value, setValue, set, reset };
}
