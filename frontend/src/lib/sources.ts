import type { CoffeeSource, OriginType } from './types';

/** Select options for coffee sources, grouped as Baho CWS / partner suppliers. Value = "TYPE:id". */
export function sourceOptions(sources: CoffeeSource[]) {
  const group = (type: OriginType) =>
    sources.filter((s) => s.origin_type === type).map((s) => ({ value: `${s.origin_type}:${s.id}`, label: s.name }));
  return [
    { group: 'Baho CWS', items: group('OWN_CWS') },
    { group: 'Partner suppliers', items: group('PARTNER_SUPPLIER') },
  ].filter((g) => g.items.length > 0);
}

/** Turn a "TYPE:id" select value into the API's origin fields. */
export function sourceFields(value: string | null) {
  if (!value) return null;
  const [origin_type, id] = value.split(':') as [OriginType, string];
  return origin_type === 'OWN_CWS'
    ? { origin_type, source_facility: id, source_supplier: null }
    : { origin_type, source_facility: null, source_supplier: id };
}
