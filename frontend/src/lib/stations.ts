import { useEffect, useMemo, useState } from 'react';
import { useAuth } from './authContext';
import type { Facility, Paginated } from './types';
import { useApi } from './useApi';

/**
 * CWS stations the signed-in user works at (all of them for HQ/global roles),
 * plus the currently selected one. The selection is remembered per browser.
 */
export function useMyStations() {
  const { user } = useAuth();
  const { data, loading, error } = useApi<Paginated<Facility>>(
    '/organization/facilities/?facility_type=CWS&is_active=true&page_size=200',
  );

  const stations = useMemo(() => {
    const all = data?.results ?? [];
    if (!user || user.is_global) return all;
    const mine = new Set(user.roles.map((r) => r.facility?.id).filter(Boolean));
    return all.filter((station) => mine.has(station.id));
  }, [data, user]);

  const [stationId, setStationId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('baho.station');
    } catch {
      return null;
    }
  });

  // Fall back to the first station when nothing (or a station the user lost) is selected.
  const selected = stations.find((s) => s.id === stationId) ?? stations[0] ?? null;

  useEffect(() => {
    if (!selected) return;
    try {
      localStorage.setItem('baho.station', selected.id);
    } catch {
      // storage unavailable: selection just isn't remembered
    }
  }, [selected]);

  return {
    stations,
    station: selected,
    setStationId,
    loading,
    error,
    options: stations.map((s) => ({ value: s.id, label: s.name })),
  };
}
