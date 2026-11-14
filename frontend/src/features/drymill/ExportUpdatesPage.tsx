import { useState } from 'react';
import { ActionIcon, Autocomplete, Badge, Button, Card, Group, Modal, NativeSelect, NumberInput, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { IconPlus, IconScale, IconShip, IconTrash, IconUserPlus } from '@tabler/icons-react';
import { ChartCard } from '../../components/ChartCard';
import { DataTable } from '../../components/DataTable';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import { ErrorMessage } from '../../components/Feedback';
import { KpiCard } from '../../components/KpiCard';
import { PageHeader } from '../../components/PageHeader';
import { VoidButton } from '../../components/VoidButton';
import { api } from '../../lib/api';
import { canWrite } from '../../lib/access';
import { useAuth } from '../../lib/authContext';
import { confirmAction } from '../../lib/confirm';
import { fetchAllPages } from '../../lib/exportTable';
import { ANY_DATE, kg, num, today, type DateRange } from '../../lib/format';
import { toast } from '../../lib/toast';
import type { Client, ExportGrade, ExportShipment, ExportSummary } from '../../lib/types';
import { query, useApi, useList } from '../../lib/useApi';
import { useSubmit } from '../../lib/useSubmit';

const statusColor: Record<ExportShipment['status'], string> = { PLANNED: 'gray', SHIPPED: 'blue', DELIVERED: 'teal' };
const COMMON_PRODUCTS = ['FULLWASHED A1', 'FULLWASHED A2', 'FULLWASHED A3', 'NATURAL A1', 'HONEY A1', 'FW HG', 'NATURAL HG', 'SEMI-WASHED A1'];

export function ExportUpdatesPage() {
  const { user } = useAuth();
  const writable = canWrite(user, 'export');
  const [client, setClient] = useState('All');
  const [grade, setGrade] = useState('All');
  const [product, setProduct] = useState('All');
  const [range, setRange] = useState<DateRange>(ANY_DATE);
  const [modalOpen, setModalOpen] = useState(false);
  const statusSubmit = useSubmit();

  const clients = useList<Client>('/sales/clients/?page_size=500');
  const grades = useApi<ExportGrade[]>('/drymill/export-grades/');
  const summary = useApi<ExportSummary>(
    `/reporting/drymill/export/${query({ client, export_grade: grade, process_product: product, date_from: range[0], date_to: range[1] })}`,
  );
  const shipmentsQuery = `/sales/shipments/${query({
    client,
    lines__export_grade: grade,
    lines__process_product: product,
    delivery_to_naeb_date__gte: range[0],
    delivery_to_naeb_date__lte: range[1],
  })}`;
  const shipments = useList<ExportShipment>(
    `/sales/shipments/${query({
      client,
      lines__export_grade: grade,
      lines__process_product: product,
      delivery_to_naeb_date__gte: range[0],
      delivery_to_naeb_date__lte: range[1],
      page_size: 25,
    })}`,
  );
  const s = summary.data;
  const kpiLoading = summary.loading && !s;

  async function setStatus(shipment: ExportShipment, status: ExportShipment['status']) {
    const confirmed = await confirmAction({
      title: `Mark ${shipment.shipment_no} as ${status.toLowerCase()}?`,
      message: `${shipment.client_name} · ${kg(shipment.total_qty_kg)} kg. Only planned shipments can be voided afterwards.`,
      confirmLabel: `Mark ${status.toLowerCase()}`,
    });
    if (confirmed === null) return;
    const done = await statusSubmit.run(() => api(`/sales/shipments/${shipment.id}/status/`, { method: 'POST', body: { status } }));
    if (done === undefined) return;
    toast.success(`${shipment.shipment_no} marked ${status.toLowerCase()}.`, 'Status updated');
    shipments.reload();
  }

  return (
    <Stack gap="lg">
      <PageHeader
        title="Export Updates"
        description="Green coffee shipped to clients, and remaining stock balance by grade"
        actions={writable && <Button leftSection={<IconShip size={16} />} onClick={() => setModalOpen(true)}>Record export shipment</Button>}
      />

      <ErrorMessage>{summary.error ?? statusSubmit.error}</ErrorMessage>

      <Group justify="flex-end" gap="md" align="flex-end">
        <NativeSelect label="Client" data={[{ value: 'All', label: 'All' }, ...clients.items.map((c) => ({ value: c.id, label: c.name }))]} value={client} onChange={(e) => setClient(e.currentTarget.value)} miw={170} />
        <NativeSelect label="Process / product" data={['All', ...(s?.options.process_products ?? [])]} value={product} onChange={(e) => setProduct(e.currentTarget.value)} miw={180} />
        <NativeSelect label="Grade" data={[{ value: 'All', label: 'All' }, ...(grades.data ?? []).map((g) => ({ value: g.id, label: g.name }))]} value={grade} onChange={(e) => setGrade(e.currentTarget.value)} miw={150} />
        <DateRangeFilter value={range} onChange={setRange} label="Delivery to NAEB" />
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <KpiCard label="Exported quantity (kg)" value={kg(s?.exported_kg)} icon={IconShip} loading={kpiLoading} />
        <KpiCard label="Green produced (kg)" value={kg(s?.produced_kg)} icon={IconScale} loading={kpiLoading} />
        <KpiCard label="Stock balance (kg)" value={kg(s?.stock_balance_kg)} icon={IconScale} accent="gray" loading={kpiLoading} />
      </SimpleGrid>

      <Card withBorder radius="md" p="md">
        <Text fw={600} mb="sm">By grade: produced, exported, balance</Text>
        <DataTable
          rows={s?.by_grade ?? []}
          rowKey={(g) => g.id}
          loading={summary.loading}
          minWidth={560}
          empty={{ title: 'No grades configured' }}
          exportName="export-balance-by-grade"
          columns={[
            { key: 'grade', header: 'Grade', render: (g) => <Text fw={600} size="sm">{g.name}</Text>, exportValue: (g) => g.name },
            { key: 'made', header: 'Produced (kg)', align: 'right', render: (g) => kg(g.produced_kg), exportValue: (g) => g.produced_kg },
            { key: 'shipped', header: 'Exported (kg)', align: 'right', render: (g) => kg(g.exported_kg), exportValue: (g) => g.exported_kg },
            {
              key: 'balance',
              header: 'Balance (kg)',
              exportValue: (g) => g.balance_kg,
              align: 'right',
              render: (g) => <Text size="sm" c={num(g.balance_kg) < 0 ? 'red' : undefined}>{kg(g.balance_kg)}</Text>,
            },
          ]}
        />
      </Card>

      <ChartCard title="Exported quantity by client" rows={s?.by_client ?? []} loading={kpiLoading} labelWidth={120} />

      <Card withBorder radius="md" p="md">
        <Text fw={600} mb="sm">Recent export shipments</Text>
        <DataTable
          rows={shipments.items}
          rowKey={(sh) => sh.id}
          loading={shipments.loading}
          error={shipments.error}
          minWidth={900}
          empty={{ title: 'No shipments recorded yet', hint: 'Use “Record export shipment” to add one.' }}
          exportName="export-shipments"
          fetchAll={() => fetchAllPages<ExportShipment>(shipmentsQuery)}
          columns={[
            { key: 'no', header: 'Shipment', mono: true, render: (sh) => sh.shipment_no },
            { key: 'date', header: 'Delivery to NAEB', render: (sh) => sh.delivery_to_naeb_date },
            { key: 'client', header: 'Client', render: (sh) => sh.client_name },
            {
              key: 'products',
              header: 'Products',
              exportValue: (sh) => sh.lines.map((l) => `${l.process_product} / ${l.grade_name}: ${l.qty_kg}`).join('; '),
              render: (sh) => <Text size="xs">{sh.lines.map((l) => `${l.process_product} / ${l.grade_name}: ${kg(l.qty_kg)} kg`).join(' • ')}</Text>,
            },
            { key: 'qty', header: 'Qty (kg)', align: 'right', render: (sh) => kg(sh.total_qty_kg), exportValue: (sh) => sh.total_qty_kg },
            {
              key: 'status',
              header: 'Status',
              exportValue: (sh) => sh.status,
              render: (sh) =>
                writable ? (
                  <NativeSelect
                    aria-label={`Status of ${sh.shipment_no}`}
                    size="xs"
                    data={['PLANNED', 'SHIPPED', 'DELIVERED']}
                    value={sh.status}
                    onChange={(e) => setStatus(sh, e.currentTarget.value as ExportShipment['status'])}
                  />
                ) : (
                  <Badge color={statusColor[sh.status]} variant="light">{sh.status}</Badge>
                ),
            },
            writable && {
              key: 'void',
              header: '',
              exportValue: false,
              render: (sh) =>
                sh.status === 'PLANNED' && (
                  <VoidButton
                    path={`/sales/shipments/${sh.id}/`}
                    label={`shipment ${sh.shipment_no}`}
                    onDone={() => {
                      summary.reload();
                      shipments.reload();
                    }}
                  />
                ),
            },
          ]}
        />
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
            toast.success(`${sh.shipment_no} to ${sh.client_name}: ${kg(sh.total_qty_kg)} kg.`, 'Shipment saved');
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
const newLine = (): LineDraft => ({ key: lineKey++, product: '', gradeId: null, qty: '' });

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
  const [lines, setLines] = useState<LineDraft[]>(() => [newLine()]);
  const [newClient, setNewClient] = useState<{ name: string; country: string } | null>(null);
  const submit = useSubmit();

  const allClients = [...clients, ...extraClients.filter((c) => !clients.some((x) => x.id === c.id))];
  const total = lines.reduce((sum, l) => sum + num(l.qty), 0);
  const update = (key: number, patch: Partial<LineDraft>) => setLines((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const products = Array.from(new Set([...knownProducts, ...COMMON_PRODUCTS]));

  async function addClient() {
    if (!newClient?.name.trim()) return submit.fail('Enter the client name.');
    const created = await submit.run(() => api<Client>('/sales/clients/', { method: 'POST', body: newClient }));
    if (!created) return;
    setExtraClients((prev) => [...prev, created]);
    setClientId(created.id);
    setNewClient(null);
    onClientAdded();
  }

  async function save() {
    if (!clientId) return submit.fail('Choose the client.');
    const ready = lines.filter((l) => l.product.trim() && l.gradeId && num(l.qty) > 0);
    if (!ready.length) return submit.fail('Add at least one product line with grade and quantity.');
    const shipment = await submit.run(() =>
      api<ExportShipment>('/sales/shipments/', {
        method: 'POST',
        body: {
          client: clientId,
          delivery_to_naeb_date: deliveryDate,
          status,
          lines: ready.map((l) => ({ process_product: l.product.trim().toUpperCase(), export_grade: l.gradeId, qty_kg: num(l.qty) })),
        },
      }),
    );
    if (shipment) onSaved(shipment);
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
            <Button onClick={addClient} loading={submit.saving}>Add</Button>
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
            <Button size="compact-sm" variant="subtle" leftSection={<IconPlus size={14} />} onClick={() => setLines((rows) => [...rows, newLine()])}>
              Add line
            </Button>
            <Text size="sm">Total: <strong>{kg(total)} kg</strong></Text>
          </Group>
        </Card>

        <ErrorMessage>{submit.error}</ErrorMessage>
        <Button onClick={save} loading={submit.saving}>Save shipment</Button>
      </Stack>
    </Modal>
  );
}
