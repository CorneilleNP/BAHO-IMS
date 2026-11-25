import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Drawer,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconCalendarCheck, IconCalendarPlus, IconUserPlus } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { DataTable } from '../../components/DataTable';
import { EmptyState, ErrorMessage } from '../../components/Feedback';
import { LocationPicker } from '../../components/LocationPicker';
import { PageHeader } from '../../components/PageHeader';
import { StationSelect } from '../../components/StationSelect';
import { canWrite } from '../../lib/access';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/authContext';
import { num, rwf } from '../../lib/format';
import { useMyStations } from '../../lib/stations';
import { toast } from '../../lib/toast';
import type { Decimal, Located } from '../../lib/types';
import { query, useApi, useList } from '../../lib/useApi';
import { useSubmit } from '../../lib/useSubmit';

interface Laborer extends Located {
  id: string;
  facility: string;
  facility_name: string;
  first_name: string;
  last_name: string;
  full_name: string;
  national_id: string;
  phone: string;
  daily_rate: Decimal;
  is_active: boolean;
}

type PeriodStatus = 'OPEN' | 'CLOSED' | 'PAID';

interface PayPeriod {
  id: string;
  facility: string;
  facility_name: string;
  period_start: string;
  period_end: string;
  status: PeriodStatus;
  notes: string;
  days_present: number;
  laborer_count: number;
  total_amount: Decimal;
  closed_at: string | null;
  paid_at: string | null;
}

interface PayPeriodDetail extends PayPeriod {
  summary: {
    laborers: Array<{ laborer: string; full_name: string; national_id: string; days_present: number; total_amount: Decimal }>;
    laborer_count: number;
    days_present: number;
    total_amount: Decimal;
  };
}

interface AttendanceRow {
  id: string;
  laborer: string;
  laborer_name: string;
  work_date: string;
  present: boolean;
  daily_rate_applied: Decimal;
}

const STATUS_COLOR: Record<PeriodStatus, string> = { OPEN: 'blue', CLOSED: 'orange', PAID: 'teal' };
const fmtDate = (d: string) => dayjs(d).format('DD MMM YYYY');

function LaborerModal({ laborer, stationId, onClose, onSaved }: { laborer: Laborer | null; stationId: string; onClose: () => void; onSaved: () => void }) {
  const submit = useSubmit();
  const [form, setForm] = useState({
    first_name: laborer?.first_name ?? '',
    last_name: laborer?.last_name ?? '',
    national_id: laborer?.national_id ?? '',
    location: laborer?.location ?? (null as string | null),
    phone: laborer?.phone ?? '',
    daily_rate: laborer ? num(laborer.daily_rate) : ('' as number | ''),
    is_active: laborer?.is_active ?? true,
  });
  const set = <K extends keyof typeof form>(key: K) => (value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    if (!form.first_name.trim() && !form.last_name.trim()) return submit.fail('Enter a first name or a last name (at least one).');
    if (form.daily_rate === '') return submit.fail('Enter the daily rate.');
    const saved = await submit.run(() =>
      laborer
        ? api(`/labor/laborers/${laborer.id}/`, { method: 'PATCH', body: form })
        : api('/labor/laborers/', { method: 'POST', body: { ...form, facility: stationId } }),
    );
    if (saved === undefined) return;
    toast.success(`${form.first_name} ${form.last_name}`.trim(), laborer ? 'Laborer updated' : 'Laborer registered');
    onSaved();
  };

  return (
    <Modal opened onClose={onClose} title={laborer ? `Edit ${laborer.full_name}` : 'Register casual laborer'} size="lg">
      <Stack>
        <ErrorMessage>{submit.error}</ErrorMessage>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label="First name" description="First or last name: at least one" value={form.first_name} onChange={(e) => set('first_name')(e.currentTarget.value)} data-autofocus />
          <TextInput label="Last name" description="Family name" value={form.last_name} onChange={(e) => set('last_name')(e.currentTarget.value)} />
        </SimpleGrid>
        <SimpleGrid cols={2}>
          <TextInput label="National ID" value={form.national_id} onChange={(e) => set('national_id')(e.currentTarget.value)} />
          <TextInput label="Phone" placeholder="07…" value={form.phone} onChange={(e) => set('phone')(e.currentTarget.value)} />
        </SimpleGrid>
        <LocationPicker legend="Where they live (Rwanda)" value={form.location} onChange={set('location')} />
        <NumberInput label="Daily rate (RWF)" required min={0} thousandSeparator="," value={form.daily_rate} onChange={(v) => set('daily_rate')(v === '' ? '' : Number(v))} hideControls />
        {laborer && <Switch label="Active" checked={form.is_active} onChange={(e) => set('is_active')(e.currentTarget.checked)} />}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={submit.saving}>Save</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function NewPeriodModal({ stationId, onClose, onSaved }: { stationId: string; onClose: () => void; onSaved: () => void }) {
  const submit = useSubmit();
  const [start, setStart] = useState<string | null>(dayjs().startOf('month').format('YYYY-MM-DD'));
  const [end, setEnd] = useState<string | null>(dayjs().endOf('month').format('YYYY-MM-DD'));

  const save = async () => {
    if (!start || !end) return submit.fail('Choose the first and last day.');
    const saved = await submit.run(() => api('/labor/pay-periods/', { method: 'POST', body: { facility: stationId, period_start: start, period_end: end } }));
    if (saved === undefined) return;
    toast.success(`${fmtDate(start)} – ${fmtDate(end)}`, 'Pay period opened');
    onSaved();
  };

  return (
    <Modal opened onClose={onClose} title="Open a pay period">
      <Stack>
        <ErrorMessage>{submit.error}</ErrorMessage>
        <SimpleGrid cols={2}>
          <DatePickerInput label="First day" value={start} onChange={setStart} valueFormat="DD MMM YYYY" maxDate={end ?? undefined} />
          <DatePickerInput label="Last day" value={end} onChange={setEnd} valueFormat="DD MMM YYYY" minDate={start ?? undefined} />
        </SimpleGrid>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={submit.saving}>Open period</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/**
 * One day's roll call at a pay period: tick who worked, save. Sending the same
 * day again replaces it (nobody is counted twice). Pay = daily rate x days present.
 */
function DayChecklist({ period, day, laborers, onSaved, readOnly = false }: { period: PayPeriod; day: string; laborers: Laborer[]; onSaved: () => void; readOnly?: boolean }) {
  const submit = useSubmit();
  const existing = useApi<AttendanceRow[]>(`/labor/pay-periods/${period.id}/attendance/${query({ work_date: day })}`);
  const [present, setPresent] = useState<Set<string>>(new Set());

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill from what was saved for that day
    setPresent(new Set((existing.data ?? []).filter((r) => r.present).map((r) => r.laborer)));
  }, [existing.data]);

  const active = laborers.filter((l) => l.is_active || present.has(l.id));
  const dayPay = active.filter((l) => present.has(l.id)).reduce((sum, l) => sum + num(l.daily_rate), 0);
  const toggle = (id: string) => setPresent((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const save = async () => {
    const saved = await submit.run(() => api(`/labor/pay-periods/${period.id}/attendance/`, { method: 'POST', body: { work_date: day, present_laborers: [...present] } }));
    if (saved === undefined) return;
    toast.success(`${present.size} present on ${fmtDate(day)}`, 'Attendance saved');
    existing.reload();
    onSaved();
  };

  if (active.length === 0) {
    return <EmptyState title="No laborers registered yet">Register the station&apos;s casual laborers first (Laborers tab); then tick who came each day.</EmptyState>;
  }

  return (
    <Stack>
      <ErrorMessage>{submit.error}</ErrorMessage>
      {!readOnly && (
        <Group gap="xs">
          <Button variant="light" size="xs" onClick={() => setPresent(new Set(active.filter((l) => l.is_active).map((l) => l.id)))}>All present</Button>
          <Button variant="subtle" size="xs" onClick={() => setPresent(new Set())}>Clear</Button>
        </Group>
      )}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="xs">
        {active.map((l) => {
          const isPresent = present.has(l.id);
          return (
            <Card
              key={l.id}
              padding="sm"
              shadow="xs"
              onClick={() => !readOnly && toggle(l.id)}
              style={{
                cursor: readOnly ? 'default' : 'pointer',
                borderColor: isPresent ? 'var(--mantine-color-baho-4)' : undefined,
                background: isPresent ? 'var(--mantine-color-baho-0)' : undefined,
              }}
            >
              <Group wrap="nowrap" gap="sm">
                <Checkbox
                  checked={isPresent}
                  onChange={() => toggle(l.id)}
                  disabled={readOnly || existing.loading}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={l.full_name}
                />
                <div style={{ minWidth: 0 }}>
                  <Text fw={600} size="sm" lineClamp={1}>{l.full_name}</Text>
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {rwf(l.daily_rate)} / day{l.location_label ? ` · ${l.location_label}` : ''}
                  </Text>
                </div>
              </Group>
            </Card>
          );
        })}
      </SimpleGrid>
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          <b>{present.size}</b> of {active.length} present · pay for the day <b>{rwf(dayPay)}</b>
        </Text>
        {!readOnly && (
          <Button onClick={save} loading={submit.saving} leftSection={<IconCalendarCheck size={16} />}>
            Save attendance
          </Button>
        )}
      </Group>
    </Stack>
  );
}

/** Roll call inside a pay period: choose a day of the period, then the checklist. */
function RollCall({ period, laborers, onSaved }: { period: PayPeriod; laborers: Laborer[]; onSaved: () => void }) {
  const lastDay = dayjs(period.period_end).isAfter(dayjs()) ? dayjs().format('YYYY-MM-DD') : period.period_end;
  const [day, setDay] = useState<string | null>(lastDay);
  return (
    <Stack>
      <DatePickerInput label="Day" value={day} onChange={setDay} valueFormat="ddd DD MMM YYYY" minDate={period.period_start} maxDate={lastDay} w={220} />
      {day && <DayChecklist key={day} period={period} day={day} laborers={laborers} onSaved={onSaved} />}
    </Stack>
  );
}

/**
 * Daily attendance (the everyday screen): pick a day, tick who came, save.
 * The day is recorded in the pay period that covers it; pay is worked out from
 * the attendance in that period. Laborers must be registered first.
 */
function DailyAttendance({ stationId, laborers, canEdit, onChanged }: { stationId: string; laborers: Laborer[]; canEdit: boolean; onChanged: () => void }) {
  const submit = useSubmit();
  const today = dayjs().format('YYYY-MM-DD');
  const [day, setDay] = useState<string | null>(today);
  const periods = useList<PayPeriod>(
    day ? `/labor/pay-periods/${query({ facility: stationId, period_start__lte: day, period_end__gte: day, page_size: 5 })}` : null,
  );
  const period = periods.items[0];

  const openMonth = async () => {
    if (!day) return;
    const start = dayjs(day).startOf('month').format('YYYY-MM-DD');
    const end = dayjs(day).endOf('month').format('YYYY-MM-DD');
    const saved = await submit.run(() => api('/labor/pay-periods/', { method: 'POST', body: { facility: stationId, period_start: start, period_end: end } }));
    if (saved === undefined) return;
    toast.success(`${fmtDate(start)} – ${fmtDate(end)}`, 'Pay period opened');
    periods.reload();
    onChanged();
  };

  return (
    <Stack>
      <Group align="flex-end" gap="md">
        <DatePickerInput label="Day" value={day} onChange={setDay} valueFormat="dddd DD MMM YYYY" maxDate={today} w={{ base: '100%', sm: 260 }} />
        {period && (
          <Group gap={6} pb={8}>
            <Text size="sm" c="dimmed">
              Pay period {fmtDate(period.period_start)} – {fmtDate(period.period_end)}
            </Text>
            <Badge color={STATUS_COLOR[period.status]} variant="light">{period.status.toLowerCase()}</Badge>
          </Group>
        )}
      </Group>
      <ErrorMessage>{submit.error}</ErrorMessage>
      {!day ? null : periods.loading && !periods.data ? (
        <Text c="dimmed" size="sm">Loading…</Text>
      ) : !period ? (
        <Card padding="lg">
          <Stack align="flex-start" gap="xs">
            <Text fw={700}>No pay period covers {fmtDate(day)} yet</Text>
            <Text size="sm" c="dimmed">Attendance is paid per pay period. Open one for this month, then tick who came.</Text>
            {canEdit && (
              <Button leftSection={<IconCalendarPlus size={16} />} onClick={openMonth} loading={submit.saving}>
                Open pay period for {dayjs(day).format('MMMM YYYY')}
              </Button>
            )}
          </Stack>
        </Card>
      ) : (
        <>
          {period.status !== 'OPEN' && (
            <Text size="sm" c="orange.8">This pay period is {period.status.toLowerCase()}: attendance can no longer change.</Text>
          )}
          <DayChecklist
            key={`${period.id}-${day}`}
            period={period}
            day={day}
            laborers={laborers}
            onSaved={onChanged}
            readOnly={!canEdit || period.status !== 'OPEN'}
          />
        </>
      )}
    </Stack>
  );
}

function PeriodDrawer({ periodId, laborers, canEdit, canClose, canPay, onClose, onChanged }: { periodId: string; laborers: Laborer[]; canEdit: boolean; canClose: boolean; canPay: boolean; onClose: () => void; onChanged: () => void }) {
  const detail = useApi<PayPeriodDetail>(`/labor/pay-periods/${periodId}/`);
  const submit = useSubmit();
  const period = detail.data;

  const transition = async (path: 'close' | 'mark-paid', message: string) => {
    const done = await submit.run(() => api(`/labor/pay-periods/${periodId}/${path}/`, { method: 'POST' }));
    if (done === undefined) return;
    toast.success(message);
    detail.reload();
    onChanged();
  };

  return (
    <Drawer opened onClose={onClose} position="right" size="xl" title={period ? `Pay period ${fmtDate(period.period_start)} – ${fmtDate(period.period_end)}` : 'Pay period'}>
      {period && (
        <Stack>
          <ErrorMessage>{submit.error}</ErrorMessage>
          <Group justify="space-between">
            <Badge color={STATUS_COLOR[period.status]} variant="light" size="lg">{period.status.toLowerCase()}</Badge>
            <Group gap="xs">
              {canClose && period.status === 'OPEN' && (
                <Button variant="light" color="orange" loading={submit.saving} onClick={() => transition('close', 'Pay period closed; attendance is locked.')}>Close period</Button>
              )}
              {canPay && period.status === 'CLOSED' && (
                <Button color="teal" loading={submit.saving} onClick={() => transition('mark-paid', 'Pay period marked as paid.')}>Mark as paid</Button>
              )}
            </Group>
          </Group>
          {canEdit && period.status === 'OPEN' && (
            <Card p="md">
              <Text fw={700} mb="sm">Roll call</Text>
              <RollCall period={period} laborers={laborers} onSaved={() => { detail.reload(); onChanged(); }} />
            </Card>
          )}
          <Text fw={700}>Pay sheet</Text>
          <Table.ScrollContainer minWidth={480}>
            <Table striped>
              <Table.Thead>
                <Table.Tr><Table.Th>Laborer</Table.Th><Table.Th>National ID</Table.Th><Table.Th ta="right">Days</Table.Th><Table.Th ta="right">Amount</Table.Th></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {period.summary.laborers.map((l) => (
                  <Table.Tr key={l.laborer}>
                    <Table.Td>{l.full_name}</Table.Td>
                    <Table.Td>{l.national_id || '—'}</Table.Td>
                    <Table.Td ta="right">{l.days_present}</Table.Td>
                    <Table.Td ta="right">{rwf(l.total_amount)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
              <Table.Tfoot>
                <Table.Tr>
                  <Table.Th>{period.summary.laborer_count} laborers</Table.Th>
                  <Table.Th />
                  <Table.Th ta="right">{period.summary.days_present}</Table.Th>
                  <Table.Th ta="right">{rwf(period.summary.total_amount)}</Table.Th>
                </Table.Tr>
              </Table.Tfoot>
            </Table>
          </Table.ScrollContainer>
        </Stack>
      )}
    </Drawer>
  );
}

/** Casual labor at a station: laborers, pay periods with a daily roll call, close and pay. */
export function LaborPage() {
  const { user } = useAuth();
  const stations = useMyStations();
  const station = stations.station;
  const canEdit = canWrite(user, 'cws');
  const canClose = canWrite(user, 'cwsManage');
  const canPay = canClose || Boolean(user?.roles.some((r) => r.role === 'HQ_FINANCE'));
  const [tab, setTab] = useState<string | null>('attendance');
  const [status, setStatus] = useState('All');
  const [openPeriod, setOpenPeriod] = useState<string | null>(null);
  const [newPeriod, setNewPeriod] = useState(false);
  const [editLaborer, setEditLaborer] = useState<{ laborer: Laborer | null } | null>(null);

  const periods = useList<PayPeriod>(station ? `/labor/pay-periods/${query({ facility: station.id, status, ordering: '-period_start', page_size: 100 })}` : null);
  const laborers = useList<Laborer>(station ? `/labor/laborers/${query({ facility: station.id, ordering: 'full_name', page_size: 500 })}` : null);
  const laborerRows = useMemo(() => laborers.items, [laborers.items]);

  return (
    <Stack gap="lg" maw={1200}>
      <PageHeader
        eyebrow="CWS operations"
        title="Casual Labor"
        description="Register casual laborers, take the daily roll call, then close the pay period and mark it paid."
        actions={
          <>
            <StationSelect stations={stations} />
            {canEdit && station && tab === 'periods' && <Button leftSection={<IconCalendarPlus size={16} />} onClick={() => setNewPeriod(true)}>Open pay period</Button>}
            {canEdit && station && tab === 'laborers' && <Button leftSection={<IconUserPlus size={16} />} onClick={() => setEditLaborer({ laborer: null })}>Register laborer</Button>}
          </>
        }
      />
      <Card p="lg">
        <Tabs value={tab} onChange={setTab}>
          <Tabs.List mb="md">
            <Tabs.Tab value="attendance">Daily attendance</Tabs.Tab>
            <Tabs.Tab value="periods">Pay periods</Tabs.Tab>
            <Tabs.Tab value="laborers">Laborers</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="attendance">
            {station && <DailyAttendance stationId={station.id} laborers={laborerRows} canEdit={canEdit} onChanged={periods.reload} />}
          </Tabs.Panel>
          <Tabs.Panel value="periods">
            <Stack>
              <SegmentedControl
                w="fit-content"
                value={status}
                onChange={setStatus}
                data={[{ value: 'All', label: 'All' }, { value: 'OPEN', label: 'Open' }, { value: 'CLOSED', label: 'Closed' }, { value: 'PAID', label: 'Paid' }]}
              />
              <DataTable
                rows={periods.items}
                rowKey={(p) => p.id}
                loading={periods.loading || stations.loading}
                error={periods.error}
                minWidth={760}
                empty={{ title: 'No pay periods', hint: canEdit ? 'Use “Open pay period” to start one.' : undefined }}
                exportName={`pay-periods-${station?.code ?? ''}`}
                onRowClick={(p) => setOpenPeriod(p.id)}
                columns={[
                  { key: 'period', header: 'Period', nowrap: true, render: (p) => `${fmtDate(p.period_start)} – ${fmtDate(p.period_end)}` },
                  { key: 'status', header: 'Status', exportValue: (p) => p.status, render: (p) => <Badge color={STATUS_COLOR[p.status]} variant="light">{p.status.toLowerCase()}</Badge> },
                  { key: 'laborers', header: 'Laborers', align: 'right', render: (p) => p.laborer_count },
                  { key: 'days', header: 'Days worked', align: 'right', render: (p) => p.days_present },
                  { key: 'total', header: 'To pay', align: 'right', render: (p) => rwf(p.total_amount), exportValue: (p) => num(p.total_amount) },
                ]}
              />
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="laborers">
            <DataTable
              rows={laborerRows}
              rowKey={(l) => l.id}
              loading={laborers.loading || stations.loading}
              error={laborers.error}
              minWidth={700}
              empty={{ title: 'No laborers registered', hint: canEdit ? 'Use “Register laborer”.' : undefined }}
              exportName={`laborers-${station?.code ?? ''}`}
              onRowClick={canEdit ? (l) => setEditLaborer({ laborer: l }) : undefined}
              columns={[
                { key: 'name', header: 'Name', render: (l) => l.full_name },
                { key: 'id', header: 'National ID', render: (l) => l.national_id || '—' },
                { key: 'phone', header: 'Phone', render: (l) => l.phone || '—' },
                { key: 'rate', header: 'Daily rate', align: 'right', render: (l) => rwf(l.daily_rate), exportValue: (l) => num(l.daily_rate) },
                { key: 'status', header: 'Status', exportValue: (l) => (l.is_active ? 'Active' : 'Inactive'), render: (l) => <Badge color={l.is_active ? 'teal' : 'gray'} variant="light">{l.is_active ? 'Active' : 'Inactive'}</Badge> },
              ]}
            />
          </Tabs.Panel>
        </Tabs>
      </Card>

      {openPeriod && (
        <PeriodDrawer
          key={openPeriod}
          periodId={openPeriod}
          laborers={laborerRows}
          canEdit={canEdit}
          canClose={canClose}
          canPay={canPay}
          onClose={() => setOpenPeriod(null)}
          onChanged={periods.reload}
        />
      )}
      {newPeriod && station && <NewPeriodModal stationId={station.id} onClose={() => setNewPeriod(false)} onSaved={() => { setNewPeriod(false); periods.reload(); }} />}
      {editLaborer && station && (
        <LaborerModal
          key={editLaborer.laborer?.id ?? 'new'}
          laborer={editLaborer.laborer}
          stationId={station.id}
          onClose={() => setEditLaborer(null)}
          onSaved={() => { setEditLaborer(null); laborers.reload(); }}
        />
      )}
    </Stack>
  );
}
