import { ActionIcon, Button, Group, NumberInput, SimpleGrid, Stack, Table, Text, TextInput } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { FormWizard } from '../../components/FormWizard';
import { api } from '../../lib/api';
import { num, pct } from '../../lib/format';
import { toast } from '../../lib/toast';
import type { Facility, ProcessType } from '../../lib/types';
import { useDraft } from '../../lib/useDraft';
import { useSubmit } from '../../lib/useSubmit';

interface GradeRow {
  key: number;
  code: string;
  name: string;
  percent: number | '';
}

interface ProcessForm {
  name: string;
  sub_process: string;
  grades: GradeRow[];
}

const WASHED = ['A1', 'A2', 'A3', 'HPC'];
const NATURAL = ['HG', 'HPC'];
const rowsFor = (codes: string[]): GradeRow[] => codes.map((code, i) => ({ key: Date.now() + i, code, name: '', percent: '' }));
const blank = (): ProcessForm => ({ name: '', sub_process: '', grades: rowsFor(WASHED) });

/** Register a process at a station with its grades and estimate ratios ("ESTIMATE RATIO" row of the workbook). */
export function CwsProcessWizard({ station, onClose, onSaved }: { station: Facility; onClose: () => void; onSaved: (p: ProcessType) => void }) {
  const draft = useDraft<ProcessForm>(`cws-process-${station.id}`, blank);
  const form = draft.value;
  const submit = useSubmit();
  const filled = form.grades.filter((g) => g.code.trim());
  const totalPercent = filled.reduce((sum, g) => sum + num(g.percent), 0);

  const updateGrade = (key: number, patch: Partial<GradeRow>) =>
    draft.setValue((prev) => ({ ...prev, grades: prev.grades.map((g) => (g.key === key ? { ...g, ...patch } : g)) }));

  const steps = [
    {
      label: 'Name',
      validate: () => (!form.name.trim() ? 'Enter the process name, e.g. Fully Washed.' : null),
      content: (
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label="Process name" required placeholder="Fully Washed" value={form.name} onChange={(e) => draft.set('name')(e.currentTarget.value)} data-autofocus />
          <TextInput label="Sub-process" placeholder="Standard Run" value={form.sub_process} onChange={(e) => draft.set('sub_process')(e.currentTarget.value)} />
        </SimpleGrid>
      ),
    },
    {
      label: 'Grades & ratios',
      validate: () => {
        if (!filled.length) return 'Add at least one grade.';
        const codes = filled.map((g) => g.code.trim().toUpperCase());
        if (new Set(codes).size !== codes.length) return 'Each grade code must be different.';
        if (totalPercent <= 0) return 'Enter at least one estimate ratio above 0%.';
        if (totalPercent > 100) return 'Estimate ratios cannot add up to more than 100%.';
        return null;
      },
      content: (
        <Stack gap="xs">
          <Group gap={6}>
            <Button size="compact-xs" variant="default" onClick={() => draft.set('grades')(rowsFor(WASHED))}>Washed: A1–HPC</Button>
            <Button size="compact-xs" variant="default" onClick={() => draft.set('grades')(rowsFor(NATURAL))}>Natural: HG, HPC</Button>
          </Group>
          {form.grades.map((g) => (
            <Group key={g.key} gap="xs" wrap="nowrap">
              <TextInput aria-label="Grade code" placeholder="Code" value={g.code} onChange={(e) => updateGrade(g.key, { code: e.currentTarget.value })} w={90} />
              <TextInput aria-label="Grade label" placeholder="Label (optional)" value={g.name} onChange={(e) => updateGrade(g.key, { name: e.currentTarget.value })} style={{ flex: 1 }} />
              <NumberInput
                aria-label={`${g.code || 'Grade'} estimate %`}
                placeholder="0"
                value={g.percent}
                onChange={(v) => updateGrade(g.key, { percent: v === '' ? '' : Number(v) })}
                min={0}
                max={100}
                decimalScale={3}
                suffix="%"
                hideControls
                w={110}
              />
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label="Remove grade"
                disabled={form.grades.length <= 1}
                onClick={() => draft.setValue((prev) => ({ ...prev, grades: prev.grades.filter((r) => r.key !== g.key) }))}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          ))}
          <Group justify="space-between">
            <Button size="compact-sm" variant="subtle" leftSection={<IconPlus size={14} />} onClick={() => draft.setValue((prev) => ({ ...prev, grades: [...prev.grades, ...rowsFor([''])] }))}>
              Add grade
            </Button>
            <Text size="sm" c={totalPercent > 100 ? 'red' : 'dimmed'}>Total estimate: <strong>{pct(totalPercent, 2)}</strong> of cherry input</Text>
          </Group>
        </Stack>
      ),
    },
  ];

  const review = (
    <Stack gap="xs">
      <Text fw={600}>{form.name}{form.sub_process && ` / ${form.sub_process}`} <Text span c="dimmed" size="sm">at {station.name}</Text></Text>
      <Table withTableBorder maw={420}>
        <Table.Tbody>
          {filled.map((g) => (
            <Table.Tr key={g.key}><Table.Td>{g.name || g.code.toUpperCase()}</Table.Td><Table.Td ta="right">{pct(num(g.percent), 2)}</Table.Td></Table.Tr>
          ))}
          <Table.Tr><Table.Th>Total</Table.Th><Table.Th ta="right">{pct(totalPercent, 2)}</Table.Th></Table.Tr>
        </Table.Tbody>
      </Table>
    </Stack>
  );

  async function save() {
    const created = await submit.run(() =>
      api<ProcessType>('/processing/process-types/', {
        method: 'POST',
        body: {
          facility: station.id,
          name: form.name.trim(),
          sub_process: form.sub_process.trim(),
          grades: filled.map((g) => ({ code: g.code.trim().toUpperCase(), name: g.name.trim() || g.code.trim().toUpperCase(), ratio: (num(g.percent) / 100).toFixed(5) })),
        },
      }),
    );
    if (!created) return;
    toast.success(`${created.name}${created.sub_process ? ` / ${created.sub_process}` : ''} at ${station.name}.`, 'Process registered');
    draft.reset();
    onSaved(created);
  }

  return <FormWizard opened onClose={onClose} title={`Register process at ${station.name}`} steps={steps} review={review} onSubmit={save} submitLabel="Save process" saving={submit.saving} error={submit.error} size="lg" />;
}
