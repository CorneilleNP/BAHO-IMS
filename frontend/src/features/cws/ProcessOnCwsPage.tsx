import { useState } from 'react';
import { ActionIcon, Button, Card, Group, NumberInput, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { IconPackage, IconPlus, IconTrash } from '@tabler/icons-react';
import { DataTable } from '../../components/DataTable';
import { EmptyState, ErrorMessage } from '../../components/Feedback';
import { PageHeader } from '../../components/PageHeader';
import { PageSkeleton } from '../../components/Skeletons';
import { StationSelect } from '../../components/StationSelect';
import { api } from '../../lib/api';
import { canWrite } from '../../lib/access';
import { useAuth } from '../../lib/authContext';
import { num, pct } from '../../lib/format';
import { toast } from '../../lib/toast';
import { useMyStations } from '../../lib/stations';
import type { ProcessType } from '../../lib/types';
import { query, useApi } from '../../lib/useApi';
import { useSubmit } from '../../lib/useSubmit';

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
  const stations = useMyStations();
  const { station } = stations;
  const processes = useApi<ProcessType[]>(station ? `/processing/process-types/${query({ facility: station.id })}` : null);

  const [name, setName] = useState('');
  const [subProcess, setSubProcess] = useState('');
  const [grades, setGrades] = useState<GradeRow[]>(() => rowsFor(WASHED_GRADES));
  const submit = useSubmit();

  const totalPercent = grades.reduce((sum, g) => sum + num(g.percent), 0);
  const updateGrade = (key: number, patch: Partial<GradeRow>) =>
    setGrades((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  async function save() {
    if (!station) return;
    if (!name.trim()) return submit.fail('Enter the process name, e.g. Fully Washed.');
    const created = await submit.run(() =>
      api<ProcessType>('/processing/process-types/', {
        method: 'POST',
        body: {
          facility: station.id,
          name: name.trim(),
          sub_process: subProcess.trim(),
          grades: grades
            .filter((g) => g.code.trim())
            .map((g) => ({
              code: g.code.trim().toUpperCase(),
              name: g.name.trim() || g.code.trim().toUpperCase(),
              ratio: (num(g.percent) / 100).toFixed(5),
            })),
        },
      }),
    );
    if (!created) return;
    toast.success(`${created.name}${created.sub_process ? ` / ${created.sub_process}` : ''} at ${station.name}.`, 'Process registered');
    setName('');
    setSubProcess('');
    setGrades(rowsFor(WASHED_GRADES));
    processes.reload();
  }

  if (stations.loading && !station) return <PageSkeleton />;
  if (!station) return <EmptyState title="No station assigned">Ask an administrator to assign you to a CWS.</EmptyState>;

  return (
    <Stack gap="lg" maw={1200}>
      <PageHeader eyebrow="CWS configuration" title="Register process on CWS" actions={<StationSelect stations={stations} />} />

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

              <ErrorMessage>{submit.error}</ErrorMessage>
              <Button leftSection={<IconPackage size={16} />} onClick={save} loading={submit.saving}>Save process</Button>
            </Stack>
          </Card>
        )}

        <Card withBorder radius="md" p="lg">
          <Text fw={700} size="lg" mb="sm">Processes at {station.name}</Text>
          <DataTable
            rows={processes.data ?? []}
            rowKey={(p) => p.id}
            loading={processes.loading}
            error={processes.error}
            minWidth={420}
            empty={{ title: 'No processes registered yet', hint: 'Register the processes this station runs, with their estimate ratios.' }}
            exportName={`processes-${station.code}`}
            columns={[
              {
                key: 'process',
                header: 'Process',
                exportValue: (p) => (p.sub_process ? `${p.name} / ${p.sub_process}` : p.name),
                render: (p) => (
                  <>
                    <Text fw={600} size="sm">{p.name}</Text>
                    {p.sub_process && <Text size="xs" c="dimmed">{p.sub_process}</Text>}
                  </>
                ),
              },
              { key: 'ratios', header: 'Estimate ratios', render: (p) => p.grades.map((g) => `${g.name} ${pct(num(g.ratio) * 100, 2)}`).join(' · ') },
              { key: 'total', header: 'Total', align: 'right', render: (p) => pct(num(p.total_ratio) * 100, 2) },
            ]}
          />
        </Card>
      </SimpleGrid>
    </Stack>
  );
}
