import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconCoffee, IconUserPlus } from '@tabler/icons-react';
import { EmptyState, ErrorMessage, Loading, SuccessMessage } from '../../components/Feedback';
import { api } from '../../lib/api';
import { canWrite } from '../../lib/access';
import { useAuth } from '../../lib/authContext';
import { kg, num, rwf, today } from '../../lib/format';
import { useMyStations } from '../../lib/stations';
import type { CherryGrade, CherryReceipt, Farmer, PaymentMethod } from '../../lib/types';
import { errorText, query, useList } from '../../lib/useApi';

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
const emptyLine: LineState = { quantityKg: '', pricePerKg: '', transportCost: 0, commission: 0 };
const emptyLines = (): Record<CherryGrade, LineState> => ({ GOOD: { ...emptyLine }, FLOAT: { ...emptyLine } });

/** Cherry reception: one GRN per farmer delivery, Good/Float as separate lines. */
export function CherryReceiptForm() {
  const { user } = useAuth();
  const writable = canWrite(user, 'cws');
  const { station, setStationId, options: stationOptions, loading: stationsLoading } = useMyStations();

  const farmers = useList<Farmer>(station ? `/farmers/${query({ home_facility: station.id, is_active: 'true', page_size: 500 })}` : null);
  const receipts = useList<CherryReceipt>(station ? `/reception/receipts/${query({ facility: station.id, page_size: 20 })}` : null);

  const [farmerId, setFarmerId] = useState<string | null>(null);
  const [receivedOn, setReceivedOn] = useState(today());
  const [paymentStatus, setPaymentStatus] = useState<'UNPAID' | 'PAID'>('UNPAID');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [lines, setLines] = useState(emptyLines);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [farmerModal, setFarmerModal] = useState(false);

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

  const farmerOptions = farmers.items.map((f) => ({ value: f.id, label: `${f.full_name} (${f.farmer_code})` }));

  async function save() {
    if (!station || !farmerId) {
      setError('Choose the farmer who delivered the cherry.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const receipt = await api<CherryReceipt>('/reception/receipts/', {
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
      });
      setSaved(`Saved GRN ${receipt.grn_number} for ${receipt.farmer_name}: ${kg(receipt.total_kg)} kg, ${rwf(receipt.total_amount)}.`);
      setLines(emptyLines());
      setFarmerId(null);
      receipts.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  if (stationsLoading) return <Loading />;
  if (!station) return <EmptyState title="No station assigned">Ask an administrator to assign you to a CWS.</EmptyState>;

  return (
    <Stack gap="lg" maw={1100}>
      <Group justify="space-between" align="flex-end">
        <div>
          <Text c="gray.6" fw={700} tt="uppercase" size="xs">CWS operations</Text>
          <Title order={2}>Cherry Reception (GRN)</Title>
        </div>
        <Select label="Station" data={stationOptions} value={station.id} onChange={(v) => v && setStationId(v)} allowDeselect={false} w={240} />
      </Group>

      <SuccessMessage onClose={() => setSaved(null)}>{saved}</SuccessMessage>

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
                nothingFoundMessage="No farmer found. Register them first."
              />
              <TextInput label="Received on" type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.currentTarget.value)} />
              <Button variant="light" mt={{ sm: 25 }} leftSection={<IconUserPlus size={16} />} onClick={() => setFarmerModal(true)}>
                Register new farmer
              </Button>
            </SimpleGrid>

            <Table withTableBorder verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Cherry</Table.Th>
                  <Table.Th>Qty (kg)</Table.Th>
                  <Table.Th>Price / kg (RWF)</Table.Th>
                  <Table.Th>Transport (RWF)</Table.Th>
                  <Table.Th>Commission (RWF)</Table.Th>
                  <Table.Th ta="right">Line amount</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {computed.map((row) => (
                  <Table.Tr key={row.grade}>
                    <Table.Td fw={600}>{row.label}</Table.Td>
                    {(['quantityKg', 'pricePerKg', 'transportCost', 'commission'] as const).map((field) => (
                      <Table.Td key={field}>
                        <NumberInput
                          aria-label={`${row.label} ${field}`}
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
              <Button ml="auto" leftSection={<IconCoffee size={16} />} onClick={save} loading={saving} disabled={totalQty <= 0}>
                Save GRN
              </Button>
            </Group>
            <ErrorMessage>{error}</ErrorMessage>
          </Stack>
        </Card>
      )}

      <Card withBorder radius="md" p="lg">
        <Text fw={600} mb="sm">Recent receipts at {station.name}</Text>
        {receipts.loading && !receipts.data ? (
          <Loading />
        ) : receipts.error ? (
          <ErrorMessage>{receipts.error}</ErrorMessage>
        ) : receipts.items.length === 0 ? (
          <EmptyState title="No cherry received yet">Saved GRNs will appear here.</EmptyState>
        ) : (
          <Table.ScrollContainer minWidth={700}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>GRN</Table.Th>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>Farmer</Table.Th>
                  <Table.Th ta="right">Qty (kg)</Table.Th>
                  <Table.Th ta="right">Amount</Table.Th>
                  <Table.Th>Payment</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {receipts.items.map((r) => (
                  <Table.Tr key={r.id}>
                    <Table.Td ff="monospace">{r.grn_number}</Table.Td>
                    <Table.Td>{r.received_on}</Table.Td>
                    <Table.Td>{r.farmer_name} <Text span c="dimmed" size="xs">{r.farmer_code}</Text></Table.Td>
                    <Table.Td ta="right">{kg(r.total_kg)}</Table.Td>
                    <Table.Td ta="right">{rwf(r.total_amount)}</Table.Td>
                    <Table.Td>
                      <Badge color={r.payment_status === 'PAID' ? 'teal' : 'yellow'} variant="light">
                        {r.payment_status === 'PAID' ? 'Paid' : 'Unpaid'}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
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
          setSaved(`Registered farmer ${farmer.full_name} (${farmer.farmer_code}).`);
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
  const blank = { full_name: '', gender: '', phone: '', national_id: '', sector: '', cell: '', village: '' };
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (field: keyof typeof blank) => (event: { currentTarget: { value: string } }) => {
    const value = event.currentTarget.value;
    setForm((previous) => ({ ...previous, [field]: value }));
  };

  async function save() {
    if (!form.full_name.trim()) {
      setError('Enter the farmer’s full name.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const farmer = await api<Farmer>('/farmers/', { method: 'POST', body: { ...form, home_facility: stationId } });
      setForm(blank);
      onSaved(farmer);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title={`Register farmer at ${stationName}`} size="lg">
      <Stack gap="sm">
        <TextInput label="Full name" required value={form.full_name} onChange={set('full_name')} data-autofocus />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
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
          <TextInput label="Sector" value={form.sector} onChange={set('sector')} />
          <TextInput label="Cell" value={form.cell} onChange={set('cell')} />
          <TextInput label="Village" value={form.village} onChange={set('village')} />
        </SimpleGrid>
        <Text size="xs" c="dimmed">The farmer code (e.g. {'{STATION}'}-F00001) is assigned automatically.</Text>
        <ErrorMessage>{error}</ErrorMessage>
        <Button onClick={save} loading={saving}>Save farmer</Button>
      </Stack>
    </Modal>
  );
}
