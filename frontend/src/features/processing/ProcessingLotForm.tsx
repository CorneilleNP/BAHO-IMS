import { useMemo, useState } from 'react';
import { Badge, Button, Card, Group, Modal, NumberInput, Select, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconClipboardCheck } from '@tabler/icons-react';
import { EmptyState, ErrorMessage, Loading, SuccessMessage } from '../../components/Feedback';
import { api } from '../../lib/api';
import { canWrite } from '../../lib/access';
import { useAuth } from '../../lib/authContext';
import { calculateEstimate, calculateOutturnPct, kg, num, pct, today } from '../../lib/format';
import { useMyStations } from '../../lib/stations';
import type { ProcessingLot, ProcessType } from '../../lib/types';
import { errorText, query, useApi, useList } from '../../lib/useApi';

const statusColor: Record<ProcessingLot['status'], string> = { IN_PROGRESS: 'blue', SORTED: 'teal', CLOSED: 'gray' };
const statusLabel: Record<ProcessingLot['status'], string> = { IN_PROGRESS: 'In progress', SORTED: 'Sorted', CLOSED: 'Closed' };

/** New processing lot with live "estimate on tables" from the station's registered ratios. */
export function ProcessingLotForm() {
  const { user } = useAuth();
  const writable = canWrite(user, 'cws');
  const { station, setStationId, options, loading: stationsLoading } = useMyStations();
  const processes = useApi<ProcessType[]>(station ? `/processing/process-types/${query({ facility: station.id, is_active: 'true' })}` : null);
  const lots = useList<ProcessingLot>(station ? `/processing/lots/${query({ facility: station.id, page_size: 20 })}` : null);

  const [processId, setProcessId] = useState<string | null>(null);
  const [lotNumber, setLotNumber] = useState('');
  const [lotDate, setLotDate] = useState(today());
  const [cherryInputKg, setCherryInputKg] = useState<number | ''>('');
  const [actuals, setActuals] = useState<Record<string, number | ''>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [actualsLot, setActualsLot] = useState<ProcessingLot | null>(null);

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
    setSaving(true);
    setError(null);
    try {
      const lot = await api<ProcessingLot>('/processing/lots/', {
        method: 'POST',
        body: {
          process_type: process.id,
          lot_number: lotNumber.trim(),
          lot_date: lotDate,
          cherry_input_kg: input,
          actuals: rows.filter((r) => r.actual !== '' && r.actual !== undefined).map((r) => ({ grade: r.grade.id, actual_kg: num(r.actual) })),
        },
      });
      setSaved(`Saved lot ${lot.lot_number}: ${kg(lot.cherry_input_kg)} kg cherry, estimate ${kg(lot.total_estimated_kg, 2)} kg.`);
      setLotNumber('');
      setCherryInputKg('');
      setActuals({});
      lots.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  if (stationsLoading) return <Loading />;
  if (!station) return <EmptyState title="No station assigned">Ask an administrator to assign you to a CWS.</EmptyState>;

  return (
    <Stack gap="lg" maw={1200}>
      <Group justify="space-between" align="flex-end">
        <div>
          <Text c="gray.6" fw={700} tt="uppercase" size="xs">CWS operations</Text>
          <Title order={2}>Processing lots</Title>
        </div>
        <Select label="Station" data={options} value={station.id} onChange={(v) => v && setStationId(v)} allowDeselect={false} w={240} />
      </Group>

      <SuccessMessage onClose={() => setSaved(null)}>{saved}</SuccessMessage>

      {writable && (
        <Card withBorder radius="md" p="lg">
          {processes.loading && !processes.data ? (
            <Loading />
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

              <ErrorMessage>{error}</ErrorMessage>
              <Group justify="flex-end">
                <Button onClick={save} loading={saving} disabled={input <= 0}>Save processing lot</Button>
              </Group>
            </Stack>
          )}
        </Card>
      )}

      <Card withBorder radius="md" p="lg">
        <Text fw={600} mb="sm">Recent lots at {station.name}</Text>
        {lots.loading && !lots.data ? (
          <Loading />
        ) : lots.error ? (
          <ErrorMessage>{lots.error}</ErrorMessage>
        ) : lots.items.length === 0 ? (
          <EmptyState title="No lots yet">Saved processing lots appear here.</EmptyState>
        ) : (
          <Table.ScrollContainer minWidth={760}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Lot</Table.Th>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>Process</Table.Th>
                  <Table.Th ta="right">Cherry (kg)</Table.Th>
                  <Table.Th ta="right">Estimated (kg)</Table.Th>
                  <Table.Th ta="right">Actual (kg)</Table.Th>
                  <Table.Th ta="right">Out-turn</Table.Th>
                  <Table.Th>Status</Table.Th>
                  {writable && <Table.Th />}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {lots.items.map((lot) => (
                  <Table.Tr key={lot.id}>
                    <Table.Td ff="monospace">{lot.lot_number}</Table.Td>
                    <Table.Td>{lot.lot_date}</Table.Td>
                    <Table.Td>{lot.process_label}</Table.Td>
                    <Table.Td ta="right">{kg(lot.cherry_input_kg)}</Table.Td>
                    <Table.Td ta="right">{kg(lot.total_estimated_kg, 2)}</Table.Td>
                    <Table.Td ta="right">{lot.total_actual_kg === null ? '—' : kg(lot.total_actual_kg, 2)}</Table.Td>
                    <Table.Td ta="right">{lot.total_outturn_pct === null ? '—' : pct(lot.total_outturn_pct, 2)}</Table.Td>
                    <Table.Td><Badge color={statusColor[lot.status]} variant="light">{statusLabel[lot.status]}</Badge></Table.Td>
                    {writable && (
                      <Table.Td>
                        {lot.status !== 'CLOSED' && (
                          <Button size="compact-xs" variant="light" leftSection={<IconClipboardCheck size={14} />} onClick={() => setActualsLot(lot)}>
                            Actuals
                          </Button>
                        )}
                      </Table.Td>
                    )}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>

      {actualsLot && (
        <ActualsModal
          lot={actualsLot}
          onClose={() => setActualsLot(null)}
          onSaved={(lot) => {
            setActualsLot(null);
            setSaved(`Updated actuals for lot ${lot.lot_number}.`);
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await api<ProcessingLot>(`/processing/lots/${lot.id}/actuals/`, {
        method: 'POST',
        body: { actuals: lot.results.map((r) => ({ grade: r.grade, actual_kg: values[r.grade] === '' ? null : num(values[r.grade]) })) },
      });
      onSaved(updated);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal opened onClose={onClose} title={`Actual sorted quantities: ${lot.lot_number}`}>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">Cherry input {kg(lot.cherry_input_kg)} kg · {lot.process_label}</Text>
        {lot.results.map((r) => (
          <Group key={r.grade} grow>
            <Text size="sm" fw={600}>{r.grade_name} <Text span c="dimmed" size="xs">est. {kg(r.estimated_kg, 2)} kg</Text></Text>
            <NumberInput
              aria-label={`Actual ${r.grade_code}`}
              value={values[r.grade]}
              onChange={(v) => setValues((prev) => ({ ...prev, [r.grade]: v === '' ? '' : Number(v) }))}
              min={0}
              hideControls
            />
          </Group>
        ))}
        <ErrorMessage>{error}</ErrorMessage>
        <Button onClick={save} loading={saving}>Save actuals</Button>
      </Stack>
    </Modal>
  );
}
