import { useEffect, useState } from 'react';
import { ActionIcon, Alert, Autocomplete, Badge, Button, Card, Group, NumberInput, SegmentedControl, Select, SimpleGrid, Stack, Table, Text, TextInput, Textarea } from '@mantine/core';
import { IconLock, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react';
import { FormWizard } from '../../components/FormWizard';
import { ProcessPicker } from '../../components/ProcessPicker';
import { SourceSelect } from '../../components/SourceSelect';
import { api } from '../../lib/api';
import { kg, num, today } from '../../lib/format';
import { sourceFields } from '../../lib/sources';
import { toast } from '../../lib/toast';
import type { DryMillTransferReceipt, HqStockReceipt } from '../../lib/types';
import { errorText, query } from '../../lib/useApi';
import { useDraft } from '../../lib/useDraft';
import { useSubmit } from '../../lib/useSubmit';

const COMMON_GRADES = ['A1', 'A2', 'A3', 'A4', 'HG', 'HPC', 'FLOAT', 'HC', 'LG'];

type Num = number | '';

interface WeighingRow {
  key: number;
  bags: Num;
  weight_kg: Num;
}

interface ReceiptForm {
  arrival_date: string;
  source: string | null;
  item_type: 'PARCH' | 'GREEN';
  process: string | null;
  sub_process: string | null;
  grade: string;
  lot_reference: string;
  delivery_note_no: string;
  delivery_note_qty_kg: Num;
  weighing_status: 'PENDING' | 'DONE';
  gross_weight_kg: Num;
  net_weight_kg: Num;
  number_of_bags: Num;
  tare_per_bag_kg: Num;
  weight_of_bags_kg: Num;
  purchase_contract_number: string;
  wrn_number: string;
  warehouse_cell: string;
  stock_card_number: string;
  quality_status: 'PENDING' | 'ACCEPTED';
}

const toNum = (value: string | number | null | undefined): Num => (value === null || value === undefined || value === '' ? '' : Number(value));
const newWeighing = (key = Date.now()): WeighingRow => ({ key, bags: '', weight_kg: '' });

function blank(): ReceiptForm {
  return {
    arrival_date: today(),
    source: null,
    item_type: 'PARCH',
    process: null,
    sub_process: null,
    grade: '',
    lot_reference: '',
    delivery_note_no: '',
    delivery_note_qty_kg: '',
    weighing_status: 'DONE',
    gross_weight_kg: '',
    net_weight_kg: '',
    number_of_bags: '',
    tare_per_bag_kg: '',
    weight_of_bags_kg: '',
    purchase_contract_number: '',
    wrn_number: '',
    warehouse_cell: '',
    stock_card_number: '',
    quality_status: 'PENDING',
  };
}

function fromReceipt(r: HqStockReceipt): ReceiptForm {
  return {
    arrival_date: r.arrival_date,
    source: r.source_facility ? `OWN_CWS:${r.source_facility}` : r.source_supplier ? `PARTNER_SUPPLIER:${r.source_supplier}` : null,
    item_type: r.item_type,
    process: r.process,
    sub_process: r.sub_process,
    grade: r.grade,
    lot_reference: r.lot_reference,
    delivery_note_no: r.delivery_note_no,
    delivery_note_qty_kg: toNum(r.delivery_note_qty_kg),
    weighing_status: r.weighing_status,
    gross_weight_kg: toNum(r.gross_weight_kg),
    net_weight_kg: toNum(r.net_weight_kg),
    number_of_bags: toNum(r.number_of_bags),
    tare_per_bag_kg: toNum(r.tare_per_bag_kg),
    weight_of_bags_kg: toNum(r.weight_of_bags_kg),
    purchase_contract_number: r.purchase_contract_number,
    wrn_number: r.wrn_number,
    warehouse_cell: r.warehouse_cell,
    stock_card_number: r.stock_card_number,
    quality_status: r.quality_status === 'ACCEPTED' ? 'ACCEPTED' : 'PENDING',
  };
}

interface Props {
  opened: boolean;
  onClose: () => void;
  /** Edit this receipt; omit to log a new one. */
  receipt?: HqStockReceipt | null;
  knownGrades?: string[];
  canAddSubProcess?: boolean;
  onSaved: (receipt?: HqStockReceipt) => void;
}

/**
 * Log or correct an HQ stock receipt. A partner supplier is recorded exactly
 * as before (every column of the BAHO STOCK UPDATE sheet). A Baho CWS is
 * different: that station already recorded its own delivery note, so here
 * we only link that delivery note number and weigh it independently - the
 * process/sub-process/grade and the station's own figures are never
 * re-typed, and stay hidden until this weighing is confirmed.
 */
export function StockReceiptWizard({ opened, onClose, receipt, knownGrades = [], canAddSubProcess = false, onSaved }: Props) {
  const editing = !!receipt;
  // New receipts keep a draft; edits start from the receipt (render with key={receipt.id}).
  const draft = useDraft<ReceiptForm>(editing ? null : 'stock-receipt', () => (receipt ? fromReceipt(receipt) : blank()));
  const form = draft.value;
  const set = draft.set;
  const submit = useSubmit();
  const weightsLocked = editing && (num(receipt!.processed_kg) > 0 || num(receipt!.adjusted_kg) !== 0);

  const bagsKg = form.weight_of_bags_kg !== '' ? num(form.weight_of_bags_kg) : num(form.number_of_bags) * num(form.tare_per_bag_kg);
  const pure = num(form.net_weight_kg) - bagsKg;
  const variance = form.delivery_note_qty_kg === '' ? null : num(form.net_weight_kg) - num(form.delivery_note_qty_kg);
  // Received from a Baho CWS: the grade comes from what that CWS already registered
  // for this process (no need to create others here). A partner supplier has no such
  // registration, so dry mill can still type a new grade for them.
  const isCwsSource = form.source?.startsWith('OWN_CWS:') ?? false;
  // Brand-new receipts from a CWS go through the delivery-note link + blind weighing
  // below instead of the manual form; editing an existing receipt never does.
  const cwsMode = !editing && isCwsSource;
  const grades = Array.from(new Set([...knownGrades, ...COMMON_GRADES]));

  // --- CWS delivery-note linking (ephemeral: not part of the manual-form draft) ---
  const [deliveryNoteNo, setDeliveryNoteNo] = useState('');
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [dmReceipt, setDmReceipt] = useState<DryMillTransferReceipt | null>(null);
  const [lineInputs, setLineInputs] = useState<Record<string, { weighings: WeighingRow[]; weight_of_bags_kg: Num }>>({});
  const [comment, setComment] = useState('');
  const [locking, setLocking] = useState(false);
  const [lockError, setLockError] = useState('');
  const locked = dmReceipt ? dmReceipt.status !== 'PENDING' : false;

  // Changing the source clears any delivery note already linked, so a stale lookup never carries over.
  useEffect(() => {
    setDmReceipt(null);
    setLineInputs({});
    setDeliveryNoteNo('');
    setLookupError('');
    setComment('');
    setLockError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.source]);

  async function lookupDeliveryNote() {
    const note = deliveryNoteNo.trim();
    if (!note) return;
    setLooking(true);
    setLookupError('');
    try {
      const found = await api<DryMillTransferReceipt>(`/transfers/dry-mill/lookup/${query({ delivery_note_no: note })}`);
      setDmReceipt(found);
      setLineInputs(Object.fromEntries(found.lines.map((l) => [l.id, { weighings: [newWeighing(1)], weight_of_bags_kg: '' as Num }])));
    } catch (err) {
      setLookupError(errorText(err));
    } finally {
      setLooking(false);
    }
  }

  async function lockCws() {
    if (!dmReceipt) return;
    setLocking(true);
    setLockError('');
    try {
      for (const line of dmReceipt.lines) {
        const t = lineTotals(line.id);
        const input = lineInputs[line.id];
        await api(`/transfers/dry-mill/${dmReceipt.id}/lines/${line.id}/`, {
          method: 'PATCH',
          body: {
            weighings: t.rows.map((w) => ({ bags: num(w.bags), weight_kg: num(w.weight_kg) })),
            weight_of_bags_kg: input?.weight_of_bags_kg === '' || input?.weight_of_bags_kg === undefined ? null : input.weight_of_bags_kg,
          },
        });
      }
      const result = await api<DryMillTransferReceipt>(`/transfers/dry-mill/${dmReceipt.id}/lock/`, { method: 'POST' });
      setDmReceipt(result);
    } catch (err) {
      setLockError(errorText(err));
    } finally {
      setLocking(false);
    }
  }

  function lineTotals(lineId: string) {
    const input = lineInputs[lineId];
    const rows = (input?.weighings ?? []).filter((w) => num(w.bags) > 0 && num(w.weight_kg) > 0);
    const bags = rows.reduce((sum, w) => sum + num(w.bags), 0);
    const gross = rows.reduce((sum, w) => sum + num(w.weight_kg), 0);
    const bagsKgForLine = input?.weight_of_bags_kg === '' || input?.weight_of_bags_kg === undefined ? 0 : num(input.weight_of_bags_kg);
    return { rows, bags, gross, bagsKg: bagsKgForLine, net: gross - bagsKgForLine };
  }

  const normalSteps = [
    {
      label: 'Coffee',
      description: 'Process & grade',
      validate: () => (!form.process ? 'Choose one of the five processes.' : null),
      content: (
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <ProcessPicker
            process={form.process}
            subProcess={form.sub_process}
            canAdd={canAddSubProcess}
            onChange={({ process, subProcess }) => draft.setValue((prev) => ({ ...prev, process, sub_process: subProcess }))}
          />
          <Autocomplete label="Grade" data={grades} value={form.grade} onChange={(v) => set('grade')(v.toUpperCase())} description={form.process ? 'Type a new grade if needed' : undefined} />
          <TextInput label="Lot ID" value={form.lot_reference} onChange={(e) => set('lot_reference')(e.currentTarget.value)} />
          {editing && receipt!.process_raw && (
            <Text size="xs" c="dimmed">
              Originally recorded as “{receipt!.process_raw}”.
            </Text>
          )}
        </SimpleGrid>
      ),
    },
    {
      label: 'Weighing',
      description: 'Delivery note & scale',
      validate: () => {
        if (num(form.net_weight_kg) <= 0) return 'Enter the net weight.';
        if (bagsKg > num(form.net_weight_kg)) return 'Weight of bags cannot be more than the net weight.';
        return null;
      },
      content: (
        <Stack gap="sm">
          {weightsLocked && (
            <Alert color="yellow" variant="light" icon={<IconLock size={16} />}>
              Stock from this receipt has already been milled or adjusted, so its weights are locked. Use “Adjust stock” to correct the quantity.
            </Alert>
          )}
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <TextInput label="Delivery note no." value={form.delivery_note_no} onChange={(e) => set('delivery_note_no')(e.currentTarget.value)} />
            <NumberInput label="Delivery note qty (kg)" value={form.delivery_note_qty_kg} onChange={(v) => set('delivery_note_qty_kg')(toNum(v))} min={0} hideControls thousandSeparator="," />
            <Select
              label="Weighing status"
              data={[
                { value: 'DONE', label: 'Done' },
                { value: 'PENDING', label: 'Pending' },
              ]}
              value={form.weighing_status}
              onChange={(v) => set('weighing_status')((v ?? 'DONE') as ReceiptForm['weighing_status'])}
              allowDeselect={false}
            />
            <NumberInput label="Gross weight (kg)" value={form.gross_weight_kg} onChange={(v) => set('gross_weight_kg')(toNum(v))} min={0} hideControls thousandSeparator="," disabled={weightsLocked} />
            <NumberInput label="Net weight (kg)" required value={form.net_weight_kg} onChange={(v) => set('net_weight_kg')(toNum(v))} min={0} hideControls thousandSeparator="," disabled={weightsLocked} />
            <NumberInput label="Number of bags" value={form.number_of_bags} onChange={(v) => set('number_of_bags')(toNum(v))} min={0} allowDecimal={false} hideControls disabled={weightsLocked} />
            <NumberInput label="Tare per bag (kg)" value={form.tare_per_bag_kg} onChange={(v) => set('tare_per_bag_kg')(toNum(v))} min={0} decimalScale={3} hideControls disabled={weightsLocked} />
            <NumberInput
              label="Weight of bags (kg)"
              description="Empty = bags × tare"
              value={form.weight_of_bags_kg}
              onChange={(v) => set('weight_of_bags_kg')(toNum(v))}
              min={0}
              hideControls
              disabled={weightsLocked}
            />
          </SimpleGrid>
          <Card withBorder radius="md" p="sm" bg="gray.0">
            <SimpleGrid cols={3}>
              <Figure label="Weight of bags" value={`${kg(bagsKg, 2)} kg`} />
              <Figure label="Pure weight" value={`${kg(pure, 2)} kg`} />
              <Figure label="Variance vs delivery note" value={variance === null ? '—' : `${kg(variance, 2)} kg`} />
            </SimpleGrid>
          </Card>
        </Stack>
      ),
    },
    {
      label: 'Documents & storage',
      description: 'Contract, WRN, cell',
      content: (
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label="Purchase contract no." value={form.purchase_contract_number} onChange={(e) => set('purchase_contract_number')(e.currentTarget.value)} />
          <TextInput label="WRN number" value={form.wrn_number} onChange={(e) => set('wrn_number')(e.currentTarget.value)} />
          <TextInput label="Warehouse cell" value={form.warehouse_cell} onChange={(e) => set('warehouse_cell')(e.currentTarget.value)} />
          <TextInput label="Stock card no." value={form.stock_card_number} onChange={(e) => set('stock_card_number')(e.currentTarget.value)} />
          {!editing && (
            <div>
              <Text size="sm" fw={500} mb={4}>Quality</Text>
              <SegmentedControl
                value={form.quality_status}
                onChange={(v) => set('quality_status')(v as ReceiptForm['quality_status'])}
                data={[
                  { value: 'PENDING', label: 'Pending check' },
                  { value: 'ACCEPTED', label: 'Accepted' },
                ]}
              />
              <Text size="xs" c="dimmed" mt={4}>Only accepted coffee can be milled.</Text>
            </div>
          )}
        </SimpleGrid>
      ),
    },
  ];

  const cwsSteps = [
    {
      label: 'Delivery note',
      description: 'Link the station’s own record',
      validate: () => (!dmReceipt ? 'Look up the delivery note first.' : null),
      content: (
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            The station already recorded this delivery’s process, sub-process and grades when it registered the transfer - look it up by its delivery note number instead of re-typing them.
          </Text>
          <Group align="flex-end">
            <TextInput label="Delivery note no." value={deliveryNoteNo} onChange={(e) => setDeliveryNoteNo(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && lookupDeliveryNote()} w={260} data-autofocus />
            <Button leftSection={<IconSearch size={16} />} onClick={lookupDeliveryNote} loading={looking}>Find</Button>
          </Group>
          {lookupError && <Alert color="red" variant="light">{lookupError}</Alert>}
          {dmReceipt && (
            <Alert color="blue" variant="light">
              Found: {dmReceipt.facility_name}, {dmReceipt.lines.length} line{dmReceipt.lines.length === 1 ? '' : 's'} to weigh. The station's own figures stay hidden until you confirm.
            </Alert>
          )}
        </Stack>
      ),
    },
    {
      label: 'Weighing',
      description: locked ? 'Variance revealed' : 'Blind, line by line',
      validate: () => {
        if (!dmReceipt) return 'Look up the delivery note first.';
        if (!locked) return 'Lock the weighing and review the variance before continuing.';
        return null;
      },
      content: !dmReceipt ? (
        <Text size="sm" c="dimmed">Look up a delivery note first.</Text>
      ) : locked ? (
        <Stack gap="md">
          <Alert color="blue" variant="light">
            Weighing locked - these numbers can no longer be changed here (an admin can unlock them if needed).
          </Alert>
          {dmReceipt.lines.map((line) => {
            const cws = line.cws_line as { process_name?: string; sub_process_name?: string; grade_code?: string; number_of_bags?: number; gross_weight_kg?: string; weight_of_bags_kg?: string; net_weight_kg?: string };
            return (
              <Card withBorder radius="md" p="sm" key={line.id}>
                <Group justify="space-between" mb="xs">
                  <Text fw={600} size="sm">
                    {cws.process_name}{cws.sub_process_name ? ` / ${cws.sub_process_name}` : ''} · {cws.grade_code}
                  </Text>
                  {line.variance_status && line.variance_status !== 'MATCH' && (
                    <Badge color={line.variance_status === 'STOCK_LOSS' ? 'red' : 'green'} variant="light">
                      {line.variance_status === 'STOCK_LOSS' ? 'Stock loss' : 'Stock gain'}
                    </Badge>
                  )}
                </Group>
                <Table withTableBorder>
                  <Table.Thead>
                    <Table.Tr><Table.Th /><Table.Th ta="right">Bags</Table.Th><Table.Th ta="right">Gross (kg)</Table.Th><Table.Th ta="right">Bag weight (kg)</Table.Th><Table.Th ta="right">Net (kg)</Table.Th></Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    <Table.Tr>
                      <Table.Td c="dimmed">Station recorded</Table.Td>
                      <Table.Td ta="right">{cws.number_of_bags}</Table.Td>
                      <Table.Td ta="right">{kg(cws.gross_weight_kg, 2)}</Table.Td>
                      <Table.Td ta="right">{kg(cws.weight_of_bags_kg, 2)}</Table.Td>
                      <Table.Td ta="right">{kg(cws.net_weight_kg, 2)}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td c="dimmed">We weighed</Table.Td>
                      <Table.Td ta="right">{line.number_of_bags}</Table.Td>
                      <Table.Td ta="right">{kg(line.gross_weight_kg, 2)}</Table.Td>
                      <Table.Td ta="right">{kg(line.weight_of_bags_kg, 2)}</Table.Td>
                      <Table.Td ta="right">{kg(line.net_weight_kg, 2)}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td fw={600}>Difference</Table.Td>
                      <Table.Td ta="right" fw={600} c={line.variance?.number_of_bags ? 'red' : undefined}>{line.variance?.number_of_bags ?? 0}</Table.Td>
                      <Table.Td ta="right" fw={600} c={num(line.variance?.gross_weight_kg) ? 'red' : undefined}>{kg(line.variance?.gross_weight_kg, 2)}</Table.Td>
                      <Table.Td ta="right" fw={600} c={num(line.variance?.weight_of_bags_kg) ? 'red' : undefined}>{kg(line.variance?.weight_of_bags_kg, 2)}</Table.Td>
                      <Table.Td ta="right" fw={600} c={num(line.variance?.net_weight_kg) ? 'red' : undefined}>{kg(line.variance?.net_weight_kg, 2)}</Table.Td>
                    </Table.Tr>
                  </Table.Tbody>
                </Table>
              </Card>
            );
          })}
          <Textarea
            label="Comment"
            description="Explain any difference above - bags, gross, bag weight or net. Required only if something doesn't match."
            value={comment}
            onChange={(e) => setComment(e.currentTarget.value)}
            minRows={2}
          />
        </Stack>
      ) : (
        <Stack gap="md">
          {dmReceipt.lines.map((line, i) => {
            const cws = line.cws_line as { process_name?: string; sub_process_name?: string; grade_code?: string };
            const input = lineInputs[line.id] ?? { weighings: [newWeighing(1)], weight_of_bags_kg: '' as Num };
            const t = lineTotals(line.id);
            const setLine = (patch: Partial<{ weighings: WeighingRow[]; weight_of_bags_kg: Num }>) =>
              setLineInputs((prev) => ({ ...prev, [line.id]: { ...input, ...patch } }));
            return (
              <Card withBorder radius="md" p="sm" key={line.id}>
                <Text fw={600} size="sm" mb="xs">
                  Line {i + 1}: {cws.process_name}{cws.sub_process_name ? ` / ${cws.sub_process_name}` : ''} · {cws.grade_code}
                </Text>
                <Table withTableBorder>
                  <Table.Thead>
                    <Table.Tr><Table.Th>Weighing</Table.Th><Table.Th>Bags</Table.Th><Table.Th>Weight (kg)</Table.Th><Table.Th /></Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {input.weighings.map((w, wi) => (
                      <Table.Tr key={w.key}>
                        <Table.Td>{wi + 1}</Table.Td>
                        <Table.Td>
                          <NumberInput aria-label={`Bags ${wi + 1}`} value={w.bags} onChange={(v) => setLine({ weighings: input.weighings.map((x) => (x.key === w.key ? { ...x, bags: v === '' ? '' : Number(v) } : x)) })} min={0} allowDecimal={false} hideControls maw={110} />
                        </Table.Td>
                        <Table.Td>
                          <NumberInput aria-label={`Weight ${wi + 1}`} value={w.weight_kg} onChange={(v) => setLine({ weighings: input.weighings.map((x) => (x.key === w.key ? { ...x, weight_kg: v === '' ? '' : Number(v) } : x)) })} min={0} hideControls thousandSeparator="," maw={140} />
                        </Table.Td>
                        <Table.Td>
                          {input.weighings.length > 1 && (
                            <ActionIcon variant="subtle" color="red" aria-label="Remove weighing" onClick={() => setLine({ weighings: input.weighings.filter((x) => x.key !== w.key) })}>
                              <IconTrash size={16} />
                            </ActionIcon>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
                <Group justify="space-between" mt="xs" wrap="wrap">
                  <Button size="compact-sm" variant="subtle" leftSection={<IconPlus size={14} />} onClick={() => setLine({ weighings: [...input.weighings, newWeighing(Date.now())] })}>
                    Add another weighing
                  </Button>
                  <NumberInput label="Weight of bags (kg)" value={input.weight_of_bags_kg} onChange={(v) => setLine({ weight_of_bags_kg: v === '' ? '' : Number(v) })} min={0} hideControls maw={160} />
                </Group>
                <Group gap="lg" mt="sm">
                  <Figure label="Bags" value={String(t.bags)} />
                  <Figure label="Gross weight" value={`${kg(t.gross, 2)} kg`} />
                  <Figure label="Net weight" value={`${kg(t.net, 2)} kg`} />
                </Group>
              </Card>
            );
          })}
          {lockError && <Alert color="red" variant="light">{lockError}</Alert>}
          <Group justify="flex-end">
            <Button leftSection={<IconLock size={16} />} onClick={lockCws} loading={locking}>Lock & review variance</Button>
          </Group>
        </Stack>
      ),
    },
  ];

  const steps = cwsMode ? cwsSteps : normalSteps;

  const review = cwsMode ? (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">Submitting will save this comment and create the matching stock receipt(s). The weighing is already locked and cannot be changed here afterwards.</Text>
      {dmReceipt && (
        <Table withTableBorder>
          <Table.Thead>
            <Table.Tr><Table.Th>Line</Table.Th><Table.Th ta="right">Bags</Table.Th><Table.Th ta="right">Gross (kg)</Table.Th><Table.Th ta="right">Net (kg)</Table.Th><Table.Th>Variance</Table.Th></Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {dmReceipt.lines.map((line) => {
              const cws = line.cws_line as { grade_code?: string };
              return (
                <Table.Tr key={line.id}>
                  <Table.Td>{cws.grade_code}</Table.Td>
                  <Table.Td ta="right">{line.number_of_bags}</Table.Td>
                  <Table.Td ta="right">{kg(line.gross_weight_kg, 2)}</Table.Td>
                  <Table.Td ta="right">{kg(line.net_weight_kg, 2)}</Table.Td>
                  <Table.Td>{line.variance_status === 'MATCH' || !line.variance_status ? '—' : line.variance_status === 'STOCK_LOSS' ? 'Stock loss' : 'Stock gain'}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      )}
      {comment && <Text size="sm"><strong>Comment:</strong> {comment}</Text>}
    </Stack>
  ) : (
    <Stack gap="xs">
      <Group gap="xs">
        <Badge variant="light">{form.item_type === 'PARCH' ? 'Parchment' : 'Green'}</Badge>
        {!editing && <Badge variant="light" color={form.quality_status === 'ACCEPTED' ? 'green' : 'yellow'}>{form.quality_status === 'ACCEPTED' ? 'Accepted' : 'Pending quality'}</Badge>}
      </Group>
      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
        <Figure label="Arrival" value={form.arrival_date} />
        <Figure label="Grade" value={form.grade || '—'} />
        <Figure label="Lot ID" value={form.lot_reference || '—'} />
        <Figure label="Net weight" value={`${kg(form.net_weight_kg)} kg`} />
        <Figure label="Bags" value={`${kg(bagsKg, 2)} kg`} />
        <Figure label="Pure weight" value={`${kg(pure, 2)} kg`} />
        <Figure label="Delivery note" value={[form.delivery_note_no, form.delivery_note_qty_kg !== '' ? `${kg(form.delivery_note_qty_kg)} kg` : ''].filter(Boolean).join(' · ') || '—'} />
        <Figure label="Contract / WRN" value={[form.purchase_contract_number, form.wrn_number].filter(Boolean).join(' · ') || '—'} />
        <Figure label="Cell / stock card" value={[form.warehouse_cell, form.stock_card_number].filter(Boolean).join(' · ') || '—'} />
      </SimpleGrid>
    </Stack>
  );

  async function saveCws() {
    if (!dmReceipt) return;
    // The weighing is already locked (see "Lock & review variance" above) - this
    // step only attaches the comment and creates the matching stock receipt(s).
    const result = await submit.run(() =>
      api<DryMillTransferReceipt>(`/transfers/dry-mill/${dmReceipt.id}/submit/`, {
        method: 'POST',
        body: { comment, arrival_date: form.arrival_date },
      }),
    );
    if (!result) return;
    const loss = result.lines.filter((l) => l.variance_status === 'STOCK_LOSS').length;
    const gain = result.lines.filter((l) => l.variance_status === 'STOCK_GAIN').length;
    const note = loss || gain ? ` (${[loss && `${loss} loss`, gain && `${gain} gain`].filter(Boolean).join(', ')})` : ' - matched';
    toast.success(`${result.delivery_note_no} confirmed: ${result.lines.length} line${result.lines.length === 1 ? '' : 's'}${note}.`, 'Receipt confirmed');
    draft.reset();
    setDmReceipt(null);
    onSaved();
  }

  async function save() {
    if (cwsMode) return saveCws();
    const origin = sourceFields(form.source);
    const body: Record<string, unknown> = {
      arrival_date: form.arrival_date,
      source_facility: origin?.source_facility ?? null,
      source_supplier: origin?.source_supplier ?? null,
      item_type: form.item_type,
      process: form.process,
      sub_process: form.sub_process,
      grade: form.grade,
      lot_reference: form.lot_reference,
      delivery_note_no: form.delivery_note_no,
      delivery_note_qty_kg: form.delivery_note_qty_kg === '' ? null : form.delivery_note_qty_kg,
      weighing_status: form.weighing_status,
      purchase_contract_number: form.purchase_contract_number,
      wrn_number: form.wrn_number,
      warehouse_cell: form.warehouse_cell,
      stock_card_number: form.stock_card_number,
    };
    if (!weightsLocked) {
      Object.assign(body, {
        gross_weight_kg: form.gross_weight_kg === '' ? null : form.gross_weight_kg,
        net_weight_kg: form.net_weight_kg,
        number_of_bags: form.number_of_bags === '' ? null : form.number_of_bags,
        tare_per_bag_kg: form.tare_per_bag_kg === '' ? null : form.tare_per_bag_kg,
        weight_of_bags_kg: form.weight_of_bags_kg === '' ? null : form.weight_of_bags_kg,
      });
    }
    if (!editing) body.quality_status = form.quality_status;
    const saved = await submit.run(() =>
      editing
        ? api<HqStockReceipt>(`/drymill/stock-receipts/${receipt!.id}/`, { method: 'PATCH', body })
        : api<HqStockReceipt>('/drymill/stock-receipts/', { method: 'POST', body }),
    );
    if (!saved) return;
    toast.success(
      `${saved.receipt_number}: ${kg(saved.net_weight_kg)} kg ${saved.process_name}${saved.sub_process_name ? ` / ${saved.sub_process_name}` : ''} from ${saved.source_name}.`,
      editing ? 'Receipt updated' : 'Stock receipt saved',
    );
    draft.reset();
    onSaved(saved);
  }

  // Closing a new receipt without saving (Cancel, X, Esc) also clears its draft,
  // so the next "Log new stock receipt" starts blank. Editing an existing receipt
  // has no draft to clear (its key is null).
  const close = () => {
    if (!editing) draft.reset();
    onClose();
  };

  return (
    <FormWizard
      opened={opened}
      onClose={close}
      title={editing ? `Edit ${receipt!.receipt_number}` : cwsMode ? 'Receive delivery from CWS' : 'Log new stock receipt'}
      steps={[
        {
          label: 'Source & arrival',
          description: 'Where it came from',
          validate: () => (!form.source ? 'Choose the CWS or supplier the coffee came from.' : !form.arrival_date ? 'Enter the arrival date.' : null),
          content: (
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <SourceSelect value={form.source} onChange={set('source')} required />
              <TextInput label="Arrival date" type="date" required value={form.arrival_date} onChange={(e) => set('arrival_date')(e.currentTarget.value)} />
              {!cwsMode && (
                <div>
                  <Text size="sm" fw={500} mb={4}>Type</Text>
                  <SegmentedControl
                    value={form.item_type}
                    onChange={(v) => set('item_type')(v as ReceiptForm['item_type'])}
                    data={[
                      { value: 'PARCH', label: 'Parchment' },
                      { value: 'GREEN', label: 'Green' },
                    ]}
                  />
                </div>
              )}
              <Text size="xs" c="dimmed" mt={{ sm: 28 }}>
                {cwsMode
                  ? 'A Baho CWS delivery is always parchment. Its process, sub-process and grades come from the delivery note you link next.'
                  : 'Origin (Baho / Partner) and crop year are set automatically from the source and date.'}
              </Text>
            </SimpleGrid>
          ),
        },
        ...steps,
      ]}
      review={review}
      onSubmit={save}
      submitLabel={editing ? 'Save changes' : cwsMode ? 'Submit' : 'Save receipt'}
      saving={submit.saving}
      error={submit.error}
    />
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text fw={600} size="sm">{value}</Text>
    </div>
  );
}
