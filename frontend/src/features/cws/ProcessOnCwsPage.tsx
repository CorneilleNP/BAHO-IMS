import { useState } from 'react';
import { ActionIcon, Button, Card, Group, NumberInput, Select, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconPackage, IconPlus, IconTrash } from '@tabler/icons-react';
import { EmptyState, ErrorMessage, Loading, SuccessMessage } from '../../components/Feedback';
import { api } from '../../lib/api';
import { canWrite } from '../../lib/access';
import { useAuth } from '../../lib/authContext';
import { num, pct } from '../../lib/format';
import { useMyStations } from '../../lib/stations';
import type { ProcessType } from '../../lib/types';
import { errorText, query, useApi } from '../../lib/useApi';

interface GradeRow {
  key: number;
  code: string;
  name: string;
  percent: number | '';
}

const WASHED_GRADES = ['A1', 'A2', 'A3', 'HPC'];
const NATURAL_GRADES = ['HG', 'HPC'];
let nextKey = 1;
const rowsFor = (codes: string[]): GradeRow[] => codes.map((code) => ({ key: nextKey++, code, name: '', percent: '' }));

/** Register a process on a CWS with its grades and estimate ratios ("ESTIMATE RATIO" row of the workbook). */
export function ProcessOnCwsPage() {
  const { user } = useAuth();
  const writable = canWrite(user, 'cws');
  const { station, setStationId, options, loading: stationsLoading } = useMyStations();
  const processes = useApi<ProcessType[]>(station ? `/processing/process-types/${query({ facility: station.id })}` : null);

  const [name, setName] = useState('');
  const [subProcess, setSubProcess] = useState('');
  const [grades, setGrades] = useState<GradeRow[]>(() => rowsFor(WASHED_GRADES));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const totalPercent = grades.reduce((sum, g) => sum + num(g.percent), 0);
  const updateGrade = (key: number, patch: Partial<GradeRow>) =>
    setGrades((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  async function save() {
    if (!station) return;
    if (!name.trim()) {
      setError('Enter the process name, e.g. Fully Washed.');
      return;
    }
    const filled = grades.filter((g) => g.code.trim());
    setSaving(true);
    setError(null);
    try {
      const created = await api<ProcessType>('/processing/process-types/', {
        method: 'POST',
        body: {
          facility: station.id,
          name: name.trim(),
          sub_process: subProcess.trim(),
          grades: filled.map((g) => ({
            code: g.code.trim().toUpperCase(),
            name: g.name.trim() || g.code.trim().toUpperCase(),
            ratio: (num(g.percent) / 100).toFixed(5),
          })),
        },
      });
      setSaved(`Registered ${created.name}${created.sub_process ? ` / ${created.sub_process}` : ''} at ${station.name}.`);
      setName('');
      setSubProcess('');
      setGrades(rowsFor(WASHED_GRADES));
      processes.reload();
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
          <Text c="gray.6" fw={700} tt="uppercase" size="xs">CWS configuration</Text>
          <Title order={2}>Register process on CWS</Title>
        </div>
        <Select label="Station" data={options} value={station.id} onChange={(v) => v && setStationId(v)} allowDeselect={false} w={240} />
      </Group>

      <SuccessMessage onClose={() => setSaved(null)}>{saved}</SuccessMessage>

      <SimpleGrid cols={{ base: 1, lg: writable ? 2 : 1 }} spacing="lg">
        {writable && (
          <Card withBorder radius="md" p="lg">
            <Stack gap="md">
              <Text fw={700} size="lg">Add a process</Text>
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <TextInput label="Process name" required placeholder="Fully Washed" value={name} onChange={(e) => setName(e.currentTarget.value)} />
                <TextInput label="Sub-process" placeholder="Standard Run" value={subProcess} onChange={(e) => setSubProcess(e.currentTarget.value)} />
              </SimpleGrid>

              <Group justify="space-between">
                <Text fw={600} size="sm">Grades and estimate ratios</Text>
                <Group gap={6}>
                  <Button size="compact-xs" variant="default" onClick={() => setGrades(rowsFor(WASHED_GRADES))}>Washed: A1–HPC</Button>
                  <Button size="compact-xs" variant="default" onClick={() => setGrades(rowsFor(NATURAL_GRADES))}>Natural: HG, HPC</Button>
                </Group>
              </Group>

              <Stack gap={6}>
                {grades.map((g) => (
                  <Group key={g.key} gap="xs" wrap="nowrap">
                    <TextInput aria-label="Grade code" placeholder="Code" value={g.code} onChange={(e) => updateGrade(g.key, { code: e.currentTarget.value })} w={90} />
                    <TextInput aria-label="Grade label" placeholder="Label (optional)" value={g.name} onChange={(e) => updateGrade(g.key, { name: e.currentTarget.value })} style={{ flex: 1 }} />
                    <NumberInput
                      aria-label={`${g.code || 'Grade'} estimate %`}
                      placeholder="0"
                      value={g.percent}
                      onChange={(v) => updateGrade(g.key, { percent: v === '' ? '' : Number(v) })}
                      min={0}
                      max={100}
                      decimalScale={3}
                      suffix="%"
                      hideControls
                      w={110}
                    />
                    <ActionIcon variant="subtle" color="red" aria-label="Remove grade" onClick={() => setGrades((rows) => rows.filter((r) => r.key !== g.key))} disabled={grades.length <= 1}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                ))}
              </Stack>
              <Group justify="space-between">
                <Button size="compact-sm" variant="subtle" leftSection={<IconPlus size={14} />} onClick={() => setGrades((rows) => [...rows, ...rowsFor([''])])}>
                  Add grade
                </Button>
                <Text size="sm" c={totalPercent > 100 ? 'red' : 'dimmed'}>
                  Total estimate: <strong>{pct(totalPercent, 2)}</strong> of cherry input
                </Text>
              </Group>

              <ErrorMessage>{error}</ErrorMessage>
              <Button leftSection={<IconPackage size={16} />} onClick={save} loading={saving}>Save process</Button>
            </Stack>
          </Card>
        )}

        <Card withBorder radius="md" p="lg">
          <Text fw={700} size="lg" mb="sm">Processes at {station.name}</Text>
          {processes.loading && !processes.data ? (
            <Loading />
          ) : processes.error ? (
            <ErrorMessage>{processes.error}</ErrorMessage>
          ) : !processes.data?.length ? (
            <EmptyState title="No processes registered yet">Register the processes this station runs, with their estimate ratios.</EmptyState>
          ) : (
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Process</Table.Th>
                  <Table.Th>Estimate ratios</Table.Th>
                  <Table.Th ta="right">Total</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {processes.data.map((p) => (
                  <Table.Tr key={p.id}>
                    <Table.Td>
                      <Text fw={600} size="sm">{p.name}</Text>
                      {p.sub_process && <Text size="xs" c="dimmed">{p.sub_process}</Text>}
                    </Table.Td>
                    <Table.Td>{p.grades.map((g) => `${g.name} ${pct(num(g.ratio) * 100, 2)}`).join(' · ')}</Table.Td>
                    <Table.Td ta="right">{pct(num(p.total_ratio) * 100, 2)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Card>
      </SimpleGrid>
    </Stack>
  );
}
