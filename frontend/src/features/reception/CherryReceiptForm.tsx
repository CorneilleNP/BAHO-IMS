import { useMemo, useState } from 'react';
import { Badge, Button, Card, Group, Modal, NumberInput, SegmentedControl, Select, SimpleGrid, Stack, Table, Text, TextInput } from '@mantine/core';
import { IconCoffee, IconUserPlus } from '@tabler/icons-react';
import { DataTable } from '../../components/DataTable';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import { EmptyState, ErrorMessage } from '../../components/Feedback';
import { LocationPicker } from '../../components/LocationPicker';
import { PageHeader } from '../../components/PageHeader';
import { PageSkeleton } from '../../components/Skeletons';
import { StationSelect } from '../../components/StationSelect';
import { VoidButton } from '../../components/VoidButton';
import { api } from '../../lib/api';
import { canWrite } from '../../lib/access';
import { useAuth } from '../../lib/authContext';
import { fetchAllPages } from '../../lib/exportTable';
import { ANY_DATE, kg, num, rwf, today, type DateRange } from '../../lib/format';
import { toast } from '../../lib/toast';
import { useMyStations } from '../../lib/stations';
import type { CherryGrade, CherryReceipt, Farmer, PaymentMethod } from '../../lib/types';
import { query, useList } from '../../lib/useApi';
import { useSubmit } from '../../lib/useSubmit';

interface LineState {
  quantityKg: number | '';
  pricePerKg: number | '';
  transportCost: number | '';
  commission: number | '';
}

const GRADES: Array<{ grade: CherryGrade; label: string }> = [
  { grade: 'GOOD', label: 'Good cherry' },
  { grade: 'FLOAT', label: 'Float cherry' },
];
const LINE_FIELDS = [
  { field: 'quantityKg', label: 'Qty (kg)' },
  { field: 'pricePerKg', label: 'Price / kg (RWF)' },
  { field: 'transportCost', label: 'Transport (RWF)' },
  { field: 'commission', label: 'Commission (RWF)' },
] as const;
const emptyLine: LineState = { quantityKg: '', pricePerKg: '', transportCost: 0, commission: 0 };
const emptyLines = (): Record<CherryGrade, LineState> => ({ GOOD: { ...emptyLine }, FLOAT: { ...emptyLine } });

/** Cherry reception: one GRN per farmer delivery, Good/Float as separate lines. */
export function CherryReceiptForm() {
  const { user } = useAuth();
  const writable = canWrite(user, 'cws');
  const stations = useMyStations();
  const { station } = stations;

  const farmers = useList<Farmer>(station ? `/farmers/${query({ home_facility: station.id, is_active: 'true', page_size: 500 })}` : null);
  const [range, setRange] = useState<DateRange>(ANY_DATE);
  const receiptsQuery = station
    ? `/reception/receipts/${query({ facility: station.id, received_on__gte: range[0], received_on__lte: range[1] })}`
    : null;
  const receipts = useList<CherryReceipt>(receiptsQuery && `${receiptsQuery}&page_size=20`);

  const [farmerId, setFarmerId] = useState<string | null>(null);
  const [receivedOn, setReceivedOn] = useState(today());
  const [paymentStatus, setPaymentStatus] = useState<'UNPAID' | 'PAID'>('UNPAID');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [lines, setLines] = useState(emptyLines);
  const [farmerModal, setFarmerModal] = useState(false);
  const submit = useSubmit();

  const computed = useMemo(
    () =>
      GRADES.map(({ grade, label }) => {
        const line = lines[grade];
        const qty = num(line.quantityKg);
        const lineAmount = qty * num(line.pricePerKg);
        return { grade, label, qty, lineAmount, extras: num(line.transportCost) + num(line.commission) };
      }),
    [lines],
  );
  const totalQty = computed.reduce((sum, row) => sum + row.qty, 0);
  const totalAmount = computed.reduce((sum, row) => sum + row.lineAmount + row.extras, 0);

  const updateLine = (grade: CherryGrade, field: keyof LineState, value: number | string) =>
    setLines((previous) => ({ ...previous, [grade]: { ...previous[grade], [field]: value === '' ? '' : Number(value) } }));

  const farmerOptions = farmers.items.map((f) => ({
    value: f.id,
    label: `${f.full_name} (${f.farmer_code})${f.location_label ? ` · ${f.location_label.split(', ')[0]}` : ''}`,
  }));

  async function save() {
    if (!station) return;
    if (!farmerId) return submit.fail('Choose the farmer who delivered the cherry.');
    const receipt = await submit.run(() =>
      api<CherryReceipt>('/reception/receipts/', {
        method: 'POST',
        body: {
          facility: station.id,
          farmer: farmerId,
          received_on: receivedOn,
          payment_status: paymentStatus,
          payment_method: paymentStatus === 'PAID' ? paymentMethod : '',
          lines: GRADES.filter(({ grade }) => num(lines[grade].quantityKg) > 0).map(({ grade }) => ({
            cherry_grade: grade,
            quantity_kg: num(lines[grade].quantityKg),
            price_per_kg: num(lines[grade].pricePerKg),
            transport_cost: num(lines[grade].transportCost),
            commission: num(lines[grade].commission),
          })),
        },
      }),
    );
    if (!receipt) return;
    toast.success(`GRN ${receipt.grn_number} for ${receipt.farmer_name}: ${kg(receipt.total_kg)} kg, ${rwf(receipt.total_amount)}.`, 'GRN saved');
    setLines(emptyLines());
    setFarmerId(null);
    receipts.reload();
  }

  if (stations.loading && !station) return <PageSkeleton />;
  if (!station) return <EmptyState title="No station assigned">Ask an administrator to assign you to a CWS.</EmptyState>;

  return (
    <Stack gap="lg" maw={1100}>
      <PageHeader eyebrow="CWS operations" title="Cherry Reception (GRN)" actions={<StationSelect stations={stations} />} />

      {writable && (
        <Card withBorder radius="md" p="lg">
          <Stack gap="md">
            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              <Select
                label="Farmer"
                placeholder={farmers.loading ? 'Loading farmers…' : farmerOptions.length ? 'Search by name or code' : 'No farmers yet: register one'}
                data={farmerOptions}
                value={farmerId}
                onChange={setFarmerId}
                searchable
                disabled={farmers.loading && !farmers.data}
                nothingFoundMessage="No farmer found. Register them first."
              />
              <TextInput label="Received on" type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.currentTarget.value)} />
              <Button variant="light" mt={{ sm: 25 }} leftSection={<IconUserPlus size={16} />} onClick={() => setFarmerModal(true)}>
                Register new farmer
              </Button>
            </SimpleGrid>

            <Table.ScrollContainer minWidth={720}>
              <Table withTableBorder verticalSpacing="xs">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Cherry</Table.Th>
                    {LINE_FIELDS.map(({ field, label }) => (
                      <Table.Th key={field}>{label}</Table.Th>
                    ))}
                    <Table.Th ta="right">Line amount</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {computed.map((row) => (
                    <Table.Tr key={row.grade}>
                      <Table.Td fw={600}>{row.label}</Table.Td>
                      {LINE_FIELDS.map(({ field, label }) => (
                        <Table.Td key={field}>
                          <NumberInput
                            aria-label={`${row.label} ${label}`}
                            value={lines[row.grade][field]}
                            onChange={(v) => updateLine(row.grade, field, v)}
                            min={0}
                            hideControls
                            thousandSeparator=","
                          />
                        </Table.Td>
                      ))}
                      <Table.Td ta="right" fw={600}>{rwf(row.lineAmount)}</Table.Td>
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

            <Group align="flex-end" gap="md">
              <div>
                <Text size="sm" fw={500} mb={4}>Payment</Text>
                <SegmentedControl
                  value={paymentStatus}
                  onChange={(v) => setPaymentStatus(v as 'UNPAID' | 'PAID')}
                  data={[
                    { value: 'UNPAID', label: 'Not paid yet' },
                    { value: 'PAID', label: 'Paid now' },
                  ]}
                />
              </div>
              {paymentStatus === 'PAID' && (
                <Select
                  label="Paid by"
                  data={[
                    { value: 'CASH', label: 'Cash' },
                    { value: 'BANK', label: 'Bank' },
                    { value: 'MOBILE_MONEY', label: 'Mobile money' },
                  ]}
                  value={paymentMethod}
                  onChange={(v) => setPaymentMethod((v ?? 'CASH') as PaymentMethod)}
                  allowDeselect={false}
                  w={180}
                />
              )}
              <Button ml="auto" leftSection={<IconCoffee size={16} />} onClick={save} loading={submit.saving} disabled={totalQty <= 0}>
                Save GRN
              </Button>
            </Group>
            <ErrorMessage>{submit.error}</ErrorMessage>
          </Stack>
        </Card>
      )}

      <Card withBorder radius="md" p="lg">
        <Group justify="space-between" align="flex-end" mb="sm">
          <Text fw={600}>Receipts at {station.name}</Text>
          <DateRangeFilter value={range} onChange={setRange} label="Received" />
        </Group>
        <DataTable
          rows={receipts.items}
          rowKey={(r) => r.id}
          loading={receipts.loading}
          error={receipts.error}
          empty={{ title: 'No cherry received yet', hint: 'Saved GRNs will appear here.' }}
          exportName={`cherry-receipts-${station.code}`}
          fetchAll={() => fetchAllPages<CherryReceipt>(receiptsQuery ?? '')}
          columns={[
            { key: 'grn', header: 'GRN', mono: true, render: (r) => r.grn_number },
            { key: 'date', header: 'Date', render: (r) => r.received_on },
            {
              key: 'farmer',
              header: 'Farmer',
              exportValue: (r) => `${r.farmer_name} (${r.farmer_code})`,
              render: (r) => (
                <>
                  {r.farmer_name} <Text span c="dimmed" size="xs">{r.farmer_code}</Text>
                </>
              ),
            },
            { key: 'kg', header: 'Qty (kg)', align: 'right', render: (r) => kg(r.total_kg), exportValue: (r) => r.total_kg },
            { key: 'amount', header: 'Amount (RWF)', align: 'right', render: (r) => rwf(r.total_amount), exportValue: (r) => r.total_amount },
            {
              key: 'payment',
              header: 'Payment',
              exportValue: (r) => (r.payment_status === 'PAID' ? `Paid (${r.payment_method})` : 'Unpaid'),
              render: (r) => (
                <Badge color={r.payment_status === 'PAID' ? 'teal' : 'yellow'} variant="light">
                  {r.payment_status === 'PAID' ? 'Paid' : 'Unpaid'}
                </Badge>
              ),
            },
            writable && {
              key: 'void',
              header: '',
              exportValue: false,
              render: (r) => <VoidButton path={`/reception/receipts/${r.id}/`} label={`GRN ${r.grn_number}`} onDone={receipts.reload} />,
            },
          ]}
        />
      </Card>

      <RegisterFarmerModal
        opened={farmerModal}
        stationId={station.id}
        stationName={station.name}
        onClose={() => setFarmerModal(false)}
        onSaved={(farmer) => {
          setFarmerModal(false);
          farmers.reload();
          setFarmerId(farmer.id);
          toast.success(`${farmer.full_name} (${farmer.farmer_code})`, 'Farmer registered');
        }}
      />
    </Stack>
  );
}

function RegisterFarmerModal({
  opened,
  stationId,
  stationName,
  onClose,
  onSaved,
}: {
  opened: boolean;
  stationId: string;
  stationName: string;
  onClose: () => void;
  onSaved: (farmer: Farmer) => void;
}) {
  const blank = { full_name: '', gender: '', phone: '', national_id: '' };
  const [form, setForm] = useState(blank);
  const [location, setLocation] = useState<string | null>(null);
  const submit = useSubmit();
  const set = (field: keyof typeof blank) => (event: { currentTarget: { value: string } }) => {
    const value = event.currentTarget.value;
    setForm((previous) => ({ ...previous, [field]: value }));
  };

  async function save() {
    if (!form.full_name.trim()) return submit.fail('Enter the farmer’s full name.');
    const farmer = await submit.run(() =>
      api<Farmer>('/farmers/', { method: 'POST', body: { ...form, location, home_facility: stationId } }),
    );
    if (!farmer) return;
    setForm(blank);
    setLocation(null);
    onSaved(farmer);
  }

  return (
    <Modal opened={opened} onClose={onClose} title={`Register farmer at ${stationName}`} size="xl">
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label="Full name" required value={form.full_name} onChange={set('full_name')} data-autofocus />
          <Select
            label="Gender"
            data={[
              { value: 'M', label: 'Male' },
              { value: 'F', label: 'Female' },
              { value: 'O', label: 'Other' },
            ]}
            value={form.gender || null}
            onChange={(v) => setForm((p) => ({ ...p, gender: v ?? '' }))}
            clearable
          />
          <TextInput label="Phone" value={form.phone} onChange={set('phone')} placeholder="07…" />
          <TextInput label="National ID" value={form.national_id} onChange={set('national_id')} />
        </SimpleGrid>
        <LocationPicker legend="Where the farmer lives" value={location} onChange={setLocation} />
        <Text size="xs" c="dimmed">The farmer code (e.g. GITOKI-F00001) is assigned automatically.</Text>
        <ErrorMessage>{submit.error}</ErrorMessage>
        <Button onClick={save} loading={submit.saving}>Save farmer</Button>
      </Stack>
    </Modal>
  );
}
