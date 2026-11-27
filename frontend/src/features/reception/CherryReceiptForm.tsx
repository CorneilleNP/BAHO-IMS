import { useState } from 'react';
import { ActionIcon, Button, Card, Group, Select, Stack, Text, Tooltip } from '@mantine/core';
import { IconCash, IconCoffee, IconPencil, IconPrinter, IconUserPlus } from '@tabler/icons-react';
import { DataTable } from '../../components/DataTable';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import { EmptyState } from '../../components/Feedback';
import { PageHeader } from '../../components/PageHeader';
import { PageSkeleton } from '../../components/Skeletons';
import { StationSelect } from '../../components/StationSelect';
import { VoidButton } from '../../components/VoidButton';
import { canWrite, isAdmin } from '../../lib/access';
import { useAuth } from '../../lib/authContext';
import { fetchAllPages } from '../../lib/exportTable';
import { ANY_DATE, kg, num, rwf, type DateRange } from '../../lib/format';
import { useMyStations } from '../../lib/stations';
import type { CherryReceipt, PaymentStatus } from '../../lib/types';
import { query, useList } from '../../lib/useApi';
import { FarmerWizard } from './FarmerWizard';
import { GrnReceiptPrint } from './GrnReceiptPrint';
import { GrnWizard } from './GrnWizard';
import { METHOD_LABEL, PAYMENT_LABEL } from './paymentLabels';
import { PaymentBadge, PaymentModal } from './payments';

const PAGE_SIZE = 25;
const PAYMENT_FILTER = [
  { value: 'UNPAID', label: 'Not paid' },
  { value: 'PARTIAL', label: 'Partly paid' },
  { value: 'UNPAID,PARTIAL', label: 'Still owed (not paid + partly paid)' },
  { value: 'PAID', label: 'Paid' },
];

/** Cherry reception: GRNs of the selected station; new ones are recorded with the GRN wizard. */
export function CherryReceiptForm() {
  const { user } = useAuth();
  const writable = canWrite(user, 'cws');
  // A saved GRN is locked: only an administrator corrects or deletes it; station staff record payments.
  const admin = isAdmin(user);
  const stations = useMyStations();
  const { station } = stations;
  const [range, setRange] = useState<DateRange>(ANY_DATE);
  const [page, setPage] = useState(1);
  const [grnWizard, setGrnWizard] = useState<{ receipt: CherryReceipt | null } | null>(null);
  const [farmerWizardOpen, setFarmerWizardOpen] = useState(false);
  const [printReceipt, setPrintReceipt] = useState<CherryReceipt | null>(null);
  const [paying, setPaying] = useState<CherryReceipt | null>(null);
  const [payment, setPayment] = useState<string | null>(null);

  const receiptsQuery = station
    ? `/reception/receipts/${query({
        facility: station.id,
        received_on__gte: range[0],
        received_on__lte: range[1],
        ...(payment?.includes(',') ? { payment_status__in: payment } : { payment_status: payment }),
      })}`
    : null;
  const receipts = useList<CherryReceipt>(receiptsQuery && `${receiptsQuery}&page=${page}&page_size=${PAGE_SIZE}`);

  if (stations.loading && !station) return <PageSkeleton />;
  if (!station) return <EmptyState title="No station assigned">Ask an administrator to assign you to a CWS.</EmptyState>;

  return (
    <Stack gap="lg" maw={1200}>
      <PageHeader
        eyebrow="CWS operations"
        title="Cherry Reception (GRN)"
        actions={
          <>
            <StationSelect stations={stations} />
            {writable && (
              <>
                <Button variant="light" leftSection={<IconUserPlus size={16} />} onClick={() => setFarmerWizardOpen(true)}>Register farmer</Button>
                <Button leftSection={<IconCoffee size={16} />} onClick={() => setGrnWizard({ receipt: null })}>New GRN</Button>
              </>
            )}
          </>
        }
      />

      <Card p="lg">
        <Group justify="space-between" align="flex-end" mb="sm">
          <Text fw={600}>Receipts at {station.name}</Text>
          <Group align="flex-end" gap="sm" wrap="wrap">
            <Select
              label="Payment"
              placeholder="All"
              data={PAYMENT_FILTER}
              value={payment}
              onChange={(v) => { setPayment(v); setPage(1); }}
              clearable
              w={230}
            />
            <DateRangeFilter value={range} onChange={(v) => { setRange(v); setPage(1); }} label="Received" />
          </Group>
        </Group>
        <DataTable
          rows={receipts.items}
          rowKey={(r) => r.id}
          loading={receipts.loading}
          error={receipts.error}
          pagination={{ page, pageSize: PAGE_SIZE, total: receipts.total, onChange: setPage }}
          empty={{ title: 'No cherry received yet', hint: 'Use “New GRN” for each farmer delivery.' }}
          exportName={`cherry-receipts-${station.code}`}
          fetchAll={() => fetchAllPages<CherryReceipt>(receiptsQuery ?? '')}
          columns={[
            { key: 'grn', header: 'GRN', mono: true, render: (r) => r.grn_number },
            { key: 'date', header: 'Date', render: (r) => r.received_on },
            {
              key: 'farmer',
              header: 'Farmer',
              exportValue: (r) => `${r.farmer_name} (${r.farmer_code})`,
              render: (r) => (
                <>
                  {r.farmer_name} <Text span c="dimmed" size="xs">{r.farmer_code}</Text>
                </>
              ),
            },
            { key: 'kg', header: 'Qty (kg)', align: 'right', render: (r) => kg(r.total_kg), exportValue: (r) => r.total_kg },
            { key: 'amount', header: 'Amount (RWF)', align: 'right', render: (r) => rwf(r.total_amount), exportValue: (r) => r.total_amount },
            { key: 'paid', header: 'Paid (RWF)', align: 'right', render: (r) => rwf(r.amount_paid), exportValue: (r) => r.amount_paid },
            {
              key: 'owed',
              header: 'Still owed (RWF)',
              align: 'right',
              exportValue: (r) => r.balance,
              render: (r) => <Text span size="sm" fw={num(r.balance) > 0 ? 700 : 400} c={num(r.balance) > 0 ? 'red.7' : undefined}>{rwf(r.balance)}</Text>,
            },
            {
              key: 'payment',
              header: 'Payment',
              nowrap: true,
              exportValue: (r) => `${PAYMENT_LABEL[r.payment_status]}${r.payment_method ? ` (${METHOD_LABEL[r.payment_method]})` : ''}`,
              render: (r) => <PaymentBadge status={r.payment_status as PaymentStatus} />,
            },
            {
              key: 'pay',
              header: '',
              exportValue: false,
              render: (r) =>
                writable && num(r.balance) > 0 ? (
                  <Button size="compact-xs" variant="light" color="teal" leftSection={<IconCash size={14} />} onClick={() => setPaying(r)}>
                    Pay
                  </Button>
                ) : (
                  <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setPaying(r)}>
                    Payments
                  </Button>
                ),
            },
            admin && {
              key: 'edit',
              header: '',
              exportValue: false,
              render: (r) => (
                <Tooltip label="Edit this GRN">
                  <ActionIcon variant="subtle" aria-label={`Edit GRN ${r.grn_number}`} onClick={() => setGrnWizard({ receipt: r })}>
                    <IconPencil size={16} />
                  </ActionIcon>
                </Tooltip>
              ),
            },
            {
              key: 'print',
              header: '',
              exportValue: false,
              render: (r) => (
                <Tooltip label="Print GRN / payment voucher">
                  <ActionIcon variant="subtle" aria-label={`Print GRN ${r.grn_number}`} onClick={() => setPrintReceipt(r)}>
                    <IconPrinter size={16} />
                  </ActionIcon>
                </Tooltip>
              ),
            },
            admin && {
              key: 'void',
              header: '',
              exportValue: false,
              render: (r) => <VoidButton path={`/reception/receipts/${r.id}/`} label={`GRN ${r.grn_number}`} onDone={receipts.reload} />,
            },
          ]}
        />
      </Card>

      {grnWizard && (
        <GrnWizard
          key={grnWizard.receipt?.id ?? 'new'}
          station={station}
          receipt={grnWizard.receipt}
          onClose={() => setGrnWizard(null)}
          onSaved={(receipt) => {
            setGrnWizard(null);
            receipts.reload();
            // Saved offline: the GRN number comes from the server, so print after it syncs.
            if (!(receipt as { _pending?: boolean })._pending) setPrintReceipt(receipt);
          }}
        />
      )}
      {farmerWizardOpen && (
        <FarmerWizard stationId={station.id} stationName={station.name} onClose={() => setFarmerWizardOpen(false)} onSaved={() => setFarmerWizardOpen(false)} />
      )}
      {printReceipt && <GrnReceiptPrint receipt={printReceipt} onClose={() => setPrintReceipt(null)} />}
      {paying && (
        <PaymentModal
          receipt={paying}
          canPay={writable}
          isAdmin={admin}
          onClose={() => setPaying(null)}
          onChanged={() => receipts.reload()}
        />
      )}
    </Stack>
  );
}
