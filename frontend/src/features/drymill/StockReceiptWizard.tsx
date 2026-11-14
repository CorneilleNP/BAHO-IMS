import { Alert, Autocomplete, Badge, Card, Group, NumberInput, SegmentedControl, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { FormWizard } from '../../components/FormWizard';
import { ProcessPicker } from '../../components/ProcessPicker';
import { SourceSelect } from '../../components/SourceSelect';
import { api } from '../../lib/api';
import { kg, num, today } from '../../lib/format';
import { sourceFields } from '../../lib/sources';
import { toast } from '../../lib/toast';
import type { HqStockReceipt } from '../../lib/types';
import { useDraft } from '../../lib/useDraft';
import { useSubmit } from '../../lib/useSubmit';

const COMMON_GRADES = ['A1', 'A2', 'A3', 'A4', 'HG', 'HPC', 'FLOAT', 'HC', 'LG'];

type Num = number | '';

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
  onSaved: (receipt: HqStockReceipt) => void;
}

/** Log or correct an HQ stock receipt: every column of the BAHO STOCK UPDATE sheet, in 4 steps + review. */
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
  const grades = Array.from(new Set([...knownGrades, ...COMMON_GRADES]));

  const steps = [
    {
      label: 'Source & arrival',
      description: 'Where it came from',
      validate: () => (!form.source ? 'Choose the CWS or supplier the coffee came from.' : !form.arrival_date ? 'Enter the arrival date.' : null),
      content: (
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <SourceSelect value={form.source} onChange={set('source')} required />
          <TextInput label="Arrival date" type="date" required value={form.arrival_date} onChange={(e) => set('arrival_date')(e.currentTarget.value)} />
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
          <Text size="xs" c="dimmed" mt={{ sm: 28 }}>
            Origin (Baho / Partner) and crop year are set automatically from the source and date.
          </Text>
        </SimpleGrid>
      ),
    },
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
          <Autocomplete label="Grade" data={grades} value={form.grade} onChange={(v) => set('grade')(v.toUpperCase())} />
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

  const review = (
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

  async function save() {
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

  return (
    <FormWizard
      opened={opened}
      onClose={onClose}
      title={editing ? `Edit ${receipt!.receipt_number}` : 'Log new stock receipt'}
      steps={steps}
      review={review}
      onSubmit={save}
      submitLabel={editing ? 'Save changes' : 'Save receipt'}
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
