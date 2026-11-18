import { NumberInput, Select, SimpleGrid, Stack, Table, Text, TextInput } from '@mantine/core';
import { EmptyState } from '../../components/Feedback';
import { FormWizard } from '../../components/FormWizard';
import { api } from '../../lib/api';
import { calculateEstimate, calculateOutturnPct, kg, num, pct, today } from '../../lib/format';
import { toast } from '../../lib/toast';
import type { Facility, ProcessingLot, ProcessType } from '../../lib/types';
import { useDraft } from '../../lib/useDraft';
import { useSubmit } from '../../lib/useSubmit';

const NO_SUB = '__none__';

interface LotForm {
  process: string | null;
  sub_process: string | null;
  lot_number: string;
  lot_date: string;
  cherry_input_kg: number | '';
  actuals: Record<string, number | ''>;
}

const blank = (): LotForm => ({ process: null, sub_process: null, lot_number: '', lot_date: today(), cherry_input_kg: '', actuals: {} });

/** New processing lot: process → sub-process → cherry input with live estimates → actuals (optional) → review. */
export function LotWizard({ station, processes, onClose, onSaved }: { station: Facility; processes: ProcessType[]; onClose: () => void; onSaved: (lot: ProcessingLot) => void }) {
  const draft = useDraft<LotForm>(`lot-${station.id}`, blank);
  const form = draft.value;
  const submit = useSubmit();
  // This station's registered processes (one of the 5), then the sub-processes
  // it registered under the chosen one - a lot can only use a combination this
  // station has already registered with its estimate ratios.
  const processOptions = Array.from(
    new Map(processes.map((p) => [p.process, p.process_name])),
    ([value, label]) => ({ value, label }),
  );
  const subOptions = processes
    .filter((p) => p.process === form.process)
    .map((p) => ({ value: p.sub_process_id ?? NO_SUB, label: p.sub_process || '(no sub-process)' }));
  // Skip the extra click when there's only one sub-process registered for this process.
  const subKey = form.sub_process ?? (subOptions.length === 1 ? subOptions[0].value : null) ?? NO_SUB;
  const selectedType = processes.find((p) => p.process === form.process && (p.sub_process_id ?? NO_SUB) === subKey) ?? null;
  const input = num(form.cherry_input_kg);
  const rows = (selectedType?.grades ?? []).map((grade) => {
    const ratio = num(grade.ratio);
    const actual = form.actuals[grade.id];
    return {
      grade,
      ratio,
      estimated: calculateEstimate(input, ratio),
      actual,
      outturn: actual === '' || actual === undefined ? null : calculateOutturnPct(num(actual), input),
    };
  });
  const estimatedTotal = rows.reduce((s, r) => s + r.estimated, 0);

  const estimatesTable = (withActuals: boolean) => (
    <Table withTableBorder>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Grade</Table.Th>
          <Table.Th>Estimate ratio</Table.Th>
          <Table.Th ta="right">Estimated (kg)</Table.Th>
          {withActuals && <Table.Th>Actual sorted (kg)</Table.Th>}
          {withActuals && <Table.Th ta="right">Out-turn</Table.Th>}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((row) => (
          <Table.Tr key={row.grade.id}>
            <Table.Td fw={600}>{row.grade.name}</Table.Td>
            <Table.Td>{pct(row.ratio * 100, 2)}</Table.Td>
            <Table.Td ta="right">{kg(row.estimated, 2)}</Table.Td>
            {withActuals && (
              <Table.Td>
                <NumberInput
                  aria-label={`Actual ${row.grade.code}`}
                  placeholder="Later"
                  value={row.actual ?? ''}
                  onChange={(v) => draft.setValue((prev) => ({ ...prev, actuals: { ...prev.actuals, [row.grade.id]: v === '' ? '' : Number(v) } }))}
                  min={0}
                  hideControls
                  maw={140}
                />
              </Table.Td>
            )}
            {withActuals && <Table.Td ta="right">{row.outturn === null || input <= 0 ? '—' : pct(row.outturn, 2)}</Table.Td>}
          </Table.Tr>
        ))}
      </Table.Tbody>
      <Table.Tfoot>
        <Table.Tr>
          <Table.Th>Total</Table.Th>
          <Table.Th>{pct(num(selectedType?.total_ratio) * 100, 2)}</Table.Th>
          <Table.Th ta="right">{kg(estimatedTotal, 2)}</Table.Th>
          {withActuals && <Table.Th colSpan={2} />}
        </Table.Tr>
      </Table.Tfoot>
    </Table>
  );

  const steps = [
    {
      label: 'Process',
      validate: () => (!form.process ? 'Choose the process.' : !selectedType ? 'Choose the sub-process.' : !form.lot_date ? 'Enter the lot date.' : null),
      content: processes.length ? (
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select
            label="Process"
            required
            data={processOptions}
            value={form.process}
            onChange={(v) => draft.setValue((prev) => ({ ...prev, process: v, sub_process: null, actuals: {} }))}
          />
          <Select
            label="Sub-process"
            placeholder={form.process ? 'Choose' : 'Choose the process first'}
            required={subOptions.length > 1}
            data={subOptions}
            value={form.process ? subKey : null}
            onChange={(v) => draft.setValue((prev) => ({ ...prev, sub_process: v === NO_SUB ? null : v, actuals: {} }))}
            disabled={!form.process}
          />
          <TextInput label="Lot code" placeholder="Automatic if empty" value={form.lot_number} onChange={(e) => draft.set('lot_number')(e.currentTarget.value)} />
          <TextInput label="Lot date" type="date" value={form.lot_date} onChange={(e) => draft.set('lot_date')(e.currentTarget.value)} />
        </SimpleGrid>
      ) : (
        <EmptyState title="No processes registered at this station">Register a process with its estimate ratios under “Register Process” first.</EmptyState>
      ),
    },
    {
      label: 'Cherry input',
      description: 'Live estimates',
      validate: () => (input <= 0 ? 'Enter the cherry input in kg.' : null),
      content: (
        <Stack gap="sm">
          <NumberInput label="Cherry input (kg)" required value={form.cherry_input_kg} onChange={(v) => draft.set('cherry_input_kg')(v === '' ? '' : Number(v))} min={0} thousandSeparator="," hideControls maw={240} data-autofocus />
          {estimatesTable(false)}
        </Stack>
      ),
    },
    {
      label: 'Actuals',
      description: 'Optional',
      content: (
        <Stack gap="sm">
          <Text size="sm" c="dimmed">Enter sorted quantities now if you have them, or leave empty and add them later with “Actuals”.</Text>
          {estimatesTable(true)}
        </Stack>
      ),
    },
  ];

  const filledActuals = rows.filter((r) => r.actual !== '' && r.actual !== undefined);
  const review = (
    <SimpleGrid cols={{ base: 2, sm: 4 }}>
      {[
        ['Process', selectedType ? (selectedType.sub_process ? `${selectedType.name} / ${selectedType.sub_process}` : selectedType.name) : ''],
        ['Lot', form.lot_number || 'automatic'],
        ['Date', form.lot_date],
        ['Cherry input', `${kg(input)} kg`],
        ['Estimated output', `${kg(estimatedTotal, 2)} kg`],
        ['Actuals entered', `${filledActuals.length} of ${rows.length} grades`],
      ].map(([label, value]) => (
        <div key={label}>
          <Text size="xs" c="dimmed">{label}</Text>
          <Text fw={600} size="sm">{value || '—'}</Text>
        </div>
      ))}
    </SimpleGrid>
  );

  async function save() {
    const lot = await submit.run(() =>
      api<ProcessingLot>('/processing/lots/', {
        method: 'POST',
        body: {
          process_type: selectedType?.id,
          lot_number: form.lot_number.trim(),
          lot_date: form.lot_date,
          cherry_input_kg: input,
          actuals: filledActuals.map((r) => ({ grade: r.grade.id, actual_kg: num(r.actual) })),
        },
      }),
    );
    if (!lot) return;
    toast.success(`${lot.lot_number}: ${kg(lot.cherry_input_kg)} kg cherry, estimate ${kg(lot.total_estimated_kg, 2)} kg.`, 'Lot saved');
    draft.reset();
    onSaved(lot);
  }

  // Closing without saving also clears the draft, so the next lot starts blank.
  const close = () => {
    draft.reset();
    onClose();
  };
  return <FormWizard opened onClose={close} title={`New processing lot at ${station.name}`} steps={steps} review={review} onSubmit={save} submitLabel="Save lot" saving={submit.saving} error={submit.error} />;
}
