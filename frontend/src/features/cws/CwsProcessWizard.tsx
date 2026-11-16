import { useEffect, useRef } from 'react';
import { ActionIcon, Button, Group, NumberInput, Stack, Table, Text, TextInput } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { FormWizard } from '../../components/FormWizard';
import { ProcessPicker } from '../../components/ProcessPicker';
import { api } from '../../lib/api';
import { num, pct } from '../../lib/format';
import { toast } from '../../lib/toast';
import type { CatalogProcess, CatalogProcessGrade, CatalogSubProcess, Facility, ProcessType } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { useDraft } from '../../lib/useDraft';
import { useSubmit } from '../../lib/useSubmit';

interface GradeRow {
  key: number;
  code: string;
  name: string;
  percent: number | '';
}

interface ProcessForm {
  process: string | null;
  sub_process: string | null;
  grades: GradeRow[];
}

const WASHED = ['A1', 'A2', 'A3', 'HPC'];
const NATURAL = ['HG', 'HPC'];
const rowsFor = (codes: string[]): GradeRow[] => codes.map((code, i) => ({ key: Date.now() + i, code, name: '', percent: '' }));
const blank = (): ProcessForm => ({ process: null, sub_process: null, grades: rowsFor(WASHED) });

function fromProcessType(p: ProcessType): ProcessForm {
  return {
    process: p.process,
    sub_process: p.sub_process_id,
    grades: p.grades.map((g, i) => ({ key: Date.now() + i, code: g.code, name: g.name, percent: num(g.ratio) * 100 })),
  };
}

interface Props {
  station: Facility;
  /** Correct this registration (and/or its ratios); omit to register a new one. */
  processType?: ProcessType | null;
  onClose: () => void;
  onSaved: (p: ProcessType) => void;
}

/**
 * Register a process at a station with its grades and estimate ratios ("ESTIMATE
 * RATIO" row of the workbook). Grades are shared company-wide per process: choosing
 * a process that's already registered elsewhere loads its known grades (so they're
 * reused, not retyped) - only the estimate ratio is this station's own to confirm.
 */
export function CwsProcessWizard({ station, processType, onClose, onSaved }: Props) {
  const editing = !!processType;
  // New registrations keep a draft; edits start from the record (render with key={processType.id}).
  const draft = useDraft<ProcessForm>(editing ? null : `cws-process-${station.id}`, () => (processType ? fromProcessType(processType) : blank()));
  const form = draft.value;
  const submit = useSubmit();
  const filled = form.grades.filter((g) => g.code.trim());
  const totalPercent = filled.reduce((sum, g) => sum + num(g.percent), 0);
  const existingGrades = useApi<CatalogProcessGrade[]>(form.process ? `/processing/catalog/processes/${form.process}/grades/` : null);
  const processes = useApi<CatalogProcess[]>('/processing/catalog/processes/');
  const subs = useApi<CatalogSubProcess[]>(form.process ? `/processing/catalog/sub-processes/?process=${form.process}` : null);
  const processName = processes.data?.find((p) => p.id === form.process)?.name ?? '';
  const subProcessName = subs.data?.find((s) => s.id === form.sub_process)?.name ?? '';
  // When editing, the form already has the right grades/ratios: don't let the
  // catalogue auto-fill effect below overwrite them with blank ratios.
  const filledFor = useRef<string | null>(editing ? form.process : null);

  useEffect(() => {
    if (!form.process || existingGrades.loading || !existingGrades.data) return;
    if (filledFor.current === form.process) return;
    filledFor.current = form.process;
    if (existingGrades.data.length > 0) {
      draft.setValue((prev) => ({
        ...prev,
        grades: existingGrades.data!.map((g, i) => ({ key: Date.now() + i, code: g.code, name: g.name, percent: '' })),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.process, existingGrades.data, existingGrades.loading]);

  const updateGrade = (key: number, patch: Partial<GradeRow>) =>
    draft.setValue((prev) => ({ ...prev, grades: prev.grades.map((g) => (g.key === key ? { ...g, ...patch } : g)) }));

  const steps = [
    {
      label: 'Process',
      validate: () => (!form.process ? 'Choose one of the five processes.' : null),
      content: (
        <ProcessPicker
          process={form.process}
          subProcess={form.sub_process}
          canAdd
          onChange={({ process, subProcess }) => draft.setValue((prev) => ({ ...prev, process, sub_process: subProcess }))}
        />
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
          {existingGrades.data && existingGrades.data.length > 0 && (
            <Text size="xs" c="dimmed">
              These grades are already registered for this process elsewhere - reused here. Just confirm (or adjust) this station's estimate ratio.
            </Text>
          )}
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
      <Text fw={600}>{processName}{subProcessName && ` / ${subProcessName}`} <Text span c="dimmed" size="sm">at {station.name}</Text></Text>
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
    const gradesBody = filled.map((g) => ({ code: g.code.trim().toUpperCase(), name: g.name.trim() || g.code.trim().toUpperCase(), ratio: (num(g.percent) / 100).toFixed(5) }));
    const saved = await submit.run(() =>
      editing
        ? api<ProcessType>(`/processing/process-types/${processType!.id}/`, {
            method: 'PATCH',
            body: { process: form.process, sub_process: form.sub_process, grades: gradesBody },
          })
        : api<ProcessType>('/processing/process-types/', {
            method: 'POST',
            body: { facility: station.id, process: form.process, sub_process: form.sub_process, grades: gradesBody },
          }),
    );
    if (!saved) return;
    toast.success(`${saved.process_name}${saved.sub_process ? ` / ${saved.sub_process}` : ''} at ${station.name}.`, editing ? 'Process updated' : 'Process registered');
    draft.reset();
    onSaved(saved);
  }

  // Closing a new registration without saving also clears its draft, so the next
  // one starts blank. Editing an existing registration has no draft (key is null).
  const close = () => {
    if (!editing) draft.reset();
    onClose();
  };
  return (
    <FormWizard
      opened
      onClose={close}
      title={editing ? `Edit ${processType!.process_name}${processType!.sub_process ? ` / ${processType!.sub_process}` : ''} at ${station.name}` : `Register process at ${station.name}`}
      steps={steps}
      review={review}
      onSubmit={save}
      submitLabel={editing ? 'Save changes' : 'Save process'}
      saving={submit.saving}
      error={submit.error}
      size="lg"
    />
  );
}
