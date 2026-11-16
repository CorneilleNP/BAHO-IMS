import { useCallback, useEffect, useState } from 'react';
import { ActionIcon, Badge, Button, Card, Group, NumberInput, Select, SimpleGrid, Stack, Table, Text, TextInput } from '@mantine/core';
import { IconPlus, IconTrash, IconUserPlus } from '@tabler/icons-react';
import { FormWizard } from '../../components/FormWizard';
import { api } from '../../lib/api';
import { kg, num, today } from '../../lib/format';
import { sourceFields, sourceOptions } from '../../lib/sources';
import { toast } from '../../lib/toast';
import type { CatalogProcess, CatalogSubProcess, Client, CoffeeSource, ExportGrade, ExportShipment } from '../../lib/types';
import { errorText, query, useApi } from '../../lib/useApi';
import { useDraft } from '../../lib/useDraft';
import { useSubmit } from '../../lib/useSubmit';

interface Line {
  key: number;
  process: string | null;
  sub_process: string | null;
  source: string | null;
  gradeId: string | null;
  qty: number | '';
}

interface ShipmentForm {
  client: string | null;
  delivery_to_naeb_date: string;
  status: ExportShipment['status'];
  lines: Line[];
}

const newLine = (key = Date.now()): Line => ({ key, process: null, sub_process: null, source: null, gradeId: null, qty: '' });
const blank = (): ShipmentForm => ({ client: null, delivery_to_naeb_date: today(), status: 'PLANNED', lines: [newLine(1)] });

interface Props {
  clients: Client[];
  grades: ExportGrade[];
  onClientAdded: () => void;
  onClose: () => void;
  onSaved: (shipment: ExportShipment) => void;
}

/**
 * Record an export shipment: client → process / sub-process / source / grade lines
 * (each checked live against that selection's own green stock, produced − already
 * shipped) → review.
 */
export function ShipmentWizard({ clients, grades, onClientAdded, onClose, onSaved }: Props) {
  const draft = useDraft<ShipmentForm>('export-shipment', blank);
  const form = draft.value;
  const submit = useSubmit();
  const processes = useApi<CatalogProcess[]>('/processing/catalog/processes/');
  const sources = useApi<CoffeeSource[]>('/drymill/sources/');
  const [extraClients, setExtraClients] = useState<Client[]>([]);
  const [newClient, setNewClient] = useState<{ name: string; country: string } | null>(null);
  const [addingClient, setAddingClient] = useState(false);
  // Each line reports how much green stock is available for its selection.
  const available = useDraft<Record<number, number>>(null, () => ({}));
  const setAvailable = available.setValue;
  const reportAvailable = useCallback(
    (lineKey: number, kgAvailable: number) => setAvailable((prev) => (prev[lineKey] === kgAvailable ? prev : { ...prev, [lineKey]: kgAvailable })),
    [setAvailable],
  );

  const allClients = [...clients, ...extraClients.filter((c) => !clients.some((x) => x.id === c.id))];
  const ready = form.lines.filter((l) => l.process && l.gradeId && num(l.qty) > 0);
  const total = ready.reduce((sum, l) => sum + num(l.qty), 0);
  const processName = (id: string | null) => processes.data?.find((p) => p.id === id)?.name ?? '';
  const sourceName = (value: string | null) => sources.data?.find((s) => `${s.origin_type}:${s.id}` === value)?.name ?? '';
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
      description: 'Process, sub-process, source, grade & quantity',
      validate: () => {
        if (!ready.length) return 'Add at least one product line with process, grade and quantity.';
        const short = ready.find((l) => num(l.qty) > (available.value[l.key] ?? Infinity));
        return short ? `Only ${kg(available.value[short.key])} kg available for that selection.` : null;
      },
      content: (
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Each line can only ship green coffee actually milled for its own process / sub-process / source / grade. Leave source empty for "any".
          </Text>
          {form.lines.map((line) => (
            <ShipmentLineEditor
              key={line.key}
              line={line}
              processes={processes.data ?? []}
              sources={sources.data ?? []}
              grades={grades}
              removable={form.lines.length > 1}
              onChange={(patch) => updateLine(line.key, patch)}
              onRemove={() => draft.setValue((prev) => ({ ...prev, lines: prev.lines.filter((l) => l.key !== line.key) }))}
              onAvailable={reportAvailable}
            />
          ))}
          <Group justify="space-between">
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
          <Table.Tr><Table.Th>Process / sub-process</Table.Th><Table.Th>Source</Table.Th><Table.Th>Grade</Table.Th><Table.Th ta="right">Qty (kg)</Table.Th><Table.Th ta="right">Left in stock after</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {ready.map((l) => (
            <Table.Tr key={l.key}>
              <Table.Td>{processName(l.process)}</Table.Td>
              <Table.Td>{l.source ? sourceName(l.source) : <Text span c="dimmed" size="sm">Any</Text>}</Table.Td>
              <Table.Td><Badge variant="light">{gradeName(l.gradeId)}</Badge></Table.Td>
              <Table.Td ta="right">{kg(l.qty)}</Table.Td>
              <Table.Td ta="right">{available.value[l.key] === undefined ? '—' : kg(available.value[l.key] - num(l.qty))}</Table.Td>
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
          lines: ready.map((l) => {
            const origin = sourceFields(l.source);
            return {
              process: l.process,
              sub_process: l.sub_process,
              source_facility: origin?.source_facility ?? null,
              source_supplier: origin?.source_supplier ?? null,
              export_grade: l.gradeId,
              qty_kg: num(l.qty),
            };
          }),
        },
      }),
    );
    if (!shipment) return;
    toast.success(`${shipment.shipment_no} to ${shipment.client_name}: ${kg(shipment.total_qty_kg)} kg.`, 'Shipment saved');
    draft.reset();
    onSaved(shipment);
  }

  // Closing without saving also clears the draft, so the next shipment starts blank.
  const close = () => {
    draft.reset();
    onClose();
  };
  return <FormWizard opened onClose={close} title="Record export shipment" steps={steps} review={review} onSubmit={save} submitLabel="Save shipment" saving={submit.saving} error={submit.error} />;
}

function ShipmentLineEditor({
  line,
  processes,
  sources,
  grades,
  removable,
  onChange,
  onRemove,
  onAvailable,
}: {
  line: Line;
  processes: CatalogProcess[];
  sources: CoffeeSource[];
  grades: ExportGrade[];
  removable: boolean;
  onChange: (patch: Partial<Line>) => void;
  onRemove: () => void;
  /** Stable callback (useCallback): reports the stock available for this line's selection. */
  onAvailable: (lineKey: number, kgAvailable: number) => void;
}) {
  const subs = useApi<CatalogSubProcess[]>(line.process ? `/processing/catalog/sub-processes/?process=${line.process}&is_active=true` : null);
  const origin = sourceFields(line.source);
  const stock = useApi<{ available_kg: string }>(
    line.process && line.gradeId
      ? `/sales/shipments/available/${query({
          process: line.process,
          sub_process: line.sub_process,
          source_facility: origin?.source_facility,
          source_supplier: origin?.source_supplier,
          export_grade: line.gradeId,
        })}`
      : null,
  );
  const availableKg = stock.data ? num(stock.data.available_kg) : null;
  useEffect(() => {
    if (availableKg !== null) onAvailable(line.key, availableKg);
  }, [availableKg, line.key, onAvailable]);
  const over = availableKg !== null && num(line.qty) > availableKg;

  return (
    <Card withBorder radius="md" p="sm">
      <Group gap="xs" align="flex-end" wrap="wrap">
        <Select
          label="Process"
          required
          data={processes.map((p) => ({ value: p.id, label: p.name }))}
          value={line.process}
          onChange={(v) => onChange({ process: v, sub_process: null })}
          w={190}
        />
        <Select
          label="Sub-process"
          placeholder={line.process ? 'Any' : 'Choose process'}
          data={(subs.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
          value={line.sub_process}
          onChange={(v) => onChange({ sub_process: v })}
          disabled={!line.process}
          searchable
          clearable
          w={170}
        />
        <Select label="Source" placeholder="Any CWS or supplier" data={sourceOptions(sources)} value={line.source} onChange={(v) => onChange({ source: v })} searchable clearable w={190} />
        <Select label="Grade" required data={grades.map((g) => ({ value: g.id, label: g.name }))} value={line.gradeId} onChange={(v) => onChange({ gradeId: v })} w={140} />
        <NumberInput label="Qty (kg)" value={line.qty} onChange={(v) => onChange({ qty: v === '' ? '' : Number(v) })} min={0} hideControls thousandSeparator="," error={over} w={130} />
        {availableKg !== null && (
          <Button size="compact-sm" variant="subtle" mb={6} onClick={() => onChange({ qty: availableKg })} disabled={availableKg <= 0}>
            All
          </Button>
        )}
        {removable && (
          <ActionIcon variant="subtle" color="red" mb={6} aria-label="Remove line" onClick={onRemove}>
            <IconTrash size={16} />
          </ActionIcon>
        )}
      </Group>
      <Text size="xs" mt={6} c={over ? 'red' : 'dimmed'}>
        {!line.process || !line.gradeId
          ? 'Choose a process and grade to see the available green stock.'
          : stock.loading && !stock.data
            ? 'Checking available stock…'
            : `Available to ship: ${kg(availableKg)} kg`}
      </Text>
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
