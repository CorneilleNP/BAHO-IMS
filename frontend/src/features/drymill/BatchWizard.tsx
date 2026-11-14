import { useMemo, useState } from 'react';
import { ActionIcon, Autocomplete, Badge, Button, Group, NumberInput, ScrollArea, Select, SimpleGrid, Stack, Table, Text, TextInput, Tooltip } from '@mantine/core';
import { IconArrowDownCircle, IconTrash } from '@tabler/icons-react';
import { EmptyState } from '../../components/Feedback';
import { FormWizard } from '../../components/FormWizard';
import { FormSkeleton, TableSkeleton } from '../../components/Skeletons';
import { api } from '../../lib/api';
import { calculateOutturnPct, kg, num, pct, today } from '../../lib/format';
import { toast } from '../../lib/toast';
import type { CatalogProcess, CoffeeSource, DryMillBatch, ExportGrade, HqStockReceipt, Paginated } from '../../lib/types';
import { query, useApi } from '../../lib/useApi';
import { useDraft } from '../../lib/useDraft';
import { useSubmit } from '../../lib/useSubmit';

const COMMON_PRODUCTS = ['FULLWASHED A1', 'FULLWASHED A2', 'FULLWASHED A3', 'NATURAL A1', 'HONEY A1', 'FW HG', 'NATURAL HG', 'SEMI-WASHED A1'];

interface BatchForm {
  process_product: string;
  processing_date: string;
  batch_no: string;
  /** receipt id -> kg taken (the stock deduction) */
  inputs: Record<string, number | ''>;
  /** remembered so the review/inputs list still shows receipts filtered out later */
  picked: Record<string, Pick<HqStockReceipt, 'receipt_number' | 'source_name' | 'grade' | 'process_name' | 'stock_balance_kg' | 'arrival_date'>>;
  outputs: Record<string, number | ''>;
}

const blank = (): BatchForm => ({ process_product: '', processing_date: today(), batch_no: '', inputs: {}, picked: {}, outputs: {} });

interface Props {
  knownProducts: string[];
  onClose: () => void;
  onSaved: (batch: DryMillBatch) => void;
}

/** Record a dry mill batch: what product, which stock receipts it takes parchment from, and the green output per grade. */
export function BatchWizard({ knownProducts, onClose, onSaved }: Props) {
  const draft = useDraft<BatchForm>('dry-mill-batch', blank);
  const form = draft.value;
  const submit = useSubmit();
  const grades = useApi<ExportGrade[]>('/drymill/export-grades/');

  const inputTotal = Object.values(form.inputs).reduce<number>((sum, v) => sum + num(v), 0);
  const outputTotal = Object.values(form.outputs).reduce<number>((sum, v) => sum + num(v), 0);
  const outturn = inputTotal > 0 ? calculateOutturnPct(outputTotal, inputTotal) : 0;
  const pickedIds = Object.keys(form.inputs).filter((id) => num(form.inputs[id]) > 0);

  const setInput = (receipt: Pick<HqStockReceipt, 'id'> & BatchForm['picked'][string], qty: number | '') =>
    draft.setValue((prev) => ({
      ...prev,
      inputs: { ...prev.inputs, [receipt.id]: qty },
      picked: { ...prev.picked, [receipt.id]: receipt },
    }));

  const steps = [
    {
      label: 'Product',
      description: 'What is milled',
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
      description: 'Which receipts',
      validate: () => {
        if (inputTotal <= 0) return 'Choose at least one stock receipt and how many kg the batch takes from it.';
        const over = pickedIds.find((id) => num(form.inputs[id]) > num(form.picked[id]?.stock_balance_kg));
        return over ? `${form.picked[over].receipt_number} only has ${kg(form.picked[over].stock_balance_kg)} kg left.` : null;
      },
      content: <StockPicker form={form} setInput={setInput} inputTotal={inputTotal} />,
    },
    {
      label: 'Green output',
      description: 'Per grade',
      validate: () => (outputTotal > inputTotal ? 'Green output cannot be more than the parchment input.' : null),
      content: (
        <Stack gap="sm">
          <Text size="sm" c="dimmed">Parchment input: <strong>{kg(inputTotal)} kg</strong> from {pickedIds.length} receipt{pickedIds.length === 1 ? '' : 's'}.</Text>
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
          <Text size="sm">
            Total green <strong>{kg(outputTotal)} kg</strong> · out-turn <strong>{pct(outturn, 2)}</strong>
          </Text>
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
          <Table.Tr><Table.Th>Receipt</Table.Th><Table.Th>Source</Table.Th><Table.Th ta="right">Taken (kg)</Table.Th><Table.Th ta="right">Left after (kg)</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {pickedIds.map((id) => (
            <Table.Tr key={id}>
              <Table.Td ff="monospace">{form.picked[id].receipt_number}</Table.Td>
              <Table.Td>{form.picked[id].source_name}</Table.Td>
              <Table.Td ta="right">{kg(form.inputs[id])}</Table.Td>
              <Table.Td ta="right">{kg(num(form.picked[id].stock_balance_kg) - num(form.inputs[id]))}</Table.Td>
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
          inputs: pickedIds.map((receipt) => ({ receipt, qty_kg: num(form.inputs[receipt]) })),
          outputs: Object.entries(form.outputs)
            .filter(([, v]) => num(v) > 0)
            .map(([export_grade, v]) => ({ export_grade, qty_kg: num(v) })),
        },
      }),
    );
    if (!batch) return;
    toast.success(`${batch.batch_no}: ${kg(batch.green_output_kg)} kg green from ${kg(batch.parch_input_kg)} kg parchment (${pct(batch.outturn_pct, 2)}).`, 'Batch saved');
    draft.reset();
    onSaved(batch);
  }

  return (
    <FormWizard opened onClose={onClose} title="Record dry mill batch" steps={steps} review={review} onSubmit={save} submitLabel="Save batch" saving={submit.saving} error={submit.error} size="80rem" />
  );
}

function StockPicker({
  form,
  setInput,
  inputTotal,
}: {
  form: BatchForm;
  setInput: (receipt: HqStockReceipt, qty: number | '') => void;
  inputTotal: number;
}) {
  const [source, setSource] = useState<string | null>(null);
  const [process, setProcess] = useState<string | null>(null);
  const [grade, setGrade] = useState('');
  const [fillKg, setFillKg] = useState<number | ''>('');
  const sources = useApi<CoffeeSource[]>('/drymill/sources/');
  const processes = useApi<CatalogProcess[]>('/processing/catalog/processes/');
  const available = useApi<Paginated<HqStockReceipt>>(
    `/drymill/stock-receipts/${query({
      quality_status: 'ACCEPTED',
      has_balance: 'true',
      item_type: 'PARCH',
      source,
      process,
      grade: grade.trim().toUpperCase(),
      ordering: 'arrival_date',
      page_size: 200,
    })}`,
  );
  const rows = useMemo(() => available.data?.results ?? [], [available.data]);

  /** First in, first out: take from the oldest receipts until `fillKg` is reached. */
  function fillOldestFirst() {
    let remaining = num(fillKg);
    rows.forEach((r) => {
      const already = num(form.inputs[r.id]);
      const room = num(r.stock_balance_kg) - already;
      const take = Math.max(0, Math.min(room, remaining));
      if (take > 0) setInput(r, already + take);
      remaining -= take;
    });
    if (remaining > 0) toast.info(`Only ${kg(num(fillKg) - remaining)} kg available with these filters.`);
  }

  return (
    <Stack gap="sm">
      <Group gap="sm" align="flex-end" wrap="wrap">
        <Select
          label="Source"
          placeholder="All"
          data={(sources.data ?? []).map((s) => ({ value: s.origin_type === 'OWN_CWS' ? s.code : s.name, label: s.name }))}
          value={source}
          onChange={setSource}
          searchable
          clearable
          w={180}
        />
        <Select label="Process" placeholder="All" data={(processes.data ?? []).map((p) => ({ value: p.id, label: p.name }))} value={process} onChange={setProcess} clearable w={210} />
        <TextInput label="Grade" placeholder="All" value={grade} onChange={(e) => setGrade(e.currentTarget.value)} w={90} />
        <NumberInput label="Quantity to take (kg)" value={fillKg} onChange={(v) => setFillKg(v === '' ? '' : Number(v))} min={0} hideControls thousandSeparator="," w={170} />
        <Tooltip label="Takes from the oldest accepted receipts first (FIFO)" withArrow>
          <Button variant="light" leftSection={<IconArrowDownCircle size={16} />} disabled={!fillKg || rows.length === 0} onClick={fillOldestFirst}>
            Fill oldest first
          </Button>
        </Tooltip>
      </Group>
      <Text size="sm">
        Selected: <strong>{kg(inputTotal)} kg</strong> from {Object.values(form.inputs).filter((v) => num(v) > 0).length} receipt(s)
        {available.data && available.data.count > rows.length && <Text span c="dimmed"> · showing oldest {rows.length} of {available.data.count}; narrow the filters to see more</Text>}
      </Text>
      {available.loading && !available.data ? (
        <TableSkeleton rows={5} columns={6} />
      ) : rows.length === 0 ? (
        <EmptyState title="No accepted parchment in stock with these filters">Only quality-accepted parchment with a balance can be milled.</EmptyState>
      ) : (
        <ScrollArea h={340} type="auto">
          <Table striped highlightOnHover stickyHeader>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Receipt</Table.Th>
                <Table.Th>Arrival</Table.Th>
                <Table.Th>Source</Table.Th>
                <Table.Th>Process / grade</Table.Th>
                <Table.Th ta="right">In stock (kg)</Table.Th>
                <Table.Th w={210}>Take (kg)</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((r) => {
                const taken = form.inputs[r.id] ?? '';
                const over = num(taken) > num(r.stock_balance_kg);
                return (
                  <Table.Tr key={r.id} bg={num(taken) > 0 ? 'var(--mantine-color-coffee-0)' : undefined}>
                    <Table.Td ff="monospace">{r.receipt_number}</Table.Td>
                    <Table.Td>{r.arrival_date}</Table.Td>
                    <Table.Td>{r.source_name}</Table.Td>
                    <Table.Td>
                      {r.process_name || <Badge size="xs" color="orange">not assigned</Badge>} {r.grade && <Badge size="xs" variant="light">{r.grade}</Badge>}
                    </Table.Td>
                    <Table.Td ta="right">{kg(r.stock_balance_kg)}</Table.Td>
                    <Table.Td>
                      <Group gap={4} wrap="nowrap">
                        <NumberInput
                          aria-label={`Take from ${r.receipt_number}`}
                          size="xs"
                          value={taken}
                          onChange={(v) => setInput(r, v === '' ? '' : Number(v))}
                          min={0}
                          max={num(r.stock_balance_kg)}
                          hideControls
                          error={over}
                          w={110}
                        />
                        <Button size="compact-xs" variant="subtle" onClick={() => setInput(r, num(r.stock_balance_kg))}>All</Button>
                        {num(taken) > 0 && (
                          <ActionIcon size="sm" variant="subtle" color="gray" aria-label="Remove" onClick={() => setInput(r, '')}>
                            <IconTrash size={12} />
                          </ActionIcon>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}
    </Stack>
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
