import { useState } from 'react';
import { ActionIcon, Button, Card, Group, Modal, NumberInput, Select, SimpleGrid, Stack, Text, Textarea, TextInput, Tooltip } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconPencil, IconPlus } from '@tabler/icons-react';
import { DataTable } from '../../components/DataTable';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import { ErrorMessage } from '../../components/Feedback';
import { PageHeader } from '../../components/PageHeader';
import { VoidButton } from '../../components/VoidButton';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/authContext';
import { fetchAllPages } from '../../lib/exportTable';
import { ANY_DATE, num, type DateRange } from '../../lib/format';
import { useMyStations } from '../../lib/stations';
import { toast } from '../../lib/toast';
import { query, useApi, useList } from '../../lib/useApi';
import { useSubmit } from '../../lib/useSubmit';
import { Balance, StationFilter } from './financeShared';
import { isFinanceAdmin, money, moneyRwf, todayIso } from './financeUtils';
import type { FinanceSummary, FundAllocation } from './types';

const PAGE_SIZE = 25;

/** Give funds to a station (or correct a funds entry): HQ only. */
function FundsModal({
  allocation,
  defaultStation,
  onClose,
  onSaved,
}: {
  allocation: FundAllocation | null;
  defaultStation: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const stations = useMyStations();
  const [facility, setFacility] = useState<string | null>(allocation?.facility ?? defaultStation);
  const [date, setDate] = useState<string | null>(allocation?.allocated_on ?? todayIso());
  const [amount, setAmount] = useState<number | ''>(allocation ? num(allocation.amount) : '');
  const [reference, setReference] = useState(allocation?.reference ?? '');
  const [notes, setNotes] = useState(allocation?.notes ?? '');
  const submit = useSubmit();

  async function save() {
    if (!facility) return submit.fail('Choose the station.');
    if (!date) return submit.fail('Enter the date.');
    if (amount === '' || num(amount) <= 0) return submit.fail('Enter the amount given.');
    const body = { facility, allocated_on: date, amount: num(amount), reference: reference.trim(), notes: notes.trim() };
    const saved = await submit.run(() =>
      allocation
        ? api<FundAllocation>(`/finance/allocations/${allocation.id}/`, { method: 'PATCH', body })
        : api<FundAllocation>('/finance/allocations/', { method: 'POST', body }),
    );
    if (saved) {
      toast.success(allocation ? `${allocation.allocation_number} corrected.` : `${moneyRwf(amount)} given to the station.`);
      onSaved();
    }
  }

  return (
    <Modal opened onClose={onClose} title={allocation ? `Correct ${allocation.allocation_number}` : 'Give funds to a station'}>
      <Stack gap="sm">
        <Select label="CWS station" data={stations.options} value={facility} onChange={setFacility} searchable required />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <DatePickerInput label="Date given" value={date} onChange={setDate} valueFormat="DD MMM YYYY" required />
          <NumberInput label="Amount (RWF)" value={amount} onChange={(v) => setAmount(v === '' ? '' : Number(v))} min={0} thousandSeparator="," hideControls required />
        </SimpleGrid>
        <TextInput label="Reference" placeholder="Bank transfer / cheque no." value={reference} onChange={(e) => setReference(e.currentTarget.value)} />
        <Textarea label="Notes" placeholder="e.g. Season budget, cherry purchase advance" value={notes} onChange={(e) => setNotes(e.currentTarget.value)} autosize minRows={2} />
        <ErrorMessage>{submit.error}</ErrorMessage>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={submit.saving}>{allocation ? 'Save correction' : 'Give funds'}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** Funds HQ gave each station, and each station's balance today. */
export function FundsPage() {
  const { user } = useAuth();
  const hq = isFinanceAdmin(user);
  const [station, setStation] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange>(ANY_DATE);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<FundAllocation | 'new' | null>(null);
  const balances = useApi<FinanceSummary>(`/finance/summary/${query({ station })}`);
  const listQuery = `/finance/allocations/${query({
    facility: station,
    allocated_on__gte: range[0],
    allocated_on__lte: range[1],
    ordering: '-allocated_on',
  })}`;
  const list = useList<FundAllocation>(`${listQuery}${listQuery.includes('?') ? '&' : '?'}page=${page}&page_size=${PAGE_SIZE}`);
  const pageTotal = list.items.reduce((sum, a) => sum + num(a.amount), 0);

  return (
    <Stack gap="lg">
      <PageHeader
        eyebrow="Finance"
        title="Funds given to stations"
        description="Money HQ gives each CWS. Expenses, cherry payments and casual labor are deducted from it; the balance can go negative."
        actions={
          hq && (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing('new')}>
              Give funds
            </Button>
          )
        }
      />

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        {(balances.data?.by_station ?? []).map((s) => (
          <Card key={s.facility} padding="md">
            <Text fw={700}>{s.label}</Text>
            <Group justify="space-between" mt={6}>
              <Text size="sm" c="dimmed">Funds given</Text>
              <Text size="sm">{moneyRwf(s.allocated)}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">Spent</Text>
              <Text size="sm">{moneyRwf(s.spent)}</Text>
            </Group>
            <Group justify="space-between" mt={4}>
              <Text size="sm" fw={600}>Balance</Text>
              <Balance value={s.balance} fw={700} size="sm" />
            </Group>
          </Card>
        ))}
      </SimpleGrid>
      <ErrorMessage>{balances.error}</ErrorMessage>

      <Card p="md">
        <Group align="flex-end" gap="sm" wrap="wrap" mb="sm">
          <StationFilter value={station} onChange={(v) => { setStation(v); setPage(1); }} />
          <DateRangeFilter value={range} onChange={(v) => { setRange(v); setPage(1); }} label="Date given" />
        </Group>
        {!hq && <Text size="xs" c="dimmed" mb="xs">Only an administrator or HQ finance can give funds or correct an entry.</Text>}
        <DataTable<FundAllocation>
          rows={list.items}
          rowKey={(a) => a.id}
          loading={list.loading}
          error={list.error}
          minWidth={900}
          pagination={{ page, pageSize: PAGE_SIZE, total: list.total, onChange: setPage }}
          empty={{ title: 'No funds given yet', hint: hq ? 'Use “Give funds” to record money sent to a station.' : undefined }}
          exportName="funds-given"
          fetchAll={() => fetchAllPages<FundAllocation>(listQuery)}
          columns={[
            { key: 'no', header: 'Number', mono: true, nowrap: true, render: (a) => a.allocation_number },
            { key: 'date', header: 'Date', nowrap: true, render: (a) => a.allocated_on, footer: 'Total (this page)' },
            { key: 'station', header: 'Station', mobile: 'title', render: (a) => a.facility_name },
            { key: 'amount', header: 'Amount (RWF)', align: 'right', mobile: 'subtitle', render: (a) => <Text fw={600} size="sm">{money(a.amount)}</Text>, exportValue: (a) => a.amount, footer: money(pageTotal) },
            { key: 'ref', header: 'Reference', render: (a) => a.reference || '—', exportValue: (a) => a.reference },
            { key: 'notes', header: 'Notes', render: (a) => a.notes || '—', exportValue: (a) => a.notes },
            { key: 'by', header: 'Recorded by', render: (a) => a.created_by_name },
            hq && {
              key: 'actions',
              header: '',
              exportValue: false,
              render: (a) => (
                <Group gap={4} wrap="nowrap" onClick={(ev) => ev.stopPropagation()}>
                  <Tooltip label="Correct this entry">
                    <ActionIcon variant="subtle" aria-label={`Correct ${a.allocation_number}`} onClick={() => setEditing(a)}>
                      <IconPencil size={16} />
                    </ActionIcon>
                  </Tooltip>
                  <VoidButton
                    path={`/finance/allocations/${a.id}/`}
                    label={`funds ${a.allocation_number}`}
                    onDone={() => {
                      list.reload();
                      balances.reload();
                    }}
                  />
                </Group>
              ),
            },
          ]}
        />
      </Card>

      {editing && (
        <FundsModal
          allocation={editing === 'new' ? null : editing}
          defaultStation={station}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
            balances.reload();
          }}
        />
      )}
    </Stack>
  );
}
