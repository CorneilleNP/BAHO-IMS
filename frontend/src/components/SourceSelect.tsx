import { Select } from '@mantine/core';
import { sourceOptions } from '../lib/sources';
import type { CoffeeSource } from '../lib/types';
import { useApi } from '../lib/useApi';

interface SourceSelectProps {
  /** "OWN_CWS:<id>" or "PARTNER_SUPPLIER:<id>"; turn into API fields with sourceFields(). */
  value: string | null;
  onChange: (value: string | null) => void;
  label?: string;
  required?: boolean;
}

/** Where coffee came from: a Baho CWS or a registered partner supplier (grouped). */
export function SourceSelect({ value, onChange, label = 'Source (CWS or supplier)', required }: SourceSelectProps) {
  const { data, loading } = useApi<CoffeeSource[]>('/drymill/sources/');
  return (
    <Select
      label={label}
      required={required}
      data={sourceOptions(data ?? [])}
      value={value}
      onChange={onChange}
      searchable
      placeholder={loading ? 'Loading sources…' : 'Choose source'}
      disabled={loading && !data}
      nothingFoundMessage="Not found: register the supplier first"
    />
  );
}
