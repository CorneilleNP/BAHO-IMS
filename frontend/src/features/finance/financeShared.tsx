// Finance UI pieces shared by the pages: balances and the station filter.
import { Select, Text, type TextProps } from '@mantine/core';
import { num } from '../../lib/format';
import { useMyStations } from '../../lib/stations';
import { money, moneyRwf } from './financeUtils';

/** A balance: red with a minus sign when the station has spent more than it was given. */
export function Balance({ value, suffix = true, ...props }: { value: string | number | null | undefined; suffix?: boolean } & TextProps) {
  const negative = num(value) < 0;
  return (
    <Text span inherit c={negative ? 'red.7' : undefined} fw={negative ? 700 : undefined} {...props}>
      {suffix ? moneyRwf(value) : money(value)}
    </Text>
  );
}

/** CWS station picker: "All stations" (cleared) when the user sees several. */
export function StationFilter({
  value,
  onChange,
  label = 'CWS station',
  w = 230,
  allowAll = true,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  label?: string;
  w?: number;
  allowAll?: boolean;
}) {
  const stations = useMyStations();
  const many = stations.options.length > 1;
  return (
    <Select
      label={label}
      placeholder={stations.loading ? 'Loading…' : many && allowAll ? 'All stations' : 'Choose a station'}
      data={stations.options}
      value={value}
      onChange={onChange}
      clearable={many && allowAll}
      searchable
      w={w}
    />
  );
}
