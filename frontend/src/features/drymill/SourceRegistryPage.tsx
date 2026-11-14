import { useState } from 'react';
import { Badge, Button, Card, SimpleGrid, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { IconBuildingWarehouse } from '@tabler/icons-react';
import { DataTable } from '../../components/DataTable';
import { ErrorMessage, SuccessMessage } from '../../components/Feedback';
import { LocationPicker } from '../../components/LocationPicker';
import { PageHeader } from '../../components/PageHeader';
import { api } from '../../lib/api';
import { canWrite } from '../../lib/access';
import { useAuth } from '../../lib/authContext';
import type { CoffeeSource, Facility, Paginated, Supplier } from '../../lib/types';
import { useApi, useList } from '../../lib/useApi';
import { useSubmit } from '../../lib/useSubmit';

const blank = { name: '', contact_name: '', phone: '', tin: '', notes: '' };

/** Coffee sources for the dry mill: Baho CWS stations (automatic) + partner suppliers (registered here). */
export function SourceRegistryPage() {
  const { user } = useAuth();
  const writable = canWrite(user, 'drymill');
  const sources = useApi<CoffeeSource[]>('/drymill/sources/');
  const suppliers = useList<Supplier>('/drymill/suppliers/?page_size=500');
  const stations = useApi<Paginated<Facility>>('/organization/facilities/?facility_type=CWS&page_size=200');
  const [form, setForm] = useState(blank);
  const [location, setLocation] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const submit = useSubmit();

  const set = (field: keyof typeof blank) => (event: { currentTarget: { value: string } }) => {
    const value = event.currentTarget.value;
    setForm((previous) => ({ ...previous, [field]: value }));
  };

  // One location label per source, whether it is a station or a supplier.
  const details = new Map<string, { contact: string; location: string }>();
  suppliers.items.forEach((s) => details.set(s.id, { contact: [s.contact_name, s.phone].filter(Boolean).join(' · '), location: s.location_label }));
  (stations.data?.results ?? []).forEach((f) => details.set(f.id, { contact: '', location: f.location_label }));

  async function save() {
    if (!form.name.trim()) return submit.fail('Enter the supplier name.');
    const supplier = await submit.run(() => api<Supplier>('/drymill/suppliers/', { method: 'POST', body: { ...form, location } }));
    if (!supplier) return;
    setSaved(`Registered supplier ${supplier.name}.`);
    setForm(blank);
    setLocation(null);
    sources.reload();
    suppliers.reload();
  }

  return (
    <Stack gap="lg" maw={1300}>
      <PageHeader eyebrow="Registry" title="Suppliers and sources" />

      <SuccessMessage onClose={() => setSaved(null)}>{saved}</SuccessMessage>

      <SimpleGrid cols={{ base: 1, lg: writable ? 2 : 1 }} spacing="lg">
        {writable && (
          <Card withBorder radius="md" p="lg">
            <Stack gap="sm">
              <Text fw={700} size="lg">Register partner supplier</Text>
              <Text size="sm" c="dimmed">
                Baho&apos;s own CWS stations are listed automatically. New stations are added by an administrator.
              </Text>
              <TextInput label="Supplier name" required value={form.name} onChange={set('name')} />
              <SimpleGrid cols={{ base: 1, sm: 3 }}>
                <TextInput label="Contact person" value={form.contact_name} onChange={set('contact_name')} />
                <TextInput label="Phone" value={form.phone} onChange={set('phone')} />
                <TextInput label="TIN" value={form.tin} onChange={set('tin')} />
              </SimpleGrid>
              <LocationPicker legend="Supplier location" depth="SECTOR" value={location} onChange={setLocation} searchable={false} />
              <Textarea label="Notes" value={form.notes} onChange={set('notes')} autosize minRows={2} />
              <ErrorMessage>{submit.error}</ErrorMessage>
              <Button leftSection={<IconBuildingWarehouse size={16} />} onClick={save} loading={submit.saving}>Save supplier</Button>
            </Stack>
          </Card>
        )}

        <Card withBorder radius="md" p="lg">
          <Text fw={700} size="lg" mb="sm">All sources</Text>
          <DataTable
            rows={sources.data ?? []}
            rowKey={(s) => `${s.origin_type}-${s.id}`}
            loading={sources.loading}
            error={sources.error}
            minWidth={520}
            empty={{ title: 'No sources yet' }}
            columns={[
              { key: 'name', header: 'Name', render: (s) => <Text fw={600} size="sm">{s.name}</Text> },
              {
                key: 'type',
                header: 'Type',
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
      </SimpleGrid>
    </Stack>
  );
}
