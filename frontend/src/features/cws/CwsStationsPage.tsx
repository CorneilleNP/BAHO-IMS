import { useState } from 'react';
import { Badge, Button, Card, Stack } from '@mantine/core';
import { IconBuildingWarehouse } from '@tabler/icons-react';
import { DataTable } from '../../components/DataTable';
import { EmptyState } from '../../components/Feedback';
import { PageHeader } from '../../components/PageHeader';
import { isAdmin } from '../../lib/access';
import { useAuth } from '../../lib/authContext';
import type { Facility } from '../../lib/types';
import { useList } from '../../lib/useApi';
import { CwsStationWizard } from './CwsStationWizard';

/** Register and manage coffee washing stations. Admin only - everyone else
 * already sees these stations wherever they pick a source or a station,
 * but only an administrator can add or edit one. */
export function CwsStationsPage() {
  const { user } = useAuth();
  const [wizard, setWizard] = useState<{ station: Facility | null } | null>(null);
  const stations = useList<Facility>('/organization/facilities/?facility_type=CWS&page_size=500&ordering=name');

  if (!isAdmin(user)) {
    return <EmptyState title="Administrators only">Only a super-admin account can register or edit coffee washing stations.</EmptyState>;
  }

  return (
    <Stack gap="lg" maw={1100}>
      <PageHeader
        eyebrow="CWS operations"
        title="Register CWS"
        description="Every coffee washing station in the system, and where it is in Rwanda's admin hierarchy."
        actions={<Button leftSection={<IconBuildingWarehouse size={16} />} onClick={() => setWizard({ station: null })}>Register CWS</Button>}
      />

      <Card p="lg">
        <DataTable
          rows={stations.items}
          rowKey={(f) => f.id}
          loading={stations.loading}
          error={stations.error}
          minWidth={700}
          empty={{ title: 'No stations registered yet', hint: 'Use “Register CWS” to add the first one.' }}
          exportName="cws-stations"
          onRowClick={(f) => setWizard({ station: f })}
          columns={[
            { key: 'name', header: 'Name', render: (f) => f.name, exportValue: (f) => f.name },
            { key: 'code', header: 'Code', mono: true, render: (f) => f.code },
            { key: 'location', header: 'Location', render: (f) => f.location_label || '—' },
            { key: 'contact', header: 'Contact', render: (f) => [f.contact_name, f.contact_phone].filter(Boolean).join(' · ') || '—' },
            {
              key: 'status',
              header: 'Status',
              exportValue: (f) => (f.is_active ? 'Active' : 'Inactive'),
              render: (f) => <Badge color={f.is_active ? 'teal' : 'gray'} variant="light">{f.is_active ? 'Active' : 'Inactive'}</Badge>,
            },
          ]}
        />
      </Card>

      {wizard && (
        <CwsStationWizard
          key={wizard.station?.id ?? 'new'}
          station={wizard.station}
          onClose={() => setWizard(null)}
          onSaved={() => {
            setWizard(null);
            stations.reload();
          }}
        />
      )}
    </Stack>
  );
}
