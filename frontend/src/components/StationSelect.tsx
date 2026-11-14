import { Select, Skeleton, Stack } from '@mantine/core';
import type { useMyStations } from '../lib/stations';

/** Station switcher for CWS pages. Pass the result of useMyStations(). */
export function StationSelect({ stations }: { stations: ReturnType<typeof useMyStations> }) {
  if (stations.loading && !stations.station) {
    return (
      <Stack gap={6} w={240}>
        <Skeleton height={12} width="30%" radius="sm" />
        <Skeleton height={36} radius="md" />
      </Stack>
    );
  }
  if (!stations.station) return null;
  return (
    <Select
      label="Station"
      data={stations.options}
      value={stations.station.id}
      onChange={(id) => id && stations.setStationId(id)}
      allowDeselect={false}
      disabled={stations.options.length <= 1}
      w={240}
    />
  );
}
