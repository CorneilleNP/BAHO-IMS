import { useState } from 'react';
import { ActionIcon, Badge, Button, Card, Group, Stack, Text, Tooltip } from '@mantine/core';
import { IconSend, IconTruckDelivery } from '@tabler/icons-react';
import { DataTable } from '../../components/DataTable';
import { EmptyState } from '../../components/Feedback';
import { PageHeader } from '../../components/PageHeader';
import { PageSkeleton } from '../../components/Skeletons';
import { StationSelect } from '../../components/StationSelect';
import { canWrite } from '../../lib/access';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/authContext';
import { kg, num } from '../../lib/format';
import { useMyStations } from '../../lib/stations';
import { toast } from '../../lib/toast';
import type { CwsTransfer } from '../../lib/types';
import { errorText, query, useList } from '../../lib/useApi';
import { CwsTransferWizard } from './CwsTransferWizard';

const PAGE_SIZE = 25;

/** Delivery notes this station sent to dry mill. Dry mill weighs each one again,
 * independently, before this station's own numbers are revealed to it. */
export function CwsTransfersPage() {
  const { user } = useAuth();
  const writable = canWrite(user, 'cws');
  const stations = useMyStations();
  const { station } = stations;
  const [page, setPage] = useState(1);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);

  const transfersQuery = station ? `/transfers/cws/${query({ facility: station.id })}` : null;
  const transfers = useList<CwsTransfer>(transfersQuery && `${transfersQuery}&page=${page}&page_size=${PAGE_SIZE}`);

  if (stations.loading && !station) return <PageSkeleton />;
  if (!station) return <EmptyState title="No station assigned">Ask an administrator to assign you to a CWS.</EmptyState>;

  async function submitTransfer(t: CwsTransfer) {
    setSubmitting(t.id);
    try {
      await api(`/transfers/cws/${t.id}/submit/`, { method: 'POST' });
      toast.success(`${t.delivery_note_no} is now visible to dry mill for receiving.`, 'Transfer submitted');
      transfers.reload();
    } catch (err) {
      toast.error(errorText(err), 'Could not submit');
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <Stack gap="lg" maw={1200}>
      <PageHeader
        eyebrow="CWS operations"
        title="Transfers to Dry Mill"
        description="Each delivery note is weighed here, then weighed again independently at dry mill - neither side sees the other's numbers until dry mill confirms."
        actions={
          <>
            <StationSelect stations={stations} />
            {writable && <Button leftSection={<IconTruckDelivery size={16} />} onClick={() => setWizardOpen(true)}>New transfer</Button>}
          </>
        }
      />

      <Card withBorder radius="md" p="lg">
        <Text fw={600} mb="sm">Delivery notes from {station.name}</Text>
        <DataTable
          rows={transfers.items}
          rowKey={(t) => t.id}
          loading={transfers.loading}
          error={transfers.error}
          pagination={{ page, pageSize: PAGE_SIZE, total: transfers.total, onChange: setPage }}
          empty={{ title: 'No transfers recorded yet', hint: 'Use “New transfer” for each delivery note sent to dry mill.' }}
          exportName={`transfers-${station.code}`}
          columns={[
            { key: 'note', header: 'Delivery note', mono: true, render: (t) => t.delivery_note_no },
            { key: 'date', header: 'Date', render: (t) => t.transfer_date },
            {
              key: 'grades',
              header: 'Grades',
              render: (t) => t.lines.map((l) => l.grade_code).join(', ') || '—',
              exportValue: (t) => t.lines.map((l) => l.grade_code).join(', '),
            },
            {
              key: 'bags',
              header: 'Bags',
              align: 'right',
              render: (t) => String(t.lines.reduce((s, l) => s + l.number_of_bags, 0)),
              exportValue: (t) => t.lines.reduce((s, l) => s + l.number_of_bags, 0),
            },
            {
              key: 'gross',
              header: 'Gross (kg)',
              align: 'right',
              render: (t) => kg(t.lines.reduce((s, l) => s + num(l.gross_weight_kg), 0)),
              exportValue: (t) => t.lines.reduce((s, l) => s + num(l.gross_weight_kg), 0),
            },
            {
              key: 'net',
              header: 'Net (kg)',
              align: 'right',
              render: (t) => kg(t.lines.reduce((s, l) => s + num(l.net_weight_kg), 0)),
              exportValue: (t) => t.lines.reduce((s, l) => s + num(l.net_weight_kg), 0),
            },
            {
              key: 'status',
              header: 'Status',
              exportValue: (t) => t.status,
              render: (t) => <Badge color={t.status === 'SUBMITTED' ? 'teal' : 'gray'} variant="light">{t.status === 'SUBMITTED' ? 'Submitted' : 'Draft'}</Badge>,
            },
            writable && {
              key: 'submit',
              header: '',
              exportValue: false,
              render: (t) =>
                t.status === 'DRAFT' && (
                  <Tooltip label="Submit so dry mill can receive it">
                    <ActionIcon variant="subtle" aria-label={`Submit ${t.delivery_note_no}`} loading={submitting === t.id} onClick={() => submitTransfer(t)}>
                      <IconSend size={16} />
                    </ActionIcon>
                  </Tooltip>
                ),
            },
          ]}
        />
      </Card>

      {wizardOpen && (
        <CwsTransferWizard
          station={station}
          onClose={() => setWizardOpen(false)}
          onSaved={() => {
            setWizardOpen(false);
            transfers.reload();
          }}
        />
      )}
    </Stack>
  );
}
