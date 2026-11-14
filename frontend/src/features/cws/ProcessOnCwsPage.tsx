import { useState } from 'react';
import { Button, Card, Stack, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { DataTable } from '../../components/DataTable';
import { EmptyState } from '../../components/Feedback';
import { PageHeader } from '../../components/PageHeader';
import { PageSkeleton } from '../../components/Skeletons';
import { StationSelect } from '../../components/StationSelect';
import { canWrite } from '../../lib/access';
import { useAuth } from '../../lib/authContext';
import { num, pct } from '../../lib/format';
import { useMyStations } from '../../lib/stations';
import type { ProcessType } from '../../lib/types';
import { query, useApi } from '../../lib/useApi';
import { CwsProcessWizard } from './CwsProcessWizard';

/** Processes run at the selected station, with their estimate ratios. */
export function ProcessOnCwsPage() {
  const { user } = useAuth();
  const writable = canWrite(user, 'cws');
  const stations = useMyStations();
  const { station } = stations;
  const processes = useApi<ProcessType[]>(station ? `/processing/process-types/${query({ facility: station.id })}` : null);
  const [wizardOpen, setWizardOpen] = useState(false);

  if (stations.loading && !station) return <PageSkeleton />;
  if (!station) return <EmptyState title="No station assigned">Ask an administrator to assign you to a CWS.</EmptyState>;

  return (
    <Stack gap="lg" maw={1200}>
      <PageHeader
        eyebrow="CWS configuration"
        title="Register process on CWS"
        actions={
          <>
            <StationSelect stations={stations} />
            {writable && <Button leftSection={<IconPlus size={16} />} onClick={() => setWizardOpen(true)}>Register process</Button>}
          </>
        }
      />

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

      {wizardOpen && (
        <CwsProcessWizard
          station={station}
          onClose={() => setWizardOpen(false)}
          onSaved={() => {
            setWizardOpen(false);
            processes.reload();
          }}
        />
      )}
    </Stack>
  );
}
