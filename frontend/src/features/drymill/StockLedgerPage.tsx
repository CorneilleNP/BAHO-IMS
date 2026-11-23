import { useState } from 'react';
import { Badge, Card, Group, SegmentedControl, Select, SimpleGrid, Stack, Text } from '@mantine/core';
import { DataTable } from '../../components/DataTable';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import { KpiCard } from '../../components/KpiCard';
import { PageHeader } from '../../components/PageHeader';
import { SourceSelect } from '../../components/SourceSelect';
import { ANY_DATE, kg, num, type DateRange } from '../../lib/format';
import { sourceFields } from '../../lib/sources';
import type { CatalogProcess, ExportGrade, LedgerMovementType, LedgerRow, StockLedger } from '../../lib/types';
import { query, useApi } from '../../lib/useApi';

const MOVEMENT_COLOR: Record<LedgerMovementType, string> = {
  RECEIVED: 'teal',
  GREEN_PRODUCED: 'teal',
  MILLED: 'orange',
  SHIPPED: 'blue',
  ADJUSTMENT: 'grape',
};

/** Every parchment / green coffee movement at HQ with a running balance. Calculated from the records; nothing typed in. */
export function StockLedgerPage() {
  const [item, setItem] = useState<'PARCH' | 'GREEN'>('PARCH');
  const [dates, setDates] = useState<DateRange>(ANY_DATE);
  const [process, setProcess] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [grade, setGrade] = useState<string | null>(null);
  const processes = useApi<CatalogProcess[]>('/processing/catalog/processes/');
  const grades = useApi<ExportGrade[] | { results: ExportGrade[] }>('/drymill/export-grades/');
  const gradeList = Array.isArray(grades.data) ? grades.data : grades.data?.results ?? [];
  const src = sourceFields(source);

  const ledger = useApi<StockLedger>(
    `/inventory/ledger/${query({
      item_type: item,
      date_from: dates[0],
      date_to: dates[1],
      process,
      source_facility: src?.source_facility,
      source_supplier: src?.source_supplier,
      export_grade: item === 'GREEN' ? grade : null,
    })}`,
  );
  const data = ledger.data;

  return (
    <Stack gap="lg" maw={1400}>
      <PageHeader
        eyebrow="Dry mill"
        title="Stock Ledger"
        description="Every movement in and out of HQ stock, oldest first, with the running balance after each one. Voided records are left out."
      />
      <Card withBorder radius="md" p="lg">
        <Group align="flex-end" gap="md">
          <Stack gap={4}>
            <Text size="sm" fw={500}>Stock</Text>
            <SegmentedControl value={item} onChange={(v) => setItem(v as 'PARCH' | 'GREEN')} data={[{ value: 'PARCH', label: 'Parchment' }, { value: 'GREEN', label: 'Green coffee' }]} />
          </Stack>
          <DateRangeFilter value={dates} onChange={setDates} />
          <Select
            label="Process"
            placeholder="All processes"
            data={(processes.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
            value={process}
            onChange={setProcess}
            clearable
            w={200}
          />
          <div style={{ width: 240 }}>
            <SourceSelect value={source} onChange={setSource} label="Source" />
          </div>
          {item === 'GREEN' && (
            <Select label="Export grade" placeholder="All grades" data={gradeList.map((g) => ({ value: g.id, label: g.name }))} value={grade} onChange={setGrade} clearable w={160} />
          )}
        </Group>
      </Card>

      <SimpleGrid cols={{ base: 2, md: 4 }}>
        <KpiCard label="Opening balance" value={`${kg(data?.opening_balance)} kg`} loading={ledger.loading && !data} />
        <KpiCard label="In" value={`${kg(data?.total_in)} kg`} loading={ledger.loading && !data} accent="teal" />
        <KpiCard label="Out" value={`${kg(data?.total_out)} kg`} loading={ledger.loading && !data} accent="orange" />
        <KpiCard label="Closing balance" value={`${kg(data?.closing_balance)} kg`} loading={ledger.loading && !data} />
      </SimpleGrid>

      <Card withBorder radius="md" p="lg">
        <DataTable<LedgerRow>
          rows={data?.rows ?? []}
          rowKey={(r) => `${r.movement_type}-${r.reference_id}-${r.date}-${r.export_grade}-${r.qty_in}-${r.qty_out}-${r.description}`}
          loading={ledger.loading}
          error={ledger.error}
          minWidth={1150}
          empty={{ title: 'No movements', hint: 'Nothing moved for these filters.' }}
          exportName={`stock-ledger-${item.toLowerCase()}`}
          columnsKey="stock-ledger"
          columns={[
            { key: 'date', header: 'Date', nowrap: true, render: (r) => r.date },
            {
              key: 'type',
              header: 'Movement',
              nowrap: true,
              exportValue: (r) => r.movement_label,
              render: (r) => <Badge color={MOVEMENT_COLOR[r.movement_type]} variant="light">{r.movement_label}</Badge>,
            },
            { key: 'ref', header: 'Reference', mono: true, render: (r) => r.reference },
            { key: 'desc', header: 'Details', render: (r) => r.description || '—' },
            { key: 'process', header: 'Process', render: (r) => [r.process, r.sub_process].filter(Boolean).join(' · ') || '—' },
            { key: 'grade', header: 'Grade', render: (r) => r.export_grade || '—', optional: item === 'PARCH' },
            { key: 'source', header: 'Source', render: (r) => r.source || '—' },
            { key: 'in', header: 'In (kg)', align: 'right', render: (r) => (num(r.qty_in) ? kg(r.qty_in) : ''), exportValue: (r) => num(r.qty_in) },
            { key: 'out', header: 'Out (kg)', align: 'right', render: (r) => (num(r.qty_out) ? kg(r.qty_out) : ''), exportValue: (r) => num(r.qty_out) },
            { key: 'balance', header: 'Balance (kg)', align: 'right', render: (r) => <Text fw={600} size="sm">{kg(r.balance)}</Text>, exportValue: (r) => num(r.balance) },
          ]}
        />
      </Card>
    </Stack>
  );
}
