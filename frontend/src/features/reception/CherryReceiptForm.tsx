import { useState } from 'react';
import { ActionIcon, Badge, Button, Card, Group, Stack, Text, Tooltip } from '@mantine/core';
import { IconCoffee, IconPencil, IconPrinter, IconUserPlus } from '@tabler/icons-react';
import { DataTable } from '../../components/DataTable';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import { EmptyState } from '../../components/Feedback';
import { PageHeader } from '../../components/PageHeader';
import { PageSkeleton } from '../../components/Skeletons';
import { StationSelect } from '../../components/StationSelect';
import { VoidButton } from '../../components/VoidButton';
import { canWrite } from '../../lib/access';
import { useAuth } from '../../lib/authContext';
import { fetchAllPages } from '../../lib/exportTable';
import { ANY_DATE, kg, rwf, type DateRange } from '../../lib/format';
import { useMyStations } from '../../lib/stations';
import type { CherryReceipt } from '../../lib/types';
import { query, useList } from '../../lib/useApi';
import { FarmerWizard } from './FarmerWizard';
import { GrnReceiptPrint } from './GrnReceiptPrint';
import { GrnWizard } from './GrnWizard';

const PAGE_SIZE = 25;

/** Cherry reception: GRNs of the selected station; new ones are recorded with the GRN wizard. */
export function CherryReceiptForm() {
  const { user } = useAuth();
  const writable = canWrite(user, 'cws');
  const stations = useMyStations();
  const { station } = stations;
  const [range, setRange] = useState<DateRange>(ANY_DATE);
  const [page, setPage] = useState(1);
  const [grnWizard, setGrnWizard] = useState<{ receipt: CherryReceipt | null } | null>(null);
  const [farmerWizardOpen, setFarmerWizardOpen] = useState(false);
  const [printReceipt, setPrintReceipt] = useState<CherryReceipt | null>(null);

  const receiptsQuery = station
    ? `/reception/receipts/${query({ facility: station.id, received_on__gte: range[0], received_on__lte: range[1] })}`
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

      <Card withBorder radius="md" p="lg">
        <Group justify="space-between" align="flex-end" mb="sm">
          <Text fw={600}>Receipts at {station.name}</Text>
          <DateRangeFilter value={range} onChange={(v) => { setRange(v); setPage(1); }} label="Received" />
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
            {
              key: 'payment',
              header: 'Payment',
              exportValue: (r) => (r.payment_status === 'PAID' ? `Paid (${r.payment_method})` : 'Unpaid'),
              render: (r) => (
                <Badge color={r.payment_status === 'PAID' ? 'teal' : 'yellow'} variant="light">
                  {r.payment_status === 'PAID' ? 'Paid' : 'Unpaid'}
                </Badge>
              ),
            },
            writable && {
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
            writable && {
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
            setPrintReceipt(receipt);
          }}
        />
      )}
      {farmerWizardOpen && (
        <FarmerWizard stationId={station.id} stationName={station.name} onClose={() => setFarmerWizardOpen(false)} onSaved={() => setFarmerWizardOpen(false)} />
      )}
      {printReceipt && <GrnReceiptPrint receipt={printReceipt} onClose={() => setPrintReceipt(null)} />}
    </Stack>
  );
}
