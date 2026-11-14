import { useState } from 'react';
import { Button, Group, NumberInput, SegmentedControl, Select, SimpleGrid, Stack, Table, Text, TextInput } from '@mantine/core';
import { IconUserPlus } from '@tabler/icons-react';
import { FormWizard } from '../../components/FormWizard';
import { api } from '../../lib/api';
import { kg, num, rwf, today } from '../../lib/format';
import { toast } from '../../lib/toast';
import type { CherryGrade, CherryReceipt, Facility, Farmer, PaymentMethod } from '../../lib/types';
import { query, useList } from '../../lib/useApi';
import { useDraft } from '../../lib/useDraft';
import { useSubmit } from '../../lib/useSubmit';
import { FarmerWizard } from './FarmerWizard';

type Num = number | '';
interface Line {
  quantityKg: Num;
  pricePerKg: Num;
  transportCost: Num;
  commission: Num;
}

interface GrnForm {
  farmer: string | null;
  received_on: string;
  lines: Record<CherryGrade, Line>;
  payment_status: 'UNPAID' | 'PAID';
  payment_method: PaymentMethod;
}

const GRADES: Array<{ grade: CherryGrade; label: string }> = [
  { grade: 'GOOD', label: 'Good cherry' },
  { grade: 'FLOAT', label: 'Float cherry' },
];
const FIELDS = [
  { field: 'quantityKg', label: 'Qty (kg)' },
  { field: 'pricePerKg', label: 'Price / kg (RWF)' },
  { field: 'transportCost', label: 'Transport (RWF)' },
  { field: 'commission', label: 'Commission (RWF)' },
] as const;
const emptyLine = (): Line => ({ quantityKg: '', pricePerKg: '', transportCost: 0, commission: 0 });
const blank = (): GrnForm => ({
  farmer: null,
  received_on: today(),
  lines: { GOOD: emptyLine(), FLOAT: emptyLine() },
  payment_status: 'UNPAID',
  payment_method: 'CASH',
});

/** Cherry delivery (GRN): farmer → Good/Float cherry → payment → review. */
export function GrnWizard({ station, onClose, onSaved }: { station: Facility; onClose: () => void; onSaved: (r: CherryReceipt) => void }) {
  const draft = useDraft<GrnForm>(`grn-${station.id}`, blank);
  const form = draft.value;
  const submit = useSubmit();
  const [registering, setRegistering] = useState(false);
  const farmers = useList<Farmer>(`/farmers/${query({ home_facility: station.id, is_active: 'true', page_size: 500 })}`);

  const rows = GRADES.map(({ grade, label }) => {
    const l = form.lines[grade];
    const qty = num(l.quantityKg);
    const amount = qty * num(l.pricePerKg);
    return { grade, label, qty, amount, extras: num(l.transportCost) + num(l.commission) };
  });
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const totalAmount = rows.reduce((s, r) => s + r.amount + r.extras, 0);
  const farmer = farmers.items.find((f) => f.id === form.farmer);

  const setLine = (grade: CherryGrade, field: keyof Line, value: number | string) =>
    draft.setValue((prev) => ({ ...prev, lines: { ...prev.lines, [grade]: { ...prev.lines[grade], [field]: value === '' ? '' : Number(value) } } }));

  const steps = [
    {
      label: 'Farmer',
      description: 'Who delivered',
      validate: () => (!form.farmer ? 'Choose the farmer who delivered the cherry.' : null),
      content: (
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <Select
            label="Farmer"
            required
            placeholder={farmers.loading ? 'Loading farmers…' : farmers.items.length ? 'Search by name or code' : 'No farmers yet: register one'}
            data={farmers.items.map((f) => ({ value: f.id, label: `${f.full_name} (${f.farmer_code})` }))}
            value={form.farmer}
            onChange={draft.set('farmer')}
            searchable
            nothingFoundMessage="Not found: register the farmer"
          />
          <TextInput label="Received on" type="date" value={form.received_on} onChange={(e) => draft.set('received_on')(e.currentTarget.value)} />
          <Button variant="light" mt={{ sm: 25 }} leftSection={<IconUserPlus size={16} />} onClick={() => setRegistering(true)}>
            Register new farmer
          </Button>
        </SimpleGrid>
      ),
    },
    {
      label: 'Cherry',
      description: 'Good & float',
      validate: () => (totalQty <= 0 ? 'Enter the quantity of Good or Float cherry.' : rows.some((r) => r.qty > 0 && num(form.lines[r.grade].pricePerKg) <= 0) ? 'Enter the price per kg for each line with a quantity.' : null),
      content: (
        <Table.ScrollContainer minWidth={700}>
          <Table withTableBorder verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Cherry</Table.Th>
                {FIELDS.map((f) => <Table.Th key={f.field}>{f.label}</Table.Th>)}
                <Table.Th ta="right">Line amount</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((r) => (
                <Table.Tr key={r.grade}>
                  <Table.Td fw={600}>{r.label}</Table.Td>
                  {FIELDS.map(({ field, label }) => (
                    <Table.Td key={field}>
                      <NumberInput aria-label={`${r.label} ${label}`} value={form.lines[r.grade][field]} onChange={(v) => setLine(r.grade, field, v)} min={0} hideControls thousandSeparator="," />
                    </Table.Td>
                  ))}
                  <Table.Td ta="right" fw={600}>{rwf(r.amount)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr>
                <Table.Th>Total</Table.Th>
                <Table.Th>{kg(totalQty)} kg</Table.Th>
                <Table.Th colSpan={3} />
                <Table.Th ta="right">{rwf(totalAmount)}</Table.Th>
              </Table.Tr>
            </Table.Tfoot>
          </Table>
        </Table.ScrollContainer>
      ),
    },
    {
      label: 'Payment',
      content: (
        <Group align="flex-end" gap="md">
          <div>
            <Text size="sm" fw={500} mb={4}>Payment</Text>
            <SegmentedControl
              value={form.payment_status}
              onChange={(v) => draft.set('payment_status')(v as GrnForm['payment_status'])}
              data={[
                { value: 'UNPAID', label: 'Not paid yet' },
                { value: 'PAID', label: 'Paid now' },
              ]}
            />
          </div>
          {form.payment_status === 'PAID' && (
            <Select
              label="Paid by"
              data={[
                { value: 'CASH', label: 'Cash' },
                { value: 'BANK', label: 'Bank' },
                { value: 'MOBILE_MONEY', label: 'Mobile money' },
              ]}
              value={form.payment_method}
              onChange={(v) => draft.set('payment_method')((v ?? 'CASH') as PaymentMethod)}
              allowDeselect={false}
              w={180}
            />
          )}
          <Text size="sm">Amount due: <strong>{rwf(totalAmount)}</strong></Text>
        </Group>
      ),
    },
  ];

  const review = (
    <Stack gap="xs">
      <SimpleGrid cols={{ base: 2, sm: 4 }}>
        <Fig label="Farmer" value={farmer ? `${farmer.full_name} (${farmer.farmer_code})` : ''} />
        <Fig label="Received on" value={form.received_on} />
        <Fig label="Quantity" value={`${kg(totalQty)} kg`} />
        <Fig label="Amount" value={rwf(totalAmount)} />
      </SimpleGrid>
      <Text size="sm" c="dimmed">
        {rows.filter((r) => r.qty > 0).map((r) => `${r.label}: ${kg(r.qty)} kg × ${rwf(form.lines[r.grade].pricePerKg)}`).join(' · ')} ·{' '}
        {form.payment_status === 'PAID' ? `paid by ${form.payment_method.replace('_', ' ').toLowerCase()}` : 'not paid yet'}
      </Text>
      <Text size="xs" c="dimmed">The GRN number is assigned automatically when saved.</Text>
    </Stack>
  );

  async function save() {
    const receipt = await submit.run(() =>
      api<CherryReceipt>('/reception/receipts/', {
        method: 'POST',
        body: {
          facility: station.id,
          farmer: form.farmer,
          received_on: form.received_on,
          payment_status: form.payment_status,
          payment_method: form.payment_status === 'PAID' ? form.payment_method : '',
          lines: rows
            .filter((r) => r.qty > 0)
            .map((r) => ({
              cherry_grade: r.grade,
              quantity_kg: r.qty,
              price_per_kg: num(form.lines[r.grade].pricePerKg),
              transport_cost: num(form.lines[r.grade].transportCost),
              commission: num(form.lines[r.grade].commission),
            })),
        },
      }),
    );
    if (!receipt) return;
    toast.success(`GRN ${receipt.grn_number} for ${receipt.farmer_name}: ${kg(receipt.total_kg)} kg, ${rwf(receipt.total_amount)}.`, 'GRN saved');
    draft.reset();
    onSaved(receipt);
  }

  return (
    <>
      <FormWizard opened={!registering} onClose={onClose} title={`New GRN at ${station.name}`} steps={steps} review={review} onSubmit={save} submitLabel="Save GRN" saving={submit.saving} error={submit.error} />
      {registering && (
        <FarmerWizard
          stationId={station.id}
          stationName={station.name}
          onClose={() => setRegistering(false)}
          onSaved={(f) => {
            setRegistering(false);
            farmers.reload();
            draft.set('farmer')(f.id);
          }}
        />
      )}
    </>
  );
}

function Fig({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text fw={600} size="sm">{value || '—'}</Text>
    </div>
  );
}
