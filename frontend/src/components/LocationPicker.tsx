import { useEffect, useRef, useState } from 'react';
import { Autocomplete, Fieldset, Select, SimpleGrid, Skeleton, Stack } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { api } from '../lib/api';
import { LOCATION_LEVELS, type LocationLevel, type LocationPath, type LocationUnit } from '../lib/types';
import { useApi } from '../lib/useApi';

const LEVEL_LABELS: Record<LocationLevel, string> = {
  PROVINCE: 'Province',
  DISTRICT: 'District',
  SECTOR: 'Sector',
  CELL: 'Cell',
  VILLAGE: 'Village',
};

interface LocationPickerProps {
  /** Id of the selected admin unit (any level), or null. */
  value: string | null;
  onChange: (unitId: string | null) => void;
  /** Deepest level offered. Default VILLAGE; use DISTRICT for e.g. suppliers known only by district. */
  depth?: LocationLevel;
  legend?: string;
  /** Show the "find village" quick search above the dropdowns. */
  searchable?: boolean;
  disabled?: boolean;
}

type Selection = Array<string | null>; // one id per level, top-down

/**
 * The one Rwanda location input used everywhere (farmers, suppliers, stations).
 * Cascading Province > District > Sector > Cell > Village; the value is the
 * most precise unit chosen, so partial locations (e.g. district only) are fine.
 */
export function LocationPicker({ value, onChange, depth = 'VILLAGE', legend = 'Location', searchable = true, disabled }: LocationPickerProps) {
  const levels = LOCATION_LEVELS.slice(0, LOCATION_LEVELS.indexOf(depth) + 1);
  const [selection, setSelection] = useState<Selection>(() => levels.map(() => null));
  const emitted = useRef<string | null>(null);

  // Value set from outside (edit form / search hit / form reset): rebuild the dropdowns from its path.
  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    if (!value) {
      setSelection(levels.map(() => null));
      return;
    }
    let cancelled = false;
    api<LocationPath>(`/organization/admin-units/${value}/path/`)
      .then((path) => {
        if (!cancelled) setSelection(levels.map((level) => path[level.toLowerCase() as keyof LocationPath]?.id ?? null));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // levels is derived from `depth`, which is fixed per form
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function choose(index: number, id: string | null) {
    const next = selection.map((current, i) => (i < index ? current : i === index ? id : null));
    setSelection(next);
    const deepest = [...next].reverse().find(Boolean) ?? null;
    emitted.current = deepest;
    onChange(deepest);
  }

  return (
    <Fieldset legend={legend} variant="filled" radius="md" disabled={disabled}>
      <Stack gap="sm">
        {searchable && <LocationSearch depth={depth} onPick={(id) => onChange(id)} />}
        <SimpleGrid cols={{ base: 1, xs: 2, md: levels.length > 3 ? 3 : levels.length }} spacing="sm">
          {levels.map((level, index) => (
            <LevelSelect
              key={level}
              level={level}
              parentId={index === 0 ? undefined : selection[index - 1]}
              value={selection[index]}
              onChange={(id) => choose(index, id)}
            />
          ))}
        </SimpleGrid>
      </Stack>
    </Fieldset>
  );
}

function LevelSelect({
  level,
  parentId,
  value,
  onChange,
}: {
  level: LocationLevel;
  /** undefined = top level (provinces); null = parent not chosen yet. */
  parentId: string | null | undefined;
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const path = parentId === undefined ? '/organization/admin-units/' : parentId ? `/organization/admin-units/?parent=${parentId}` : null;
  const { data, loading } = useApi<LocationUnit[]>(path);
  const label = LEVEL_LABELS[level];

  if (loading && !data) {
    return (
      <Stack gap={6}>
        <Skeleton height={12} width="35%" radius="sm" />
        <Skeleton height={36} radius="md" />
      </Stack>
    );
  }

  return (
    <Select
      label={label}
      placeholder={path ? `Choose ${label.toLowerCase()}` : `Choose ${parentLabel(level)} first`}
      data={(data ?? []).map((unit) => ({ value: unit.id, label: unit.name }))}
      value={value}
      onChange={onChange}
      disabled={!path}
      searchable
      clearable
      nothingFoundMessage={`No ${label.toLowerCase()} found`}
    />
  );
}

function parentLabel(level: LocationLevel): string {
  const parent = LOCATION_LEVELS[LOCATION_LEVELS.indexOf(level) - 1];
  return parent ? LEVEL_LABELS[parent].toLowerCase() : '';
}

/** Type a village (or other unit) name and jump straight to it. */
function LocationSearch({ depth, onPick }: { depth: LocationLevel; onPick: (id: string) => void }) {
  const [text, setText] = useState('');
  const [hits, setHits] = useState<Array<{ id: string; label: string }>>([]);

  useEffect(() => {
    const term = text.trim();
    if (term.length < 3) return;
    const timer = setTimeout(() => {
      api<Array<{ id: string; label: string }>>(`/organization/admin-units/?search=${encodeURIComponent(term)}&level=${depth}`)
        .then(setHits)
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [text, depth]);

  const shown = text.trim().length < 3 ? [] : hits;

  return (
    <Autocomplete
      aria-label={`Find ${LEVEL_LABELS[depth].toLowerCase()}`}
      placeholder={`Find ${LEVEL_LABELS[depth].toLowerCase()} by name…`}
      leftSection={<IconSearch size={14} />}
      value={text}
      // Mantine reports the picked option as a change right after onOptionSubmit;
      // ignore it so the box clears once the dropdowns below are filled.
      onChange={(next) => setText(shown.some((hit) => hit.id === next || hit.label === next) ? '' : next)}
      data={shown.map((hit) => ({ value: hit.id, label: hit.label }))}
      filter={({ options }) => options}
      onOptionSubmit={(id) => {
        onPick(id);
        setText('');
        setHits([]);
      }}
    />
  );
}
