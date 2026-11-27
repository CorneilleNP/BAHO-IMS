import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Autocomplete,
  Button,
  Card,
  Collapse,
  Group,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useDebouncedValue } from '@mantine/hooks';
import { IconChevronDown, IconChevronRight, IconPencil, IconPlus, IconSearch } from '@tabler/icons-react';
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
import { StationFilter } from './financeShared';
import { canRecordExpense, isFinanceAdmin, money, todayIso } from './financeUtils';
import type { Expense, ExpenseCategory } from './types';

const PAGE_SIZE = 25;
const UNITS = ['litres', 'kg', 'pieces', 'bags', 'days', 'hours', 'months', 'trips'];

interface ExpenseForm {
  facility: string | null;
  spent_on: string | null;
  category: string | null;
  amount: number | '';
  description: string;
  quantity: number | '';
  unit: string;
  unit_price: number | '';
  paid_to: string;
  reference: string;
}

function blankForm(station: string | null): ExpenseForm {
  return {
    facility: station,
    spent_on: todayIso(),
    category: null,
    amount: '',
    description: '',
    quantity: '',
    unit: '',
    unit_price: '',
    paid_to: '',
    reference: '',
  };
}

function formFrom(e: Expense): ExpenseForm {
  return {
    facility: e.facility,
    spent_on: e.spent_on,
    category: e.category,
    amount: num(e.amount),
    description: e.description,
    quantity: e.quantity === null ? '' : num(e.quantity),
    unit: e.unit,
    unit_price: e.unit_price === null ? '' : num(e.unit_price),
    paid_to: e.paid_to,
    reference: e.reference,
  };
}

/** Record (or, for HQ, correct) one expense. Amount = quantity x unit price when both are given. */
function ExpenseModal({
  expense,
  categories,
  defaultStation,
  onClose,
  onSaved,
}: {
  expense: Expense | null;
  categories: ExpenseCategory[];
  defaultStation: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const stations = useMyStations();
  const [form, setForm] = useState<ExpenseForm>(() => (expense ? formFrom(expense) : blankForm(defaultStation)));
  const [showQty, setShowQty] = useState(Boolean(expense?.quantity));
  const [amountTouched, setAmountTouched] = useState(Boolean(expense));
  const submit = useSubmit();
  const set = <K extends keyof ExpenseForm>(key: K, value: ExpenseForm[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  // The station list loads after the form opens: a user with one station gets it filled in.
  const onlyStation = stations.options.length === 1 ? stations.options[0].value : null;
  const fallbackStation = onlyStation ?? stations.station?.id ?? null;
  useEffect(() => {
    if (form.facility || !fallbackStation) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- default arrives after the station list loads
    setForm((prev) => ({ ...prev, facility: prev.facility ?? fallbackStation }));
  }, [form.facility, fallbackStation]);

  // Quantity x unit price fills the amount (still editable).
  useEffect(() => {
    if (amountTouched || form.quantity === '' || form.unit_price === '') return;
    const amount = Math.round(num(form.quantity) * num(form.unit_price) * 100) / 100;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- derived default the user may override
    setForm((prev) => ({ ...prev, amount }));
  }, [form.quantity, form.unit_price, amountTouched]);

  const category = categories.find((c) => c.id === form.category);

  async function save() {
    if (!form.facility) return submit.fail('Choose the station.');
    if (!form.category) return submit.fail('Choose the category.');
    if (!form.spent_on) return submit.fail('Enter the date.');
    if (form.amount === '' || num(form.amount) <= 0) return submit.fail('Enter the amount paid.');
    if (!form.description.trim()) return submit.fail('Say what the money was for.');
    const body = {
      facility: form.facility,
      category: form.category,
      spent_on: form.spent_on,
      amount: num(form.amount),
      description: form.description.trim(),
      quantity: form.quantity === '' ? null : num(form.quantity),
      unit: form.quantity === '' ? '' : form.unit.trim(),
      unit_price: form.quantity === '' || form.unit_price === '' ? null : num(form.unit_price),
      paid_to: form.paid_to.trim(),
      reference: form.reference.trim(),
    };
    const saved = await submit.run(() =>
      expense
        ? api<Expense>(`/finance/expenses/${expense.id}/`, { method: 'PATCH', body })
        : api<Expense>('/finance/expenses/', { method: 'POST', body }),
    );
    if (saved) {
      toast.success(expense ? `Expense ${expense.expense_number} corrected.` : `Expense ${saved.expense_number ?? ''} recorded.`);
      onSaved();
    }
  }

  return (
    <Modal opened onClose={onClose} title={expense ? `Correct expense ${expense.expense_number}` : 'Record an expense'} size="lg">
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select label="CWS station" data={stations.options} value={form.facility} onChange={(v) => set('facility', v)} searchable required />
          <DatePickerInput label="Date paid" value={form.spent_on} onChange={(v) => set('spent_on', v)} valueFormat="DD MMM YYYY" maxDate={todayIso()} required />
        </SimpleGrid>
        <Select
          label="Category"
          placeholder="Choose the expense category"
          data={categories.map((c) => ({ value: c.id, label: c.name }))}
          value={form.category}
          onChange={(v) => set('category', v)}
          renderOption={({ option }) => {
            const c = categories.find((x) => x.id === option.value);
            return (
              <div>
                <Text size="sm">{option.label}</Text>
                {c?.description && <Text size="xs" c="dimmed">{c.description}</Text>}
              </div>
            );
          }}
          description={category?.description ? `e.g. ${category.description}` : undefined}
          searchable
          required
        />
        <Textarea
          label="What was the money for?"
          description="Justify the expense: what was bought or paid, why, for which activity."
          value={form.description}
          onChange={(e) => set('description', e.currentTarget.value)}
          autosize
          minRows={2}
          required
        />

        <UnstyledButton onClick={() => setShowQty((v) => !v)}>
          <Group gap={6}>
            {showQty ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
            <Text size="sm" fw={600}>Quantity & unit price (where it applies: litres, kg, pieces…)</Text>
          </Group>
        </UnstyledButton>
        <Collapse expanded={showQty}>
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <NumberInput label="Quantity" value={form.quantity} onChange={(v) => set('quantity', v === '' ? '' : Number(v))} min={0} decimalScale={3} thousandSeparator="," hideControls />
            <Autocomplete label="Unit" placeholder="litres, kg…" data={UNITS} value={form.unit} onChange={(v) => set('unit', v)} />
            <NumberInput label="Unit price (RWF)" value={form.unit_price} onChange={(v) => set('unit_price', v === '' ? '' : Number(v))} min={0} thousandSeparator="," hideControls />
          </SimpleGrid>
        </Collapse>

        <NumberInput
          label="Amount paid (RWF)"
          description={form.quantity !== '' && form.unit_price !== '' ? 'Filled in from quantity x unit price; change it if the amount paid was different.' : undefined}
          value={form.amount}
          onChange={(v) => {
            setAmountTouched(true);
            set('amount', v === '' ? '' : Number(v));
          }}
          min={0}
          thousandSeparator=","
          hideControls
          required
        />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label="Paid to" placeholder="Supplier or person" value={form.paid_to} onChange={(e) => set('paid_to', e.currentTarget.value)} />
          <TextInput label="Receipt / invoice no." value={form.reference} onChange={(e) => set('reference', e.currentTarget.value)} />
        </SimpleGrid>
        {!expense && <Text size="xs" c="dimmed">Once saved, only an administrator or HQ finance can correct or delete it.</Text>}
        <ErrorMessage>{submit.error}</ErrorMessage>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={submit.saving}>{expense ? 'Save correction' : 'Record expense'}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** Station expenses: list with filters; managers record, HQ corrects or deletes. */
export function ExpensesPage() {
  const { user } = useAuth();
  const canRecord = canRecordExpense(user);
  const hq = isFinanceAdmin(user);
  const stations = useMyStations();
  const [station, setStation] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange>(ANY_DATE);
  const [search, setSearch] = useState('');
  const [searchText] = useDebouncedValue(search.trim(), 350);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);
  const categories = useApi<ExpenseCategory[]>('/finance/categories/');

  const listQuery = `/finance/expenses/${query({
    facility: station,
    category,
    spent_on__gte: range[0],
    spent_on__lte: range[1],
    search: searchText,
    ordering: '-spent_on',
  })}`;
  const list = useList<Expense>(`${listQuery}${listQuery.includes('?') ? '&' : '?'}page=${page}&page_size=${PAGE_SIZE}`);
  const pageTotal = list.items.reduce((sum, e) => sum + num(e.amount), 0);
  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  return (
    <Stack gap="lg">
      <PageHeader
        eyebrow="Finance"
        title="Expenses"
        description="What each station spent, with the reason. Every expense is deducted from the funds given to the station."
        actions={
          canRecord && (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing('new')}>
              Record expense
            </Button>
          )
        }
      />

      <Card p="md">
        <Group align="flex-end" gap="sm" wrap="wrap">
          <StationFilter value={station} onChange={resetPage(setStation)} />
          <Select
            label="Category"
            placeholder="All categories"
            data={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            value={category}
            onChange={resetPage(setCategory)}
            clearable
            searchable
            w={240}
          />
          <DateRangeFilter value={range} onChange={resetPage(setRange)} label="Date paid" />
          <TextInput
            label="Search"
            placeholder="Number, description, paid to…"
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => {
              setSearch(e.currentTarget.value);
              setPage(1);
            }}
            w={240}
          />
        </Group>
        {canRecord && !hq && (
          <Text size="xs" c="dimmed" mt="xs">Saved expenses can only be corrected by an administrator or HQ finance.</Text>
        )}
      </Card>

      <Card p="md">
        <DataTable<Expense>
          rows={list.items}
          rowKey={(e) => e.id}
          loading={list.loading}
          error={list.error}
          minWidth={1150}
          pagination={{ page, pageSize: PAGE_SIZE, total: list.total, onChange: setPage }}
          empty={{ title: 'No expenses', hint: canRecord ? 'Use “Record expense” to add one.' : undefined }}
          exportName="expenses"
          fetchAll={() => fetchAllPages<Expense>(listQuery)}
          columns={[
            { key: 'no', header: 'Number', mono: true, nowrap: true, render: (e) => e.expense_number },
            { key: 'date', header: 'Date', nowrap: true, render: (e) => e.spent_on, footer: 'Total (this page)' },
            { key: 'station', header: 'Station', render: (e) => e.facility_name },
            { key: 'cat', header: 'Category', mobile: 'subtitle', render: (e) => e.category_name },
            { key: 'desc', header: 'Description', mobile: 'title', render: (e) => <Text size="sm" lineClamp={2}>{e.description}</Text>, exportValue: (e) => e.description },
            {
              key: 'qty',
              header: 'Quantity',
              align: 'right',
              render: (e) => (e.quantity === null ? '—' : `${num(e.quantity).toLocaleString('en-US')} ${e.unit}`.trim()),
              exportValue: (e) => (e.quantity === null ? '' : `${e.quantity} ${e.unit}`.trim()),
            },
            { key: 'price', header: 'Unit price', align: 'right', render: (e) => (e.unit_price === null ? '—' : money(e.unit_price)), exportValue: (e) => e.unit_price },
            { key: 'amount', header: 'Amount (RWF)', align: 'right', render: (e) => <Text fw={600} size="sm">{money(e.amount)}</Text>, exportValue: (e) => e.amount, footer: money(pageTotal) },
            { key: 'to', header: 'Paid to', render: (e) => e.paid_to || '—', exportValue: (e) => e.paid_to },
            { key: 'ref', header: 'Receipt no.', render: (e) => e.reference || '—', exportValue: (e) => e.reference },
            { key: 'by', header: 'Recorded by', render: (e) => e.created_by_name },
            hq && {
              key: 'actions',
              header: '',
              exportValue: false,
              render: (e) => (
                <Group gap={4} wrap="nowrap" onClick={(ev) => ev.stopPropagation()}>
                  <Tooltip label="Correct this expense">
                    <ActionIcon variant="subtle" aria-label={`Correct ${e.expense_number}`} onClick={() => setEditing(e)}>
                      <IconPencil size={16} />
                    </ActionIcon>
                  </Tooltip>
                  <VoidButton path={`/finance/expenses/${e.id}/`} label={`expense ${e.expense_number}`} onDone={list.reload} />
                </Group>
              ),
            },
          ]}
        />
      </Card>

      {editing && (
        <ExpenseModal
          expense={editing === 'new' ? null : editing}
          categories={categories.data ?? []}
          defaultStation={station ?? stations.station?.id ?? null}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
          }}
        />
      )}
    </Stack>
  );
}
