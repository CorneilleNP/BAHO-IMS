import { useState } from 'react';
import { Badge, Button, Card, Stack, Text } from '@mantine/core';
import { IconBuildingWarehouse } from '@tabler/icons-react';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { canWrite } from '../../lib/access';
import { useAuth } from '../../lib/authContext';
import type { CoffeeSource, Facility, Paginated, Supplier } from '../../lib/types';
import { useApi, useList } from '../../lib/useApi';
import { SupplierWizard } from './SupplierWizard';

/** Coffee sources for the dry mill: Baho CWS stations (automatic) + partner suppliers (registered here). */
export function SourceRegistryPage() {
  const { user } = useAuth();
  const writable = canWrite(user, 'drymill');
  const sources = useApi<CoffeeSource[]>('/drymill/sources/');
  const suppliers = useList<Supplier>('/drymill/suppliers/?page_size=500');
  const stations = useApi<Paginated<Facility>>('/organization/facilities/?facility_type=CWS&page_size=200');
  const [wizard, setWizard] = useState<{ supplier: Supplier | null } | null>(null);

  const supplierById = new Map(suppliers.items.map((s) => [s.id, s]));
  // One location label per source, whether it is a station or a supplier.
  const details = new Map<string, { contact: string; location: string }>();
  suppliers.items.forEach((s) => details.set(s.id, { contact: [s.contact_name, s.phone].filter(Boolean).join(' · '), location: s.location_label }));
  (stations.data?.results ?? []).forEach((f) => details.set(f.id, { contact: '', location: f.location_label }));

  return (
    <Stack gap="lg" maw={1300}>
      <PageHeader
        eyebrow="Registry"
        title="Suppliers and sources"
        description="Baho CWS stations are listed automatically (new stations are added by an administrator). Click a partner supplier to edit it."
        actions={writable && <Button leftSection={<IconBuildingWarehouse size={16} />} onClick={() => setWizard({ supplier: null })}>Register supplier</Button>}
      />

      <Card withBorder radius="md" p="lg">
        <DataTable
          rows={sources.data ?? []}
          rowKey={(s) => `${s.origin_type}-${s.id}`}
          loading={sources.loading}
          error={sources.error}
          minWidth={620}
          empty={{ title: 'No sources yet' }}
          exportName="coffee-sources"
          onRowClick={writable ? (s) => supplierById.has(s.id) && setWizard({ supplier: supplierById.get(s.id)! }) : undefined}
          columns={[
            { key: 'name', header: 'Name', render: (s) => <Text fw={600} size="sm">{s.name}</Text>, exportValue: (s) => s.name },
            {
              key: 'type',
              header: 'Type',
              exportValue: (s) => (s.origin_type === 'OWN_CWS' ? 'Baho CWS' : 'Partner supplier'),
              render: (s) => (
                <Badge variant="light" color={s.origin_type === 'OWN_CWS' ? 'coffee' : 'blue'}>
                  {s.origin_type === 'OWN_CWS' ? 'Baho CWS' : 'Partner supplier'}
                </Badge>
              ),
            },
            { key: 'contact', header: 'Contact', render: (s) => details.get(s.id)?.contact || '—' },
            { key: 'location', header: 'Location', render: (s) => details.get(s.id)?.location || '—' },
          ]}
        />
      </Card>

      {wizard && (
        <SupplierWizard
          key={wizard.supplier?.id ?? 'new'}
          supplier={wizard.supplier}
          onClose={() => setWizard(null)}
          onSaved={() => {
            setWizard(null);
            sources.reload();
            suppliers.reload();
          }}
        />
      )}
    </Stack>
  );
}
