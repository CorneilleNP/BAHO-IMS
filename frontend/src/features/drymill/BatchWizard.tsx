import { useCallback, useEffect } from 'react';
import { ActionIcon, Autocomplete, Badge, Button, Card, Group, NumberInput, Select, SimpleGrid, Stack, Table, Text, TextInput } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { FormWizard } from '../../components/FormWizard';
import { FormSkeleton } from '../../components/Skeletons';
import { api } from '../../lib/api';
import { calculateOutturnPct, kg, num, pct, today } from '../../lib/format';
import { sourceFields, sourceOptions } from '../../lib/sources';
import { toast } from '../../lib/toast';
import type { CatalogProcess, CatalogSubProcess, CoffeeSource, DryMillBatch, ExportGrade } from '../../lib/types';
import { query, useApi } from '../../lib/useApi';
import { useDraft } from '../../lib/useDraft';
import { useSubmit } from '../../lib/useSubmit';

const COMMON_PRODUCTS = ['FULLWASHED A1', 'FULLWASHED A2', 'FULLWASHED A3', 'NATURAL A1', 'HONEY A1', 'FW HG', 'NATURAL HG', 'SEMI-WASHED A1'];
const COMMON_GRADES = ['A1', 'A2', 'A3', 'A4', 'HG', 'HPC', 'FLOAT', 'HC', 'LG'];

/** One "what was milled" line: N kg of a process / sub-process / grade (from a source). */
interface StockLine {
  key: number;
  process: string | null;
  sub_process: string | null;
  grade: string;
  source: string | null;
  qty: number | '';
}

interface BatchForm {
  process_product: string;
  processing_date: string;
  batch_no: string;
  lines: StockLine[];
  outputs: Record<string, number | ''>;
}

const newLine = (key = Date.now()): StockLine => ({ key, process: null, sub_process: null, grade: '', source: null, qty: '' });
const blank = (): BatchForm => ({ process_product: '', processing_date: today(), batch_no: '', lines: [newLine(1)], outputs: {} });

interface Props {
  knownProducts: string[];
  onClose: () => void;
  onSaved: (batch: DryMillBatch) => void;
}

/**
 * Record a dry mill batch. Say what parchment was milled (process, optionally
 * sub-process / grade / source, and kg): it is taken out of the available stock
 * automatically, oldest accepted parchment first. No receipt picking.
 */
export function BatchWizard({ knownProducts, onClose, onSaved }: Props) {
  const draft = useDraft<BatchForm>('dry-mill-batch-v2', blank);
  const form = draft.value;
  const submit = useSubmit();
  const grades = useApi<ExportGrade[]>('/drymill/export-grades/');
  const processes = useApi<CatalogProcess[]>('/processing/catalog/processes/');
  const sources = useApi<CoffeeSource[]>('/drymill/sources/');
  // Each line reports how much stock is available for its selection.
  const available = useDraft<Record<number, number>>(null, () => ({}));
  const setAvailable = available.setValue;
  const reportAvailable = useCallback(
    (lineKey: number, kgAvailable: number) => setAvailable((prev) => (prev[lineKey] === kgAvailable ? prev : { ...prev, [lineKey]: kgAvailable })),
    [setAvailable],
  );

  const lines = form.lines.filter((l) => l.process && num(l.qty) > 0);
  const inputTotal = lines.reduce((sum, l) => sum + num(l.qty), 0);
  const outputTotal = Object.values(form.outputs).reduce<number>((sum, v) => sum + num(v), 0);
  const outturn = inputTotal > 0 ? calculateOutturnPct(outputTotal, inputTotal) : 0;
  const processName = (id: string | null) => processes.data?.find((p) => p.id === id)?.name ?? '';
  const sourceName = (value: string | null) => sources.data?.find((s) => `${s.origin_type}:${s.id}` === value)?.name ?? '';

  const updateLine = (key: number, patch: Partial<StockLine>) =>
    draft.setValue((prev) => ({ ...prev, lines: prev.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));

  const steps = [
    {
      label: 'Product',
      description: 'What is produced',
      validate: () => (!form.process_product.trim() ? 'Enter the process / product being milled.' : !form.processing_date ? 'Enter the processing date.' : null),
      content: (
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <Autocomplete
            label="Process / product"
            required
            data={Array.from(new Set([...knownProducts, ...COMMON_PRODUCTS]))}
            value={form.process_product}
            onChange={(v) => draft.set('process_product')(v.toUpperCase())}
          />
          <TextInput label="Processing date" type="date" required value={form.processing_date} onChange={(e) => draft.set('processing_date')(e.currentTarget.value)} />
          <TextInput label="Batch no." placeholder="Automatic if empty" value={form.batch_no} onChange={(e) => draft.set('batch_no')(e.currentTarget.value)} />
        </SimpleGrid>
      ),
    },
    {
      label: 'Parchment from stock',
      description: 'Process, grade, kg',
      validate: () => {
        if (form.lines.some((l) => num(l.qty) > 0 && !l.process)) return 'Choose the process for each line.';
        if (inputTotal <= 0) return 'Enter how many kg of parchment were milled.';
        const short = lines.find((l) => num(l.qty) > (available.value[l.key] ?? Infinity));
        return short ? `Only ${kg(available.value[short.key])} kg available for that selection.` : null;
      },
      content: (
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Say what was milled. It is deducted from the available stock (accepted parchment), oldest first. Leave sub-process, grade or source empty for “any”.
          </Text>
          {form.lines.map((line) => (
            <StockLineEditor
              key={line.key}
              line={line}
              processes={processes.data ?? []}
              sources={sources.data ?? []}
              removable={form.lines.length > 1}
              onChange={(patch) => updateLine(line.key, patch)}
              onRemove={() => draft.setValue((prev) => ({ ...prev, lines: prev.lines.filter((l) => l.key !== line.key) }))}
              onAvailable={reportAvailable}
            />
          ))}
          <Group justify="space-between">
            <Button size="compact-sm" variant="subtle" leftSection={<IconPlus size={14} />} onClick={() => draft.setValue((prev) => ({ ...prev, lines: [...prev.lines, newLine()] }))}>
              Add another process / grade
            </Button>
            <Text size="sm">Total parchment: <strong>{kg(inputTotal)} kg</strong></Text>
          </Group>
        </Stack>
      ),
    },
    {
      label: 'Green output',
      description: 'Per grade',
      validate: () => (outputTotal > inputTotal ? 'Green output cannot be more than the parchment input.' : null),
      content: (
        <Stack gap="sm">
          <Text size="sm" c="dimmed">Parchment input: <strong>{kg(inputTotal)} kg</strong>.</Text>
          {grades.loading && !grades.data ? (
            <FormSkeleton fields={6} />
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xs">
              {(grades.data ?? []).map((g) => (
                <NumberInput
                  key={g.id}
                  label={`${g.name} (kg)`}
                  value={form.outputs[g.id] ?? ''}
                  onChange={(v) => draft.setValue((prev) => ({ ...prev, outputs: { ...prev.outputs, [g.id]: v === '' ? '' : Number(v) } }))}
                  min={0}
                  hideControls
                  thousandSeparator=","
                />
              ))}
            </SimpleGrid>
          )}
          <Text size="sm">Total green <strong>{kg(outputTotal)} kg</strong> · out-turn <strong>{pct(outturn, 2)}</strong></Text>
        </Stack>
      ),
    },
  ];

  const review = (
    <Stack gap="sm">
      <Group gap="lg">
        <Fig label="Product" value={form.process_product} />
        <Fig label="Date" value={form.processing_date} />
        <Fig label="Batch no." value={form.batch_no || 'automatic'} />
        <Fig label="Parchment in" value={`${kg(inputTotal)} kg`} />
        <Fig label="Green out" value={`${kg(outputTotal)} kg`} />
        <Fig label="Out-turn" value={pct(outturn, 2)} />
      </Group>
      <Table striped withTableBorder>
        <Table.Thead>
          <Table.Tr><Table.Th>Taken from stock</Table.Th><Table.Th ta="right">kg</Table.Th><Table.Th ta="right">Left in stock after</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {lines.map((l) => (
            <Table.Tr key={l.key}>
              <Table.Td>
                {processName(l.process)}
                {l.grade && <Badge ml={6} size="xs" variant="light">{l.grade}</Badge>}
                {l.source && <Text span size="xs" c="dimmed"> · {sourceName(l.source)}</Text>}
              </Table.Td>
              <Table.Td ta="right">{kg(l.qty)}</Table.Td>
              <Table.Td ta="right">{available.value[l.key] === undefined ? '—' : kg(available.value[l.key] - num(l.qty))}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Text size="sm" c="dimmed">
        Output: {(grades.data ?? []).filter((g) => num(form.outputs[g.id]) > 0).map((g) => `${g.name} ${kg(form.outputs[g.id])} kg`).join(' · ') || 'none entered'}
      </Text>
    </Stack>
  );

  async function save() {
    const batch = await submit.run(() =>
      api<DryMillBatch>('/drymill/batches/', {
        method: 'POST',
        body: {
          process_product: form.process_product.trim(),
          processing_date: form.processing_date,
          batch_no: form.batch_no.trim(),
          stock_lines: lines.map((l) => {
            const origin = sourceFields(l.source);
            return {
              process: l.process,
              sub_process: l.sub_process,
              grade: l.grade.trim().toUpperCase(),
              source_facility: origin?.source_facility ?? null,
              source_supplier: origin?.source_supplier ?? null,
              qty_kg: num(l.qty),
            };
          }),
          outputs: Object.entries(form.outputs)
            .filter(([, v]) => num(v) > 0)
            .map(([export_grade, v]) => ({ export_grade, qty_kg: num(v) })),
        },
      }),
    );
    if (!batch) return;
    toast.success(`${batch.batch_no}: ${kg(batch.parch_input_kg)} kg parchment taken from stock, ${kg(batch.green_output_kg)} kg green (${pct(batch.outturn_pct, 2)}).`, 'Batch saved');
    draft.reset();
    onSaved(batch);
  }

  return <FormWizard opened onClose={onClose} title="Record dry mill batch" steps={steps} review={review} onSubmit={save} submitLabel="Save batch" saving={submit.saving} error={submit.error} size="70rem" />;
}

function StockLineEditor({
  line,
  processes,
  sources,
  removable,
  onChange,
  onRemove,
  onAvailable,
}: {
  line: StockLine;
  processes: CatalogProcess[];
  sources: CoffeeSource[];
  removable: boolean;
  onChange: (patch: Partial<StockLine>) => void;
  onRemove: () => void;
  /** Stable callback (useCallback): reports the stock available for this line's selection. */
  onAvailable: (lineKey: number, kgAvailable: number) => void;
}) {
  const subs = useApi<CatalogSubProcess[]>(line.process ? `/processing/catalog/sub-processes/?process=${line.process}&is_active=true` : null);
  const origin = sourceFields(line.source);
  const stock = useApi<{ available_kg: string; receipts: number; oldest_arrival: string | null }>(
    line.process
      ? `/drymill/stock-receipts/available/${query({
          process: line.process,
          sub_process: line.sub_process,
          grade: line.grade.trim().toUpperCase(),
          source_facility: origin?.source_facility,
          source_supplier: origin?.source_supplier,
        })}`
      : null,
  );
  const availableKg = stock.data ? num(stock.data.available_kg) : null;
  useEffect(() => {
    if (availableKg !== null) onAvailable(line.key, availableKg);
  }, [availableKg, line.key, onAvailable]);
  const over = availableKg !== null && num(line.qty) > availableKg;

  return (
    <Card withBorder radius="md" p="sm">
      <Group gap="xs" align="flex-end" wrap="wrap">
        <Select
          label="Process"
          required
          data={processes.map((p) => ({ value: p.id, label: p.name }))}
          value={line.process}
          onChange={(v) => onChange({ process: v, sub_process: null })}
          w={210}
        />
        <Select
          label="Sub-process"
          placeholder={line.process ? 'Any' : 'Choose process'}
          data={(subs.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
          value={line.sub_process}
          onChange={(v) => onChange({ sub_process: v })}
          disabled={!line.process}
          searchable
          clearable
          w={190}
        />
        <Autocomplete label="Grade" placeholder="Any" data={COMMON_GRADES} value={line.grade} onChange={(v) => onChange({ grade: v.toUpperCase() })} w={100} />
        <Select label="Source" placeholder="Any" data={sourceOptions(sources)} value={line.source} onChange={(v) => onChange({ source: v })} searchable clearable w={180} />
        <NumberInput label="Milled (kg)" required value={line.qty} onChange={(v) => onChange({ qty: v === '' ? '' : Number(v) })} min={0} hideControls thousandSeparator="," error={over} w={130} />
        {availableKg !== null && (
          <Button size="compact-sm" variant="subtle" mb={6} onClick={() => onChange({ qty: availableKg })} disabled={availableKg <= 0}>
            All
          </Button>
        )}
        {removable && (
          <ActionIcon variant="subtle" color="red" mb={6} aria-label="Remove line" onClick={onRemove}>
            <IconTrash size={16} />
          </ActionIcon>
        )}
      </Group>
      <Text size="xs" mt={6} c={over ? 'red' : 'dimmed'}>
        {!line.process
          ? 'Choose a process to see the available stock.'
          : stock.loading && !stock.data
            ? 'Checking available stock…'
            : `Available to mill: ${kg(availableKg)} kg in ${stock.data?.receipts ?? 0} receipts${stock.data?.oldest_arrival ? ` (oldest ${stock.data.oldest_arrival})` : ''}`}
      </Text>
    </Card>
  );
}

function Fig({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text fw={600} size="sm">{value}</Text>
    </div>
  );
}
