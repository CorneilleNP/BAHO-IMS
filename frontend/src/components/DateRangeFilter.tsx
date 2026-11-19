import { Group, Select, Stack, Text } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconCalendar } from '@tabler/icons-react';
import dayjs from 'dayjs';
import type { DateRange } from '../lib/format';

const fmt = (d: dayjs.Dayjs) => d.format('YYYY-MM-DD');

interface DateRangeFilterProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  label?: string;
  w?: number;
}

function presets(today: dayjs.Dayjs) {
  return [
    { value: 'today', label: 'Today', range: [fmt(today), fmt(today)] as DateRange },
    { value: '7d', label: 'Last 7 days', range: [fmt(today.subtract(6, 'day')), fmt(today)] as DateRange },
    { value: 'month', label: 'This month', range: [fmt(today.startOf('month')), fmt(today)] as DateRange },
    {
      value: 'last-month',
      label: 'Last month',
      range: [fmt(today.subtract(1, 'month').startOf('month')), fmt(today.subtract(1, 'month').endOf('month'))] as DateRange,
    },
    { value: 'season', label: 'This season', range: [fmt(today.startOf('year')), fmt(today)] as DateRange },
  ];
}

/** One date-range filter for every list and dashboard: an explicit "From" / "To" pair, plus quick presets. */
export function DateRangeFilter({ value, onChange, label = 'Dates', w = 160 }: DateRangeFilterProps) {
  const [from, to] = value;
  const quickRanges = presets(dayjs());

  return (
    <Stack gap={4}>
      <Text size="sm" fw={500}>{label}</Text>
      <Group gap="xs" align="flex-end" wrap="nowrap">
        <DatePickerInput
          aria-label={`${label} from`}
          placeholder="From"
          value={from}
          onChange={(d) => onChange([d, to])}
          clearable
          valueFormat="DD MMM YYYY"
          leftSection={<IconCalendar size={16} />}
          maxDate={to ?? undefined}
          w={w}
        />
        <DatePickerInput
          aria-label={`${label} to`}
          placeholder="To"
          value={to}
          onChange={(d) => onChange([from, d])}
          clearable
          valueFormat="DD MMM YYYY"
          leftSection={<IconCalendar size={16} />}
          minDate={from ?? undefined}
          w={w}
        />
        <Select
          aria-label={`${label} quick range`}
          placeholder="Quick range"
          data={quickRanges.map((p) => ({ value: p.value, label: p.label }))}
          value={null}
          onChange={(picked) => {
            const preset = quickRanges.find((p) => p.value === picked);
            if (preset) onChange(preset.range);
          }}
          w={132}
        />
      </Group>
    </Stack>
  );
}
