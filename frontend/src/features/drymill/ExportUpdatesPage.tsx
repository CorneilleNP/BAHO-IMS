import { useState } from 'react';
import { Badge, Button, Card, Group, NativeSelect, Select, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconScale, IconShip } from '@tabler/icons-react';
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
import { ANY_DATE, kg, num, type DateRange } from '../../lib/format';
import { toast } from '../../lib/toast';
import type { CatalogSubProcess, Client, ExportGrade, ExportShipment, ExportSummary } from '../../lib/types';
import { query, useApi, useList } from '../../lib/useApi';
import { useSubmit } from '../../lib/useSubmit';
import { ShipmentWizard } from './ShipmentWizard';

const statusColor: Record<ExportShipment['status'], string> = { PLANNED: 'gray', SHIPPED: 'blue', DELIVERED: 'teal' };
const UNASSIGNED = 'none';

export function ExportUpdatesPage() {
  const { user } = useAuth();
  const writable = canWrite(user, 'export');
  const [client, setClient] = useState('All');
  const [grade, setGrade] = useState('All');
  const [process, setProcess] = useState('All');
  const [subProcess, setSubProcess] = useState('All');
  const [source, setSource] = useState<string | null>(null);
  const [product, setProduct] = useState('All');
  const [range, setRange] = useState<DateRange>(ANY_DATE);
  const [modalOpen, setModalOpen] = useState(false);
  const statusSubmit = useSubmit();

  const clients = useList<Client>('/sales/clients/?page_size=500');
  const grades = useApi<ExportGrade[]>('/drymill/export-grades/');
  const subProcesses = useApi<CatalogSubProcess[]>(
    process !== 'All' && process !== UNASSIGNED ? `/processing/catalog/sub-processes/?process=${process}` : null,
  );
  const summary = useApi<ExportSummary>(
    `/reporting/drymill/export/${query({
      client,
      export_grade: grade,
      process: process !== 'All' ? process : null,
      sub_process: subProcess !== 'All' ? subProcess : null,
      source,
      process_product: product,
      date_from: range[0],
      date_to: range[1],
    })}`,
  );
  const listParams = {
    client,
    lines__export_grade: grade,
    lines__process: process !== 'All' ? process : null,
    lines__sub_process: subProcess !== 'All' ? subProcess : null,
    source,
    lines__process_product: product,
    delivery_to_naeb_date__gte: range[0],
    delivery_to_naeb_date__lte: range[1],
  };
  const shipmentsQuery = `/sales/shipments/${query(listParams)}`;
  const shipments = useList<ExportShipment>(`/sales/shipments/${query({ ...listParams, page_size: 25 })}`);
  const s = summary.data;
  const kpiLoading = summary.loading && !s;

  const setProcessFilter = (value: string) => {
    setProcess(value);
    setSubProcess('All');
  };

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
        <NativeSelect
          label="Process"
          data={[{ value: 'All', label: 'All' }, ...(s?.options.processes ?? []).map((p) => ({ value: p.id, label: p.name })), { value: UNASSIGNED, label: 'Not assigned' }]}
          value={process}
          onChange={(e) => setProcessFilter(e.currentTarget.value)}
          miw={170}
        />
        <NativeSelect
          label="Sub-process"
          data={[{ value: 'All', label: 'All' }, ...(subProcesses.data ?? []).map((sp) => ({ value: sp.id, label: sp.name }))]}
          value={subProcess}
          onChange={(e) => setSubProcess(e.currentTarget.value)}
          disabled={process === 'All' || process === UNASSIGNED}
          miw={170}
        />
        <Select label="Source" placeholder="All" data={s?.options.sources ?? []} value={source} onChange={setSource} searchable clearable w={170} />
        <NativeSelect label="Grade" data={[{ value: 'All', label: 'All' }, ...(grades.data ?? []).map((g) => ({ value: g.id, label: g.name }))]} value={grade} onChange={(e) => setGrade(e.currentTarget.value)} miw={150} />
        <NativeSelect label="Process / product" data={['All', ...(s?.options.process_products ?? [])]} value={product} onChange={(e) => setProduct(e.currentTarget.value)} miw={180} />
        <DateRangeFilter value={range} onChange={setRange} label="Delivery to NAEB" />
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <KpiCard label="Exported quantity (kg)" value={kg(s?.exported_kg)} icon={IconShip} loading={kpiLoading} />
        <KpiCard label="Green produced (kg)" value={kg(s?.produced_kg)} icon={IconScale} loading={kpiLoading} />
        <KpiCard label="Stock balance (kg)" value={kg(s?.stock_balance_kg)} icon={IconScale} accent="gray" loading={kpiLoading} />
      </SimpleGrid>

      <Card p="md">
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

      <Card p="md">
        <Text fw={600} mb="sm">By process: produced, exported, balance</Text>
        <DataTable
          rows={s?.by_process ?? []}
          rowKey={(p) => p.id}
          loading={summary.loading}
          minWidth={560}
          empty={{ title: 'No processes configured' }}
          exportName="export-balance-by-process"
          columns={[
            { key: 'process', header: 'Process', render: (p) => <Text fw={600} size="sm">{p.name}</Text>, exportValue: (p) => p.name },
            { key: 'made', header: 'Produced (kg)', align: 'right', render: (p) => kg(p.produced_kg), exportValue: (p) => p.produced_kg },
            { key: 'shipped', header: 'Exported (kg)', align: 'right', render: (p) => kg(p.exported_kg), exportValue: (p) => p.exported_kg },
            {
              key: 'balance',
              header: 'Balance (kg)',
              exportValue: (p) => p.balance_kg,
              align: 'right',
              render: (p) => <Text size="sm" c={num(p.balance_kg) < 0 ? 'red' : undefined}>{kg(p.balance_kg)}</Text>,
            },
          ]}
        />
      </Card>

      <Card p="md">
        <Text fw={600} mb="sm">By source: produced, exported, balance</Text>
        <DataTable
          rows={s?.by_source ?? []}
          rowKey={(r) => r.label}
          loading={summary.loading}
          minWidth={560}
          empty={{ title: 'No sourced green coffee yet' }}
          exportName="export-balance-by-source"
          columns={[
            { key: 'source', header: 'CWS / supplier', render: (r) => <Text fw={600} size="sm">{r.label}</Text>, exportValue: (r) => r.label },
            { key: 'made', header: 'Produced (kg)', align: 'right', render: (r) => kg(r.produced_kg), exportValue: (r) => r.produced_kg },
            { key: 'shipped', header: 'Exported (kg)', align: 'right', render: (r) => kg(r.exported_kg), exportValue: (r) => r.exported_kg },
            {
              key: 'balance',
              header: 'Balance (kg)',
              exportValue: (r) => r.balance_kg,
              align: 'right',
              render: (r) => <Text size="sm" c={num(r.balance_kg) < 0 ? 'red' : undefined}>{kg(r.balance_kg)}</Text>,
            },
          ]}
        />
      </Card>

      <ChartCard title="Exported quantity by client" rows={s?.by_client ?? []} loading={kpiLoading} labelWidth={120} />

      <Card p="md">
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
              exportValue: (sh) => sh.lines.map((l) => `${l.process_product}${l.source_name ? ` (${l.source_name})` : ''} / ${l.grade_name}: ${l.qty_kg}`).join('; '),
              render: (sh) => <Text size="xs">{sh.lines.map((l) => `${l.process_product}${l.source_name ? ` (${l.source_name})` : ''} / ${l.grade_name}: ${kg(l.qty_kg)} kg`).join(' • ')}</Text>,
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
        <ShipmentWizard
          clients={clients.items}
          grades={grades.data ?? []}
          onClientAdded={() => clients.reload()}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            summary.reload();
            shipments.reload();
          }}
        />
      )}
    </Stack>
  );
}

