import { useState } from 'react';
import { Badge, Button, Card, Group, Modal, NumberInput, Stack, Text } from '@mantine/core';
import { IconClipboardCheck, IconPlus } from '@tabler/icons-react';
import { DataTable } from '../../components/DataTable';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import { EmptyState, ErrorMessage } from '../../components/Feedback';
import { PageHeader } from '../../components/PageHeader';
import { PageSkeleton } from '../../components/Skeletons';
import { StationSelect } from '../../components/StationSelect';
import { VoidButton } from '../../components/VoidButton';
import { api } from '../../lib/api';
import { canWrite } from '../../lib/access';
import { useAuth } from '../../lib/authContext';
import { fetchAllPages } from '../../lib/exportTable';
import { ANY_DATE, kg, num, pct, type DateRange } from '../../lib/format';
import { toast } from '../../lib/toast';
import { useMyStations } from '../../lib/stations';
import type { ProcessingLot, ProcessType } from '../../lib/types';
import { query, useApi, useList } from '../../lib/useApi';
import { useSubmit } from '../../lib/useSubmit';
import { LotWizard } from './LotWizard';

const statusColor: Record<ProcessingLot['status'], string> = { IN_PROGRESS: 'blue', SORTED: 'teal', CLOSED: 'gray' };
const statusLabel: Record<ProcessingLot['status'], string> = { IN_PROGRESS: 'In progress', SORTED: 'Sorted', CLOSED: 'Closed' };
const PAGE_SIZE = 25;

/** Processing lots of the selected station; new lots are recorded with the lot wizard. */
export function ProcessingLotForm() {
  const { user } = useAuth();
  const writable = canWrite(user, 'cws');
  const stations = useMyStations();
  const { station } = stations;
  const processes = useApi<ProcessType[]>(station ? `/processing/process-types/${query({ facility: station.id, is_active: 'true' })}` : null);
  const [range, setRange] = useState<DateRange>(ANY_DATE);
  const [page, setPage] = useState(1);
  const lotsQuery = station
    ? `/processing/lots/${query({ facility: station.id, lot_date__gte: range[0], lot_date__lte: range[1] })}`
    : null;
  const lots = useList<ProcessingLot>(lotsQuery && `${lotsQuery}&page=${page}&page_size=${PAGE_SIZE}`);
  const [actualsLot, setActualsLot] = useState<ProcessingLot | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  if (stations.loading && !station) return <PageSkeleton />;
  if (!station) return <EmptyState title="No station assigned">Ask an administrator to assign you to a CWS.</EmptyState>;

  return (
    <Stack gap="lg" maw={1200}>
      <PageHeader
        eyebrow="CWS operations"
        title="Processing lots"
        actions={
          <>
            <StationSelect stations={stations} />
            {writable && (
              <Button leftSection={<IconPlus size={16} />} onClick={() => setWizardOpen(true)} disabled={processes.loading && !processes.data}>
                New lot
              </Button>
            )}
          </>
        }
      />

      <Card p="lg">
        <Group justify="space-between" align="flex-end" mb="sm">
          <Text fw={600}>Lots at {station.name}</Text>
          <DateRangeFilter value={range} onChange={(v) => { setRange(v); setPage(1); }} label="Lot date" />
        </Group>
        <DataTable
          rows={lots.items}
          rowKey={(lot) => lot.id}
          loading={lots.loading}
          error={lots.error}
          minWidth={820}
          pagination={{ page, pageSize: PAGE_SIZE, total: lots.total, onChange: setPage }}
          empty={{ title: 'No lots yet', hint: 'Use “New lot” to record one.' }}
          exportName={`processing-lots-${station.code}`}
          fetchAll={() => fetchAllPages<ProcessingLot>(lotsQuery ?? '')}
          columns={[
            { key: 'lot', header: 'Lot', mono: true, render: (lot) => lot.lot_number },
            { key: 'date', header: 'Date', render: (lot) => lot.lot_date },
            { key: 'process', header: 'Process', render: (lot) => lot.process_label },
            { key: 'cherry', header: 'Cherry (kg)', align: 'right', render: (lot) => kg(lot.cherry_input_kg), exportValue: (lot) => lot.cherry_input_kg },
            { key: 'est', header: 'Estimated (kg)', align: 'right', render: (lot) => kg(lot.total_estimated_kg, 2), exportValue: (lot) => lot.total_estimated_kg },
            { key: 'act', header: 'Actual (kg)', align: 'right', render: (lot) => (lot.total_actual_kg === null ? '—' : kg(lot.total_actual_kg, 2)), exportValue: (lot) => lot.total_actual_kg },
            { key: 'out', header: 'Out-turn %', align: 'right', render: (lot) => (lot.total_outturn_pct === null ? '—' : pct(lot.total_outturn_pct, 2)), exportValue: (lot) => lot.total_outturn_pct },
            {
              key: 'status',
              header: 'Status',
              exportValue: (lot) => statusLabel[lot.status],
              render: (lot) => <Badge color={statusColor[lot.status]} variant="light">{statusLabel[lot.status]}</Badge>,
            },
            writable && {
              key: 'actions',
              header: '',
              exportValue: false,
              render: (lot) =>
                lot.status !== 'CLOSED' && (
                  <Group gap={4} wrap="nowrap">
                    <Button size="compact-xs" variant="light" leftSection={<IconClipboardCheck size={14} />} onClick={() => setActualsLot(lot)}>
                      Actuals
                    </Button>
                    <VoidButton path={`/processing/lots/${lot.id}/`} label={`lot ${lot.lot_number}`} onDone={lots.reload} />
                  </Group>
                ),
            },
          ]}
        />
      </Card>

      {wizardOpen && (
        <LotWizard
          station={station}
          processes={processes.data ?? []}
          onClose={() => setWizardOpen(false)}
          onSaved={() => {
            setWizardOpen(false);
            lots.reload();
          }}
        />
      )}

      {actualsLot && (
        <ActualsModal
          lot={actualsLot}
          onClose={() => setActualsLot(null)}
          onSaved={(lot) => {
            setActualsLot(null);
            toast.success(`Actuals updated for lot ${lot.lot_number}.`);
            lots.reload();
          }}
        />
      )}
    </Stack>
  );
}

function ActualsModal({ lot, onClose, onSaved }: { lot: ProcessingLot; onClose: () => void; onSaved: (lot: ProcessingLot) => void }) {
  const [values, setValues] = useState<Record<string, number | ''>>(() =>
    Object.fromEntries(lot.results.map((r) => [r.grade, r.actual_kg === null ? '' : num(r.actual_kg)])),
  );
  const submit = useSubmit();

  async function save() {
    const updated = await submit.run(() =>
      api<ProcessingLot>(`/processing/lots/${lot.id}/actuals/`, {
        method: 'POST',
        body: { actuals: lot.results.map((r) => ({ grade: r.grade, actual_kg: values[r.grade] === '' ? null : num(values[r.grade]) })) },
      }),
    );
    if (updated) onSaved(updated);
  }

  return (
    <Modal opened onClose={onClose} title={`Actual sorted quantities: ${lot.lot_number}`}>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">Cherry input {kg(lot.cherry_input_kg)} kg · {lot.process_label}</Text>
        {lot.results.map((r) => (
          <Group key={r.grade} grow>
            <Text size="sm" fw={600}>
              {r.grade_name} <Text span c="dimmed" size="xs">est. {kg(r.estimated_kg, 2)} kg</Text>
            </Text>
            <NumberInput
              aria-label={`Actual ${r.grade_code}`}
              value={values[r.grade]}
              onChange={(v) => setValues((prev) => ({ ...prev, [r.grade]: v === '' ? '' : Number(v) }))}
              min={0}
              hideControls
            />
          </Group>
        ))}
        <ErrorMessage>{submit.error}</ErrorMessage>
        <Button onClick={save} loading={submit.saving}>Save actuals</Button>
      </Stack>
    </Modal>
  );
}
