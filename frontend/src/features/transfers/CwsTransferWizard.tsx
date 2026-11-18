import { ActionIcon, Button, Card, Group, NumberInput, Select, SimpleGrid, Stack, Table, Text, TextInput } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { FormWizard } from '../../components/FormWizard';
import { ProcessPicker } from '../../components/ProcessPicker';
import { api } from '../../lib/api';
import { kg, num, today } from '../../lib/format';
import { toast } from '../../lib/toast';
import type { CatalogProcessGrade, CwsTransfer, Facility } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { useDraft } from '../../lib/useDraft';
import { useSubmit } from '../../lib/useSubmit';

type Num = number | '';

interface WeighingRow {
  key: number;
  bags: Num;
  weight_kg: Num;
}

interface LineForm {
  key: number;
  process: string | null;
  sub_process: string | null;
  grade: string | null;
  moisture_content_pct: Num;
  weighings: WeighingRow[];
  weight_of_bags_kg: Num;
}

interface TransferForm {
  delivery_note_no: string;
  transfer_date: string;
  lines: LineForm[];
}

const newWeighing = (key = Date.now()): WeighingRow => ({ key, bags: '', weight_kg: '' });
const newLine = (key = Date.now()): LineForm => ({
  key,
  process: null,
  sub_process: null,
  grade: null,
  moisture_content_pct: '',
  weighings: [newWeighing(1)],
  weight_of_bags_kg: '',
});
const blank = (): TransferForm => ({ delivery_note_no: '', transfer_date: today(), lines: [newLine(1)] });

interface Props {
  station: Facility;
  onClose: () => void;
  onSaved: (transfer: CwsTransfer) => void;
}

/**
 * Record a delivery note of parchment sent to dry mill: one or more
 * process/sub-process/grade lines (a truck can carry several), each with
 * its own scale weighings (summed automatically) and bag weight. Dry mill
 * will weigh it again independently - this station's own numbers stay
 * hidden from dry mill until it confirms its own.
 */
export function CwsTransferWizard({ station, onClose, onSaved }: Props) {
  const draft = useDraft<TransferForm>(`transfer-${station.id}`, blank);
  const form = draft.value;
  const submit = useSubmit();

  const updateLine = (key: number, patch: Partial<LineForm>) =>
    draft.setValue((prev) => ({ ...prev, lines: prev.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));

  const lineTotals = (line: LineForm) => {
    const rows = line.weighings.filter((w) => num(w.bags) > 0 && num(w.weight_kg) > 0);
    const bags = rows.reduce((sum, w) => sum + num(w.bags), 0);
    const gross = rows.reduce((sum, w) => sum + num(w.weight_kg), 0);
    const bagsKg = line.weight_of_bags_kg === '' ? 0 : num(line.weight_of_bags_kg);
    return { rows, bags, gross, bagsKg, net: gross - bagsKg };
  };

  const steps = [
    {
      label: 'Delivery note',
      validate: () => (!form.delivery_note_no.trim() ? 'Enter the delivery note number.' : !form.transfer_date ? 'Enter the date.' : null),
      content: (
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label="Delivery note no." required placeholder="As printed on the paper note" value={form.delivery_note_no} onChange={(e) => draft.set('delivery_note_no')(e.currentTarget.value)} data-autofocus />
          <TextInput label="Date" type="date" required value={form.transfer_date} onChange={(e) => draft.set('transfer_date')(e.currentTarget.value)} />
        </SimpleGrid>
      ),
    },
    {
      label: 'Lines & weighings',
      description: 'One per process / grade',
      validate: () => {
        for (const line of form.lines) {
          if (!line.process || !line.grade) return 'Choose the process and grade for every line.';
          if (lineTotals(line).rows.length === 0) return 'Record at least one weighing for every line.';
          const { bagsKg, gross } = lineTotals(line);
          if (bagsKg > gross) return 'Weight of bags cannot be more than the gross weight.';
        }
        return null;
      },
      content: (
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            One truck can carry several grades or processes - add a line for each. Weigh each line in as many batches as it takes; they are summed automatically.
          </Text>
          {form.lines.map((line, i) => (
            <LineEditor
              key={line.key}
              index={i}
              line={line}
              removable={form.lines.length > 1}
              onChange={(patch) => updateLine(line.key, patch)}
              onRemove={() => draft.setValue((prev) => ({ ...prev, lines: prev.lines.filter((l) => l.key !== line.key) }))}
            />
          ))}
          <Button size="compact-sm" variant="subtle" leftSection={<IconPlus size={14} />} onClick={() => draft.setValue((prev) => ({ ...prev, lines: [...prev.lines, newLine()] }))}>
            Add another process / grade
          </Button>
        </Stack>
      ),
    },
  ];

  const review = (
    <Stack gap="sm">
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
        <Fig label="Delivery note" value={form.delivery_note_no || '—'} />
        <Fig label="Date" value={form.transfer_date} />
        <Fig label="Lines" value={String(form.lines.length)} />
        <Fig label="Total net" value={`${kg(form.lines.reduce((s, l) => s + lineTotals(l).net, 0), 2)} kg`} />
      </SimpleGrid>
      <Table withTableBorder>
        <Table.Thead>
          <Table.Tr><Table.Th>Grade</Table.Th><Table.Th ta="right">Bags</Table.Th><Table.Th ta="right">Gross (kg)</Table.Th><Table.Th ta="right">Net (kg)</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {form.lines.map((line) => {
            const t = lineTotals(line);
            return (
              <Table.Tr key={line.key}>
                <Table.Td>{line.grade ?? '—'}</Table.Td>
                <Table.Td ta="right">{t.bags}</Table.Td>
                <Table.Td ta="right">{kg(t.gross, 2)}</Table.Td>
                <Table.Td ta="right">{kg(t.net, 2)}</Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Stack>
  );

  async function save() {
    const transfer = await submit.run(() =>
      api<CwsTransfer>('/transfers/cws/', {
        method: 'POST',
        body: {
          facility: station.id,
          delivery_note_no: form.delivery_note_no.trim(),
          transfer_date: form.transfer_date,
          lines: form.lines.map((line) => {
            const t = lineTotals(line);
            return {
              process: line.process,
              sub_process: line.sub_process,
              grade: line.grade,
              moisture_content_pct: line.moisture_content_pct === '' ? null : line.moisture_content_pct,
              weight_of_bags_kg: line.weight_of_bags_kg === '' ? null : line.weight_of_bags_kg,
              weighings: t.rows.map((w) => ({ bags: num(w.bags), weight_kg: num(w.weight_kg) })),
            };
          }),
        },
      }),
    );
    if (!transfer) return;
    const totalNet = transfer.lines.reduce((s, l) => s + num(l.net_weight_kg), 0);
    toast.success(`${transfer.delivery_note_no}: ${transfer.lines.length} line${transfer.lines.length === 1 ? '' : 's'}, ${kg(totalNet, 2)} kg net. Submit it so dry mill can receive it.`, 'Transfer saved as draft');
    draft.reset();
    onSaved(transfer);
  }

  const close = () => {
    draft.reset();
    onClose();
  };

  return (
    <FormWizard
      opened
      onClose={close}
      title={`New transfer from ${station.name}`}
      steps={steps}
      review={review}
      onSubmit={save}
      submitLabel="Save as draft"
      saving={submit.saving}
      error={submit.error}
      size="60rem"
    />
  );
}

function LineEditor({
  index,
  line,
  removable,
  onChange,
  onRemove,
}: {
  index: number;
  line: LineForm;
  removable: boolean;
  onChange: (patch: Partial<LineForm>) => void;
  onRemove: () => void;
}) {
  const catalogGrades = useApi<CatalogProcessGrade[]>(line.process ? `/processing/catalog/processes/${line.process}/grades/` : null);
  const rows = line.weighings.filter((w) => num(w.bags) > 0 && num(w.weight_kg) > 0);
  const totalBags = rows.reduce((sum, w) => sum + num(w.bags), 0);
  const grossKg = rows.reduce((sum, w) => sum + num(w.weight_kg), 0);
  const bagsKg = line.weight_of_bags_kg === '' ? 0 : num(line.weight_of_bags_kg);
  const netKg = grossKg - bagsKg;

  const updateWeighing = (key: number, patch: Partial<WeighingRow>) =>
    onChange({ weighings: line.weighings.map((w) => (w.key === key ? { ...w, ...patch } : w)) });

  return (
    <Card withBorder radius="md" p="sm">
      <Group justify="space-between" mb="xs">
        <Text fw={600} size="sm">Line {index + 1}</Text>
        {removable && (
          <ActionIcon variant="subtle" color="red" aria-label={`Remove line ${index + 1}`} onClick={onRemove}>
            <IconTrash size={16} />
          </ActionIcon>
        )}
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 3 }} mb="sm">
        <ProcessPicker
          process={line.process}
          subProcess={line.sub_process}
          onChange={({ process, subProcess }) => onChange({ process, sub_process: subProcess, grade: null })}
        />
        <Select
          label="Grade"
          required
          placeholder={!line.process ? 'Choose the process first' : catalogGrades.loading ? 'Loading…' : 'Choose a grade'}
          data={(catalogGrades.data ?? []).map((g) => ({ value: g.id, label: g.name }))}
          value={line.grade}
          onChange={(v) => onChange({ grade: v })}
          disabled={!line.process}
        />
        <NumberInput label="Moisture content (%)" value={line.moisture_content_pct} onChange={(v) => onChange({ moisture_content_pct: v === '' ? '' : Number(v) })} min={0} max={100} decimalScale={1} hideControls />
      </SimpleGrid>
      <Table withTableBorder>
        <Table.Thead>
          <Table.Tr><Table.Th>Weighing</Table.Th><Table.Th>Bags</Table.Th><Table.Th>Weight (kg)</Table.Th><Table.Th /></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {line.weighings.map((w, i) => (
            <Table.Tr key={w.key}>
              <Table.Td>{i + 1}</Table.Td>
              <Table.Td>
                <NumberInput aria-label={`Bags ${i + 1}`} value={w.bags} onChange={(v) => updateWeighing(w.key, { bags: v === '' ? '' : Number(v) })} min={0} allowDecimal={false} hideControls maw={110} />
              </Table.Td>
              <Table.Td>
                <NumberInput aria-label={`Weight ${i + 1}`} value={w.weight_kg} onChange={(v) => updateWeighing(w.key, { weight_kg: v === '' ? '' : Number(v) })} min={0} hideControls thousandSeparator="," maw={140} />
              </Table.Td>
              <Table.Td>
                {line.weighings.length > 1 && (
                  <ActionIcon variant="subtle" color="red" aria-label="Remove weighing" onClick={() => onChange({ weighings: line.weighings.filter((x) => x.key !== w.key) })}>
                    <IconTrash size={16} />
                  </ActionIcon>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Group justify="space-between" mt="xs" wrap="wrap">
        <Button size="compact-sm" variant="subtle" leftSection={<IconPlus size={14} />} onClick={() => onChange({ weighings: [...line.weighings, newWeighing(Date.now())] })}>
          Add another weighing
        </Button>
        <NumberInput label="Weight of bags (kg)" value={line.weight_of_bags_kg} onChange={(v) => onChange({ weight_of_bags_kg: v === '' ? '' : Number(v) })} min={0} hideControls maw={160} />
      </Group>
      <Group gap="lg" mt="sm">
        <Fig label="Bags" value={String(totalBags)} />
        <Fig label="Gross weight" value={`${kg(grossKg, 2)} kg`} />
        <Fig label="Net weight" value={`${kg(netKg, 2)} kg`} />
      </Group>
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
