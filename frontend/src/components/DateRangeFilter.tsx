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

/** One date-range filter for every list and dashboard, with quick presets. */
export function DateRangeFilter({ value, onChange, label = 'Dates', w = 260 }: DateRangeFilterProps) {
  const today = dayjs();
  return (
    <DatePickerInput
      type="range"
      label={label}
      placeholder="Any date"
      value={value}
      onChange={(next) => onChange([next[0] ?? null, next[1] ?? null] as DateRange)}
      allowSingleDateInRange
      clearable
      valueFormat="DD MMM YYYY"
      leftSection={<IconCalendar size={16} />}
      w={w}
      presets={[
        { value: [fmt(today), fmt(today)], label: 'Today' },
        { value: [fmt(today.subtract(6, 'day')), fmt(today)], label: 'Last 7 days' },
        { value: [fmt(today.startOf('month')), fmt(today)], label: 'This month' },
        { value: [fmt(today.subtract(1, 'month').startOf('month')), fmt(today.subtract(1, 'month').endOf('month'))], label: 'Last month' },
        { value: [fmt(today.startOf('year')), fmt(today)], label: 'This season' },
      ]}
    />
  );
}
