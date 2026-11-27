import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Drawer,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { IconUserPlus } from '@tabler/icons-react';
import { DataTable } from '../../components/DataTable';
import { ErrorMessage } from '../../components/Feedback';
import { LocationPicker } from '../../components/LocationPicker';
import { PageHeader } from '../../components/PageHeader';
import { StationSelect } from '../../components/StationSelect';
import { canWrite } from '../../lib/access';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/authContext';
import { kg, num, rwf } from '../../lib/format';
import { useMyStations } from '../../lib/stations';
import { toast } from '../../lib/toast';
import type { Farmer, FarmerDelivery, Paginated } from '../../lib/types';
import { query, useApi, useList } from '../../lib/useApi';
import { useSubmit } from '../../lib/useSubmit';
import { PAYMENT_LABEL } from './paymentLabels';
import { PaymentBadge } from './payments';
import { FarmerWizard } from './FarmerWizard';

const GENDERS = [
  { value: 'M', label: 'Male' },
  { value: 'F', label: 'Female' },
  { value: 'O', label: 'Other' },
];

function dateLabel(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

/** Farmer details (editable) and every GRN they delivered. */
function FarmerDrawer({ farmer, editable, onClose, onSaved }: { farmer: Farmer; editable: boolean; onClose: () => void; onSaved: () => void }) {
  const submit = useSubmit();
  const [form, setForm] = useState({
    first_name: farmer.first_name ?? '',
    last_name: farmer.last_name ?? '',
    gender: farmer.gender as string,
    national_id: farmer.national_id,
    phone: farmer.phone,
    location: farmer.location,
    household_size: farmer.household_size ?? ('' as number | ''),
    land_area_ha: farmer.land_area_ha === null ? ('' as number | '') : num(farmer.land_area_ha),
    is_active: farmer.is_active,
  });
  const set = <K extends keyof typeof form>(key: K) => (value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const deliveries = useApi<FarmerDelivery[]>(`/farmers/${farmer.id}/deliveries/`);

  const save = async () => {
    if (!form.first_name.trim() && !form.last_name.trim()) return submit.fail('Enter a first name or a last name (at least one).');
    const body = {
      ...form,
      household_size: form.household_size === '' ? null : form.household_size,
      land_area_ha: form.land_area_ha === '' ? null : form.land_area_ha,
    };
    const saved = await submit.run(() => api<Farmer>(`/farmers/${farmer.id}/`, { method: 'PATCH', body }));
    if (!saved) return;
    toast.success(`${saved.full_name} (${saved.farmer_code})`, 'Farmer updated');
    onSaved();
  };

  return (
    <Drawer opened onClose={onClose} position="right" size="xl" title={`${farmer.full_name} · ${farmer.farmer_code}`}>
      <Stack>
        <ErrorMessage>{submit.error}</ErrorMessage>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label="First name" value={form.first_name} onChange={(e) => set('first_name')(e.currentTarget.value)} disabled={!editable} />
          <TextInput label="Last name" value={form.last_name} onChange={(e) => set('last_name')(e.currentTarget.value)} disabled={!editable} />
          <Select label="Gender" data={GENDERS} value={form.gender || null} onChange={(v) => set('gender')(v ?? '')} clearable disabled={!editable} />
          <TextInput label="National ID" value={form.national_id} onChange={(e) => set('national_id')(e.currentTarget.value)} disabled={!editable} />
          <TextInput label="Phone" description="Receives an SMS for every GRN" placeholder="07…" value={form.phone} onChange={(e) => set('phone')(e.currentTarget.value)} disabled={!editable} />
          <NumberInput label="Household size" value={form.household_size} onChange={(v) => set('household_size')(v === '' ? '' : Number(v))} min={0} allowDecimal={false} hideControls disabled={!editable} />
          <NumberInput label="Plot / land area (ha)" value={form.land_area_ha} onChange={(v) => set('land_area_ha')(v === '' ? '' : Number(v))} min={0} decimalScale={3} hideControls disabled={!editable} />
        </SimpleGrid>
        <LocationPicker legend="Farmer's village" value={form.location} onChange={set('location')} disabled={!editable} />
        {editable && (
          <Group justify="space-between">
            <Switch label="Active" checked={form.is_active} onChange={(e) => set('is_active')(e.currentTarget.checked)} />
            <Button onClick={save} loading={submit.saving}>Save changes</Button>
          </Group>
        )}

        <Text fw={700} mt="md">Deliveries</Text>
        <DataTable
          rows={deliveries.data ?? []}
          rowKey={(d) => d.id}
          loading={deliveries.loading}
          error={deliveries.error}
          minWidth={760}
          empty={{ title: 'No deliveries yet' }}
          exportName={`deliveries-${farmer.farmer_code}`}
          columns={[
            { key: 'grn', header: 'GRN', mono: true, render: (d) => d.grn_number },
            { key: 'date', header: 'Date', nowrap: true, render: (d) => dateLabel(d.received_on), exportValue: (d) => d.received_on },
            { key: 'good', header: 'Good kg', align: 'right', render: (d) => kg(d.good_kg), exportValue: (d) => num(d.good_kg) },
            { key: 'float', header: 'Float kg', align: 'right', render: (d) => kg(d.float_kg), exportValue: (d) => num(d.float_kg) },
            { key: 'amount', header: 'Amount', align: 'right', render: (d) => rwf(d.total_amount), exportValue: (d) => num(d.total_amount) },
            { key: 'paid', header: 'Paid', align: 'right', render: (d) => rwf(d.amount_paid), exportValue: (d) => num(d.amount_paid) },
            {
              key: 'owed',
              header: 'Still owed',
              align: 'right',
              render: (d) => <Text span size="sm" c={num(d.balance) > 0 && !d.is_voided ? 'red.7' : undefined}>{rwf(d.balance)}</Text>,
              exportValue: (d) => num(d.balance),
            },
            {
              key: 'status',
              header: 'Status',
              nowrap: true,
              exportValue: (d) => (d.is_voided ? 'Deleted' : PAYMENT_LABEL[d.payment_status]),
              render: (d) => (d.is_voided ? <Badge color="gray" variant="light">Deleted</Badge> : <PaymentBadge status={d.payment_status} />),
            },
          ]}
        />
      </Stack>
    </Drawer>
  );
}

/** All farmers of a station: search, totals delivered, edit details. */
export function FarmersPage() {
  const { user } = useAuth();
  const stations = useMyStations();
  const station = stations.station;
  const editable = canWrite(user, 'cws');
  const [search, setSearch] = useState('');
  const [active, setActive] = useState('true');
  const [ordering, setOrdering] = useState('full_name');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Farmer | null>(null);
  const [registering, setRegistering] = useState(false);

  const params = { home_facility: station?.id, search, is_active: active === 'all' ? null : active, ordering };
  const farmers = useList<Farmer>(station ? `/farmers/${query({ ...params, page })}` : null);

  const fetchAll = async () => {
    const rows: Farmer[] = [];
    for (let p = 1; ; p += 1) {
      const res = await api<Paginated<Farmer>>(`/farmers/${query({ ...params, page: p, page_size: 500 })}`);
      rows.push(...res.results);
      if (!res.next) return rows;
    }
  };

  return (
    <Stack gap="lg" maw={1300}>
      <PageHeader
        eyebrow="CWS operations"
        title="Farmers"
        description="Every farmer registered at the station, with what they delivered (deleted GRNs excluded)."
        actions={
          <>
            <StationSelect stations={stations} />
            {editable && station && (
              <Button leftSection={<IconUserPlus size={16} />} onClick={() => setRegistering(true)}>Register farmer</Button>
            )}
          </>
        }
      />
      <Card p="lg">
        <Stack>
          <Group align="flex-end">
            <TextInput label="Search" placeholder="Name, code, phone, ID, village" value={search} onChange={(e) => { setSearch(e.currentTarget.value); setPage(1); }} w={300} />
            <SegmentedControl value={active} onChange={(v) => { setActive(v); setPage(1); }} data={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }, { value: 'all', label: 'All' }]} />
            <Select
              label="Sort by"
              value={ordering}
              onChange={(v) => v && setOrdering(v)}
              allowDeselect={false}
              data={[
                { value: 'full_name', label: 'Name' },
                { value: 'farmer_code', label: 'Farmer code' },
                { value: '-delivered_kg', label: 'Most delivered' },
                { value: '-last_delivery', label: 'Latest delivery' },
                { value: '-created_at', label: 'Newest registered' },
              ]}
              w={190}
            />
          </Group>
          <DataTable
            rows={farmers.items}
            rowKey={(f) => f.id}
            loading={farmers.loading || stations.loading}
            error={farmers.error ?? stations.error}
            minWidth={1000}
            empty={{ title: 'No farmers found', hint: editable ? 'Use “Register farmer” or change the filters.' : 'Change the filters.' }}
            exportName={`farmers-${station?.code ?? 'station'}`}
            fetchAll={fetchAll}
            columnsKey="farmers"
            onRowClick={setOpen}
            pagination={{ page, pageSize: 50, total: farmers.total, onChange: setPage }}
            columns={[
              { key: 'code', header: 'Code', mono: true, mobile: 'subtitle', render: (f) => f.farmer_code ?? 'not synced yet' },
              { key: 'name', header: 'Name', mobile: 'title', render: (f) => f.full_name },
              { key: 'phone', header: 'Phone', nowrap: true, render: (f) => f.phone || '—' },
              { key: 'national_id', header: 'National ID', render: (f) => f.national_id || '—', optional: true },
              { key: 'location', header: 'Village', render: (f) => f.location_label || '—' },
              { key: 'grns', header: 'GRNs', align: 'right', render: (f) => f.grn_count ?? 0 },
              { key: 'kg', header: 'Delivered kg', align: 'right', render: (f) => kg(f.delivered_kg), exportValue: (f) => num(f.delivered_kg) },
              { key: 'last', header: 'Last delivery', nowrap: true, render: (f) => dateLabel(f.last_delivery), exportValue: (f) => f.last_delivery ?? '' },
              {
                key: 'status',
                header: 'Status',
                exportValue: (f) => (f.is_active ? 'Active' : 'Inactive'),
                render: (f) => <Badge color={f.is_active ? 'teal' : 'gray'} variant="light">{f.is_active ? 'Active' : 'Inactive'}</Badge>,
              },
            ]}
          />
        </Stack>
      </Card>
      {open && (
        <FarmerDrawer
          key={open.id}
          farmer={open}
          editable={editable}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            farmers.reload();
          }}
        />
      )}
      {registering && station && (
        <FarmerWizard
          stationId={station.id}
          stationName={station.name}
          onClose={() => setRegistering(false)}
          onSaved={() => {
            setRegistering(false);
            farmers.reload();
          }}
        />
      )}
    </Stack>
  );
}
