import { useState } from 'react';
import { ActionIcon, Autocomplete, Badge, Button, Group, NumberInput, Select, SimpleGrid, Stack, Table, Text, TextInput } from '@mantine/core';
import { IconPlus, IconTrash, IconUserPlus } from '@tabler/icons-react';
import { FormWizard } from '../../components/FormWizard';
import { api } from '../../lib/api';
import { kg, num, today } from '../../lib/format';
import { toast } from '../../lib/toast';
import type { Client, ExportGrade, ExportShipment } from '../../lib/types';
import { errorText } from '../../lib/useApi';
import { useDraft } from '../../lib/useDraft';
import { useSubmit } from '../../lib/useSubmit';

const COMMON_PRODUCTS = ['FULLWASHED A1', 'FULLWASHED A2', 'FULLWASHED A3', 'NATURAL A1', 'HONEY A1', 'FW HG', 'NATURAL HG', 'SEMI-WASHED A1'];

interface Line {
  key: number;
  product: string;
  gradeId: string | null;
  qty: number | '';
}

interface ShipmentForm {
  client: string | null;
  delivery_to_naeb_date: string;
  status: ExportShipment['status'];
  lines: Line[];
}

const newLine = (key = Date.now()): Line => ({ key, product: '', gradeId: null, qty: '' });
const blank = (): ShipmentForm => ({ client: null, delivery_to_naeb_date: today(), status: 'PLANNED', lines: [newLine(1)] });

interface Props {
  clients: Client[];
  grades: ExportGrade[];
  /** Green coffee available per export grade id (produced − shipped). */
  balances: Record<string, number>;
  knownProducts: string[];
  onClientAdded: () => void;
  onClose: () => void;
  onSaved: (shipment: ExportShipment) => void;
}

/** Record an export shipment: client → products (checked against green stock) → review. */
export function ShipmentWizard({ clients, grades, balances, knownProducts, onClientAdded, onClose, onSaved }: Props) {
  const draft = useDraft<ShipmentForm>('export-shipment', blank);
  const form = draft.value;
  const submit = useSubmit();
  const [extraClients, setExtraClients] = useState<Client[]>([]);
  const [newClient, setNewClient] = useState<{ name: string; country: string } | null>(null);
  const [addingClient, setAddingClient] = useState(false);

  const allClients = [...clients, ...extraClients.filter((c) => !clients.some((x) => x.id === c.id))];
  const products = Array.from(new Set([...knownProducts, ...COMMON_PRODUCTS]));
  const ready = form.lines.filter((l) => l.product.trim() && l.gradeId && num(l.qty) > 0);
  const total = ready.reduce((sum, l) => sum + num(l.qty), 0);
  const perGrade = ready.reduce<Record<string, number>>((acc, l) => ({ ...acc, [l.gradeId!]: (acc[l.gradeId!] ?? 0) + num(l.qty) }), {});
  const gradeName = (id: string | null) => grades.find((g) => g.id === id)?.name ?? '';
  const clientName = allClients.find((c) => c.id === form.client)?.name ?? '';

  const updateLine = (key: number, patch: Partial<Line>) =>
    draft.setValue((prev) => ({ ...prev, lines: prev.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));

  async function addClient() {
    if (!newClient?.name.trim()) return;
    setAddingClient(true);
    try {
      const created = await api<Client>('/sales/clients/', { method: 'POST', body: newClient });
      setExtraClients((prev) => [...prev, created]);
      draft.set('client')(created.id);
      setNewClient(null);
      onClientAdded();
      toast.success(created.name, 'Client added');
    } catch (err) {
      toast.error(errorText(err), 'Could not add client');
    } finally {
      setAddingClient(false);
    }
  }

  const steps = [
    {
      label: 'Client',
      description: 'Who and when',
      validate: () => (!form.client ? 'Choose the client (or add a new one).' : null),
      content: (
        <Stack gap="sm">
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <Select
              label="Client"
              required
              data={allClients.map((c) => ({ value: c.id, label: c.name }))}
              value={form.client}
              onChange={draft.set('client')}
              searchable
              nothingFoundMessage="Not found: add the client"
            />
            <TextInput label="Delivery to NAEB" type="date" value={form.delivery_to_naeb_date} onChange={(e) => draft.set('delivery_to_naeb_date')(e.currentTarget.value)} />
            <Select
              label="Status"
              data={[
                { value: 'PLANNED', label: 'Planned' },
                { value: 'SHIPPED', label: 'Shipped' },
                { value: 'DELIVERED', label: 'Delivered' },
              ]}
              value={form.status}
              onChange={(v) => draft.set('status')((v ?? 'PLANNED') as ExportShipment['status'])}
              allowDeselect={false}
            />
          </SimpleGrid>
          {newClient ? (
            <Group align="flex-end" gap="xs">
              <TextInput label="New client name" value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.currentTarget.value })} style={{ flex: 1 }} data-autofocus />
              <TextInput label="Country" value={newClient.country} onChange={(e) => setNewClient({ ...newClient, country: e.currentTarget.value })} />
              <Button onClick={addClient} loading={addingClient}>Add</Button>
              <Button variant="subtle" onClick={() => setNewClient(null)}>Cancel</Button>
            </Group>
          ) : (
            <Button variant="subtle" size="compact-sm" w="fit-content" leftSection={<IconUserPlus size={14} />} onClick={() => setNewClient({ name: '', country: '' })}>
              New client
            </Button>
          )}
        </Stack>
      ),
    },
    {
      label: 'Products',
      description: 'Grades and quantities',
      validate: () => {
        if (!ready.length) return 'Add at least one product line with grade and quantity.';
        const short = Object.entries(perGrade).find(([id, qty]) => qty > (balances[id] ?? 0));
        return short ? `Not enough ${gradeName(short[0])} in stock: ${kg(balances[short[0]] ?? 0)} kg available, ${kg(short[1])} kg on this shipment.` : null;
      },
      content: (
        <Stack gap={6}>
          {form.lines.map((l) => (
            <Group key={l.key} gap="xs" wrap="nowrap" align="flex-end">
              <Autocomplete label="Process / product" data={products} value={l.product} onChange={(v) => updateLine(l.key, { product: v.toUpperCase() })} style={{ flex: 2 }} />
              <Select
                label="Grade"
                data={grades.map((g) => ({ value: g.id, label: `${g.name} · ${kg(balances[g.id] ?? 0)} kg in stock` }))}
                value={l.gradeId}
                onChange={(v) => updateLine(l.key, { gradeId: v })}
                style={{ flex: 1.4 }}
              />
              <NumberInput label="Qty (kg)" value={l.qty} onChange={(v) => updateLine(l.key, { qty: v === '' ? '' : Number(v) })} min={0} hideControls thousandSeparator="," w={130} />
              <ActionIcon
                variant="subtle"
                color="red"
                mb={4}
                aria-label="Remove line"
                disabled={form.lines.length <= 1}
                onClick={() => draft.setValue((prev) => ({ ...prev, lines: prev.lines.filter((r) => r.key !== l.key) }))}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          ))}
          <Group justify="space-between" mt="xs">
            <Button size="compact-sm" variant="subtle" leftSection={<IconPlus size={14} />} onClick={() => draft.setValue((prev) => ({ ...prev, lines: [...prev.lines, newLine()] }))}>
              Add line
            </Button>
            <Text size="sm">Total: <strong>{kg(total)} kg</strong></Text>
          </Group>
        </Stack>
      ),
    },
  ];

  const review = (
    <Stack gap="sm">
      <Group gap="lg">
        <Fig label="Client" value={clientName} />
        <Fig label="Delivery to NAEB" value={form.delivery_to_naeb_date} />
        <Fig label="Status" value={form.status} />
        <Fig label="Total" value={`${kg(total)} kg`} />
      </Group>
      <Table striped withTableBorder>
        <Table.Thead>
          <Table.Tr><Table.Th>Product</Table.Th><Table.Th>Grade</Table.Th><Table.Th ta="right">Qty (kg)</Table.Th><Table.Th ta="right">Left in stock after</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {ready.map((l) => (
            <Table.Tr key={l.key}>
              <Table.Td>{l.product}</Table.Td>
              <Table.Td><Badge variant="light">{gradeName(l.gradeId)}</Badge></Table.Td>
              <Table.Td ta="right">{kg(l.qty)}</Table.Td>
              <Table.Td ta="right">{kg((balances[l.gradeId!] ?? 0) - (perGrade[l.gradeId!] ?? 0))}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );

  async function save() {
    const shipment = await submit.run(() =>
      api<ExportShipment>('/sales/shipments/', {
        method: 'POST',
        body: {
          client: form.client,
          delivery_to_naeb_date: form.delivery_to_naeb_date,
          status: form.status,
          lines: ready.map((l) => ({ process_product: l.product.trim(), export_grade: l.gradeId, qty_kg: num(l.qty) })),
        },
      }),
    );
    if (!shipment) return;
    toast.success(`${shipment.shipment_no} to ${shipment.client_name}: ${kg(shipment.total_qty_kg)} kg.`, 'Shipment saved');
    draft.reset();
    onSaved(shipment);
  }

  return <FormWizard opened onClose={onClose} title="Record export shipment" steps={steps} review={review} onSubmit={save} submitLabel="Save shipment" saving={submit.saving} error={submit.error} />;
}

function Fig({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text fw={600} size="sm">{value}</Text>
    </div>
  );
}
