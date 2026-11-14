import { useState } from 'react';
import { BarChart } from '@mantine/charts';
import { ActionIcon, Autocomplete, Badge, Button, Card, Group, Modal, NativeSelect, NumberInput, Select, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconPlus, IconScale, IconShip, IconTrash, IconUserPlus } from '@tabler/icons-react';
import { EmptyState, ErrorMessage, Loading, SuccessMessage } from '../../components/Feedback';
import { KpiCard } from '../../components/KpiCard';
import { api } from '../../lib/api';
import { canWrite } from '../../lib/access';
import { useAuth } from '../../lib/authContext';
import { chartRows, kg, num, today } from '../../lib/format';
import type { Client, ExportGrade, ExportShipment, ExportSummary } from '../../lib/types';
import { errorText, query, useApi, useList } from '../../lib/useApi';

const statusColor: Record<ExportShipment['status'], string> = { PLANNED: 'gray', SHIPPED: 'blue', DELIVERED: 'teal' };
const COMMON_PRODUCTS = ['FULLWASHED A1', 'FULLWASHED A2', 'FULLWASHED A3', 'NATURAL A1', 'HONEY A1', 'FW HG', 'NATURAL HG', 'SEMI-WASHED A1'];

export function ExportUpdatesPage() {
  const { user } = useAuth();
  const writable = canWrite(user, 'export');
  const [client, setClient] = useState('All');
  const [grade, setGrade] = useState('All');
  const [product, setProduct] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const clients = useList<Client>('/sales/clients/?page_size=500');
  const grades = useApi<ExportGrade[]>('/drymill/export-grades/');
  const summary = useApi<ExportSummary>(
    `/reporting/drymill/export/${query({ client, export_grade: grade, process_product: product, date_from: dateFrom, date_to: dateTo })}`,
  );
  const shipments = useList<ExportShipment>(
    `/sales/shipments/${query({
      client,
      lines__export_grade: grade,
      lines__process_product: product,
      delivery_to_naeb_date__gte: dateFrom,
      delivery_to_naeb_date__lte: dateTo,
      page_size: 25,
    })}`,
  );
  const s = summary.data;

  async function setStatus(shipment: ExportShipment, status: ExportShipment['status']) {
    setStatusError(null);
    try {
      await api(`/sales/shipments/${shipment.id}/status/`, { method: 'POST', body: { status } });
      setSaved(`${shipment.shipment_no} marked ${status.toLowerCase()}.`);
      shipments.reload();
    } catch (err) {
      setStatusError(errorText(err));
    }
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Export Updates</Title>
          <Text c="dimmed" size="sm">Green coffee shipped to clients, and remaining stock balance by grade</Text>
        </div>
        {writable && (
          <Button leftSection={<IconShip size={16} />} onClick={() => setModalOpen(true)}>Record export shipment</Button>
        )}
      </Group>

      <SuccessMessage onClose={() => setSaved(null)}>{saved}</SuccessMessage>
      <ErrorMessage>{summary.error ?? statusError}</ErrorMessage>

      <Group justify="flex-end" gap="md" align="flex-end">
        <NativeSelect label="Client" data={[{ value: 'All', label: 'All' }, ...clients.items.map((c) => ({ value: c.id, label: c.name }))]} value={client} onChange={(e) => setClient(e.currentTarget.value)} miw={170} />
        <NativeSelect label="Process / product" data={['All', ...(s?.options.process_products ?? [])]} value={product} onChange={(e) => setProduct(e.currentTarget.value)} miw={180} />
        <NativeSelect label="Grade" data={[{ value: 'All', label: 'All' }, ...(grades.data ?? []).map((g) => ({ value: g.id, label: g.name }))]} value={grade} onChange={(e) => setGrade(e.currentTarget.value)} miw={150} />
        <TextInput type="date" label="From" value={dateFrom} onChange={(e) => setDateFrom(e.currentTarget.value)} />
        <TextInput type="date" label="To" value={dateTo} onChange={(e) => setDateTo(e.currentTarget.value)} />
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <KpiCard label="Exported quantity (kg)" value={kg(s?.exported_kg)} icon={IconShip} />
        <KpiCard label="Green produced (kg)" value={kg(s?.produced_kg)} icon={IconScale} />
        <KpiCard label="Stock balance (kg)" value={kg(s?.stock_balance_kg)} icon={IconScale} accent="gray" />
      </SimpleGrid>

      <Card withBorder radius="md" p="md">
        <Text fw={600} mb="sm">By grade: produced, exported, balance</Text>
        {summary.loading && !s ? (
          <Loading />
        ) : (
          <Table.ScrollContainer minWidth={560}>
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Grade</Table.Th>
                  <Table.Th ta="right">Produced (kg)</Table.Th>
                  <Table.Th ta="right">Exported (kg)</Table.Th>
                  <Table.Th ta="right">Balance (kg)</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(s?.by_grade ?? []).map((g) => (
                  <Table.Tr key={g.id}>
                    <Table.Td fw={600}>{g.name}</Table.Td>
                    <Table.Td ta="right">{kg(g.produced_kg)}</Table.Td>
                    <Table.Td ta="right">{kg(g.exported_kg)}</Table.Td>
                    <Table.Td ta="right" c={num(g.balance_kg) < 0 ? 'red' : undefined}>{kg(g.balance_kg)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>

      <Card withBorder radius="md" p="md">
        <Text fw={600} mb="sm">Exported quantity by client</Text>
        {!s?.by_client.length ? (
          <EmptyState title="No shipments yet" />
        ) : (
          <BarChart
            h={Math.max(160, s.by_client.length * 34)}
            data={chartRows(s.by_client)}
            dataKey="label"
            series={[{ name: 'kg', color: 'coffee.6' }]}
            orientation="vertical"
            yAxisProps={{ width: 120 }}
            valueFormatter={(v) => `${v.toLocaleString()} kg`}
            withTooltip
          />
        )}
      </Card>

      <Card withBorder radius="md" p="md">
        <Text fw={600} mb="sm">Recent export shipments</Text>
        {shipments.loading && !shipments.data ? (
          <Loading />
        ) : shipments.items.length === 0 ? (
          <EmptyState title="No shipments recorded yet">Use “Record export shipment” to add one.</EmptyState>
        ) : (
          <Table.ScrollContainer minWidth={850}>
            <Table striped highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Shipment</Table.Th>
                  <Table.Th>Delivery to NAEB</Table.Th>
                  <Table.Th>Client</Table.Th>
                  <Table.Th>Products</Table.Th>
                  <Table.Th ta="right">Qty (kg)</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {shipments.items.map((sh) => (
                  <Table.Tr key={sh.id}>
                    <Table.Td ff="monospace">{sh.shipment_no}</Table.Td>
                    <Table.Td>{sh.delivery_to_naeb_date}</Table.Td>
                    <Table.Td>{sh.client_name}</Table.Td>
                    <Table.Td>
                      <Text size="xs">{sh.lines.map((l) => `${l.process_product} / ${l.grade_name}: ${kg(l.qty_kg)} kg`).join(' • ')}</Text>
                    </Table.Td>
                    <Table.Td ta="right">{kg(sh.total_qty_kg)}</Table.Td>
                    <Table.Td>
                      {writable ? (
                        <NativeSelect
                          aria-label={`Status of ${sh.shipment_no}`}
                          size="xs"
                          data={['PLANNED', 'SHIPPED', 'DELIVERED']}
                          value={sh.status}
                          onChange={(e) => setStatus(sh, e.currentTarget.value as ExportShipment['status'])}
                        />
                      ) : (
                        <Badge color={statusColor[sh.status]} variant="light">{sh.status}</Badge>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>

      {modalOpen && (
        <ShipmentModal
          clients={clients.items}
          grades={grades.data ?? []}
          knownProducts={s?.options.process_products ?? []}
          onClientAdded={() => clients.reload()}
          onClose={() => setModalOpen(false)}
          onSaved={(sh) => {
            setModalOpen(false);
            setSaved(`Saved shipment ${sh.shipment_no} to ${sh.client_name}: ${kg(sh.total_qty_kg)} kg.`);
            summary.reload();
            shipments.reload();
          }}
        />
      )}
    </Stack>
  );
}

interface LineDraft {
  key: number;
  product: string;
  gradeId: string | null;
  qty: number | '';
}
let lineKey = 1;

function ShipmentModal({
  clients,
  grades,
  knownProducts,
  onClientAdded,
  onClose,
  onSaved,
}: {
  clients: Client[];
  grades: ExportGrade[];
  knownProducts: string[];
  onClientAdded: () => void;
  onClose: () => void;
  onSaved: (s: ExportShipment) => void;
}) {
  const [clientId, setClientId] = useState<string | null>(null);
  const [extraClients, setExtraClients] = useState<Client[]>([]);
  const [deliveryDate, setDeliveryDate] = useState(today());
  const [status, setStatus] = useState<ExportShipment['status']>('PLANNED');
  const [lines, setLines] = useState<LineDraft[]>(() => [{ key: lineKey++, product: '', gradeId: null, qty: '' }]);
  const [newClient, setNewClient] = useState<{ name: string; country: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allClients = [...clients, ...extraClients.filter((c) => !clients.some((x) => x.id === c.id))];
  const total = lines.reduce((sum, l) => sum + num(l.qty), 0);
  const update = (key: number, patch: Partial<LineDraft>) => setLines((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const products = Array.from(new Set([...knownProducts, ...COMMON_PRODUCTS]));

  async function addClient() {
    if (!newClient?.name.trim()) return;
    try {
      const created = await api<Client>('/sales/clients/', { method: 'POST', body: newClient });
      setExtraClients((prev) => [...prev, created]);
      setClientId(created.id);
      setNewClient(null);
      onClientAdded();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function save() {
    if (!clientId) return setError('Choose the client.');
    const ready = lines.filter((l) => l.product.trim() && l.gradeId && num(l.qty) > 0);
    if (!ready.length) return setError('Add at least one product line with grade and quantity.');
    setSaving(true);
    setError(null);
    try {
      const shipment = await api<ExportShipment>('/sales/shipments/', {
        method: 'POST',
        body: {
          client: clientId,
          delivery_to_naeb_date: deliveryDate,
          status,
          lines: ready.map((l) => ({ process_product: l.product.trim().toUpperCase(), export_grade: l.gradeId, qty_kg: num(l.qty) })),
        },
      });
      onSaved(shipment);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal opened onClose={onClose} title="Record export shipment" size="xl">
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <Select
            label="Client"
            required
            data={allClients.map((c) => ({ value: c.id, label: c.name }))}
            value={clientId}
            onChange={setClientId}
            searchable
            nothingFoundMessage="Not found: add the client"
          />
          <TextInput label="Delivery to NAEB" type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.currentTarget.value)} />
          <Select
            label="Status"
            data={[
              { value: 'PLANNED', label: 'Planned' },
              { value: 'SHIPPED', label: 'Shipped' },
              { value: 'DELIVERED', label: 'Delivered' },
            ]}
            value={status}
            onChange={(v) => setStatus((v ?? 'PLANNED') as ExportShipment['status'])}
            allowDeselect={false}
          />
        </SimpleGrid>

        {newClient ? (
          <Group align="flex-end" gap="xs">
            <TextInput label="New client name" value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.currentTarget.value })} style={{ flex: 1 }} data-autofocus />
            <TextInput label="Country" value={newClient.country} onChange={(e) => setNewClient({ ...newClient, country: e.currentTarget.value })} />
            <Button onClick={addClient}>Add</Button>
            <Button variant="subtle" onClick={() => setNewClient(null)}>Cancel</Button>
          </Group>
        ) : (
          <Button variant="subtle" size="compact-sm" w="fit-content" leftSection={<IconUserPlus size={14} />} onClick={() => setNewClient({ name: '', country: '' })}>
            New client
          </Button>
        )}

        <Card withBorder p="sm">
          <Text fw={600} mb="xs">Products shipped</Text>
          <Stack gap={6}>
            {lines.map((l) => (
              <Group key={l.key} gap="xs" wrap="nowrap" align="flex-end">
                <Autocomplete label="Process / product" data={products} value={l.product} onChange={(v) => update(l.key, { product: v })} style={{ flex: 2 }} />
                <Select label="Grade" data={grades.map((g) => ({ value: g.id, label: g.name }))} value={l.gradeId} onChange={(v) => update(l.key, { gradeId: v })} style={{ flex: 1 }} />
                <NumberInput label="Qty (kg)" value={l.qty} onChange={(v) => update(l.key, { qty: v === '' ? '' : Number(v) })} min={0} hideControls thousandSeparator="," w={130} />
                <ActionIcon variant="subtle" color="red" mb={4} aria-label="Remove line" disabled={lines.length <= 1} onClick={() => setLines((rows) => rows.filter((r) => r.key !== l.key))}>
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            ))}
          </Stack>
          <Group justify="space-between" mt="xs">
            <Button size="compact-sm" variant="subtle" leftSection={<IconPlus size={14} />} onClick={() => setLines((rows) => [...rows, { key: lineKey++, product: '', gradeId: null, qty: '' }])}>
              Add line
            </Button>
            <Text size="sm">Total: <strong>{kg(total)} kg</strong></Text>
          </Group>
        </Card>

        <ErrorMessage>{error}</ErrorMessage>
        <Button onClick={save} loading={saving}>Save shipment</Button>
      </Stack>
    </Modal>
  );
}
