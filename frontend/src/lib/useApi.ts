import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';
import { onDataSynced } from './offline/store';
import type { Paginated } from './types';

interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * GET `path` and keep the result in state. Pass null to skip (e.g. until a
 * station is chosen). Changing `path` refetches; call reload() after saving.
 */
export function useApi<T>(path: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for a new request
    setLoading(true);
    api<T>(path)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load data.');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [path, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  // Writes saved offline just reached the server: show the server's version.
  useEffect(() => onDataSynced(reload), [reload]);
  return { data: path ? data : null, loading: path ? loading : false, error, reload };
}

/** Results array from a paginated list endpoint (empty while loading). */
export function useList<T>(path: string | null) {
  const state = useApi<Paginated<T>>(path);
  return { ...state, items: state.data?.results ?? [], total: state.data?.count ?? 0 };
}

/** Build "?a=1&b=2", skipping empty values. */
export function query(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '' && value !== 'All') search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

/** Turn an API validation error into one readable sentence. */
export function errorText(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Something went wrong. Please try again.';
  const data = err.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const messages: string[] = [];
    Object.entries(data as Record<string, unknown>).forEach(([field, value]) => {
      const label = field === 'non_field_errors' || field === 'detail' ? '' : `${field.replace(/_/g, ' ')}: `;
      const flat = Array.isArray(value) ? value.flat(3) : [value];
      flat.forEach((item) => {
        if (typeof item === 'string') messages.push(`${label}${item}`);
        else if (item && typeof item === 'object') {
          Object.values(item as Record<string, unknown>).flat(2).forEach((nested) => {
            if (typeof nested === 'string') messages.push(`${label}${nested}`);
          });
        }
      });
    });
    if (messages.length) return messages.join(' · ');
  }
  if (Array.isArray(data) && typeof data[0] === 'string') return data.join(' · ');
  return err.message;
}
