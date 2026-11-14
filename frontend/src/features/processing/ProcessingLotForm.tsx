import { useMemo, useState } from 'react';
import { Badge, Button, Card, Group, Modal, NumberInput, Select, SimpleGrid, Stack, Table, Text, TextInput } from '@mantine/core';
import { IconClipboardCheck } from '@tabler/icons-react';
import { DataTable } from '../../components/DataTable';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import { EmptyState, ErrorMessage } from '../../components/Feedback';
import { PageHeader } from '../../components/PageHeader';
import { FormSkeleton, PageSkeleton } from '../../components/Skeletons';
import { StationSelect } from '../../components/StationSelect';
import { VoidButton } from '../../components/VoidButton';
import { api } from '../../lib/api';
import { canWrite } from '../../lib/access';
import { useAuth } from '../../lib/authContext';
import { fetchAllPages } from '../../lib/exportTable';
import { ANY_DATE, calculateEstimate, calculateOutturnPct, kg, num, pct, today, type DateRange } from '../../lib/format';
import { toast } from '../../lib/toast';
import { useMyStations } from '../../lib/stations';
import type { ProcessingLot, ProcessType } from '../../lib/types';
import { query, useApi, useList } from '../../lib/useApi';
import { useSubmit } from '../../lib/useSubmit';

const statusColor: Record<ProcessingLot['status'], string> = { IN_PROGRESS: 'blue', SORTED: 'teal', CLOSED: 'gray' };
const statusLabel: Record<ProcessingLot['status'], string> = { IN_PROGRESS: 'In progress', SORTED: 'Sorted', CLOSED: 'Closed' };

/** New processing lot with live "estimate on tables" from the station's registered ratios. */
export function ProcessingLotForm() {
  const { user } = useAuth();
  const writable = canWrite(user, 'cws');
  const stations = useMyStations();
  const { station } = stations;
  const processes = useApi<ProcessType[]>(station ? `/processing/process-types/${query({ facility: station.id, is_active: 'true' })}` : null);
  const [range, setRange] = useState<DateRange>(ANY_DATE);
  const lotsQuery = station
    ? `/processing/lots/${query({ facility: station.id, lot_date__gte: range[0], lot_date__lte: range[1] })}`
    : null;
  const lots = useList<ProcessingLot>(lotsQuery && `${lotsQuery}&page_size=20`);

  const [processId, setProcessId] = useState<string | null>(null);
  const [lotNumber, setLotNumber] = useState('');
  const [lotDate, setLotDate] = useState(today());
  const [cherryInputKg, setCherryInputKg] = useState<number | ''>('');
  const [actuals, setActuals] = useState<Record<string, number | ''>>({});
  const [actualsLot, setActualsLot] = useState<ProcessingLot | null>(null);
  const submit = useSubmit();

  const processList = processes.data ?? [];
  const process = processList.find((p) => p.id === processId) ?? processList[0] ?? null;
  const input = num(cherryInputKg);

  const rows = useMemo(
    () =>
      (process?.grades ?? []).map((grade) => {
        const ratio = num(grade.ratio);
        const actual = actuals[grade.id];
        return {
          grade,
          ratio,
          estimated: calculateEstimate(input, ratio),
          actual,
          outturn: actual === '' || actual === undefined ? null : calculateOutturnPct(num(actual), input),
        };
      }),
    [process, actuals, input],
  );

  async function save() {
    if (!process) return;
    const lot = await submit.run(() =>
      api<ProcessingLot>('/processing/lots/', {
        method: 'POST',
        body: {
          process_type: process.id,
          lot_number: lotNumber.trim(),
          lot_date: lotDate,
          cherry_input_kg: input,
          actuals: rows.filter((r) => r.actual !== '' && r.actual !== undefined).map((r) => ({ grade: r.grade.id, actual_kg: num(r.actual) })),
        },
      }),
    );
    if (!lot) return;
    toast.success(`${lot.lot_number}: ${kg(lot.cherry_input_kg)} kg cherry, estimate ${kg(lot.total_estimated_kg, 2)} kg.`, 'Lot saved');
    setLotNumber('');
    setCherryInputKg('');
    setActuals({});
    lots.reload();
  }

  if (stations.loading && !station) return <PageSkeleton />;
  if (!station) return <EmptyState title="No station assigned">Ask an administrator to assign you to a CWS.</EmptyState>;

  return (
    <Stack gap="lg" maw={1200}>
      <PageHeader eyebrow="CWS operations" title="Processing lots" actions={<StationSelect stations={stations} />} />

      {writable && (
        <Card withBorder radius="md" p="lg">
          {processes.loading && !processes.data ? (
            <FormSkeleton fields={4} columns={4} />
          ) : !processList.length ? (
            <EmptyState title="No processes registered at this station">
              Register a process with its estimate ratios under “Register Process” first.
            </EmptyState>
          ) : (
            <Stack gap="md">
              <Text fw={700} size="lg">New lot</Text>
              <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
                <Select
                  label="Process"
                  data={processList.map((p) => ({ value: p.id, label: p.sub_process ? `${p.name} / ${p.sub_process}` : p.name }))}
                  value={process?.id ?? null}
                  onChange={setProcessId}
                  allowDeselect={false}
                />
                <TextInput label="Lot code" placeholder="Automatic if empty" value={lotNumber} onChange={(e) => setLotNumber(e.currentTarget.value)} />
                <TextInput label="Lot date" type="date" value={lotDate} onChange={(e) => setLotDate(e.currentTarget.value)} />
                <NumberInput label="Cherry input (kg)" value={cherryInputKg} onChange={(v) => setCherryInputKg(v === '' ? '' : Number(v))} min={0} thousandSeparator="," hideControls />
              </SimpleGrid>

              <Table.ScrollContainer minWidth={620}>
                <Table withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Grade</Table.Th>
                      <Table.Th>Estimate ratio</Table.Th>
                      <Table.Th ta="right">Estimated (kg)</Table.Th>
                      <Table.Th>Actual sorted (kg)</Table.Th>
                      <Table.Th ta="right">Out-turn</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {rows.map((row) => (
                      <Table.Tr key={row.grade.id}>
                        <Table.Td fw={600}>{row.grade.name}</Table.Td>
                        <Table.Td>{pct(row.ratio * 100, 2)}</Table.Td>
                        <Table.Td ta="right">{kg(row.estimated, 2)}</Table.Td>
                        <Table.Td>
                          <NumberInput
                            aria-label={`Actual ${row.grade.code}`}
                            placeholder="Later"
                            value={row.actual ?? ''}
                            onChange={(v) => setActuals((prev) => ({ ...prev, [row.grade.id]: v === '' ? '' : Number(v) }))}
                            min={0}
                            hideControls
                            maw={140}
                          />
                        </Table.Td>
                        <Table.Td ta="right">{row.outturn === null || input <= 0 ? '—' : pct(row.outturn, 2)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                  <Table.Tfoot>
                    <Table.Tr>
                      <Table.Th>Total</Table.Th>
                      <Table.Th>{pct(num(process?.total_ratio) * 100, 2)}</Table.Th>
                      <Table.Th ta="right">{kg(rows.reduce((s, r) => s + r.estimated, 0), 2)}</Table.Th>
                      <Table.Th colSpan={2} />
                    </Table.Tr>
                  </Table.Tfoot>
                </Table>
              </Table.ScrollContainer>

              <ErrorMessage>{submit.error}</ErrorMessage>
              <Group justify="flex-end">
                <Button onClick={save} loading={submit.saving} disabled={input <= 0}>Save processing lot</Button>
              </Group>
            </Stack>
          )}
        </Card>
      )}

      <Card withBorder radius="md" p="lg">
        <Group justify="space-between" align="flex-end" mb="sm">
          <Text fw={600}>Lots at {station.name}</Text>
          <DateRangeFilter value={range} onChange={setRange} label="Lot date" />
        </Group>
        <DataTable
          rows={lots.items}
          rowKey={(lot) => lot.id}
          loading={lots.loading}
          error={lots.error}
          minWidth={820}
          empty={{ title: 'No lots yet', hint: 'Saved processing lots appear here.' }}
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
