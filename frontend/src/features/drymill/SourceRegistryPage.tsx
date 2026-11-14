import { useState } from 'react';
import { Badge, Button, Card, SimpleGrid, Stack, Table, Text, TextInput, Textarea, Title } from '@mantine/core';
import { IconBuildingWarehouse } from '@tabler/icons-react';
import { EmptyState, ErrorMessage, Loading, SuccessMessage } from '../../components/Feedback';
import { api } from '../../lib/api';
import { canWrite } from '../../lib/access';
import { useAuth } from '../../lib/authContext';
import type { CoffeeSource, Supplier } from '../../lib/types';
import { errorText, useApi, useList } from '../../lib/useApi';

const blank = { name: '', contact_name: '', phone: '', tin: '', province: '', district: '', sector: '', notes: '' };

/** Coffee sources for the dry mill: Baho CWS stations (automatic) + partner suppliers (registered here). */
export function SourceRegistryPage() {
  const { user } = useAuth();
  const writable = canWrite(user, 'drymill');
  const sources = useApi<CoffeeSource[]>('/drymill/sources/');
  const suppliers = useList<Supplier>('/drymill/suppliers/?page_size=500');
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const set = (field: keyof typeof blank) => (event: { currentTarget: { value: string } }) => {
    const value = event.currentTarget.value;
    setForm((previous) => ({ ...previous, [field]: value }));
  };
  const supplierById = new Map(suppliers.items.map((s) => [s.id, s]));

  async function save() {
    if (!form.name.trim()) {
      setError('Enter the supplier name.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const supplier = await api<Supplier>('/drymill/suppliers/', { method: 'POST', body: form });
      setSaved(`Registered supplier ${supplier.name}.`);
      setForm(blank);
      sources.reload();
      suppliers.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack gap="lg" maw={1300}>
      <div>
        <Text c="gray.6" fw={700} tt="uppercase" size="xs">Registry</Text>
        <Title order={2}>Suppliers and sources</Title>
      </div>

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
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <TextInput label="Contact person" value={form.contact_name} onChange={set('contact_name')} />
                <TextInput label="Phone" value={form.phone} onChange={set('phone')} />
                <TextInput label="TIN" value={form.tin} onChange={set('tin')} />
                <TextInput label="Province" value={form.province} onChange={set('province')} />
                <TextInput label="District" value={form.district} onChange={set('district')} />
                <TextInput label="Sector" value={form.sector} onChange={set('sector')} />
              </SimpleGrid>
              <Textarea label="Notes" value={form.notes} onChange={set('notes')} autosize minRows={2} />
              <ErrorMessage>{error}</ErrorMessage>
              <Button leftSection={<IconBuildingWarehouse size={16} />} onClick={save} loading={saving}>Save supplier</Button>
            </Stack>
          </Card>
        )}

        <Card withBorder radius="md" p="lg">
          <Text fw={700} size="lg" mb="sm">All sources</Text>
          {sources.loading && !sources.data ? (
            <Loading />
          ) : sources.error ? (
            <ErrorMessage>{sources.error}</ErrorMessage>
          ) : !sources.data?.length ? (
            <EmptyState title="No sources yet" />
          ) : (
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Contact</Table.Th>
                  <Table.Th>Location</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {sources.data.map((source) => {
                  const supplier = supplierById.get(source.id);
                  return (
                    <Table.Tr key={`${source.origin_type}-${source.id}`}>
                      <Table.Td fw={600}>{source.name}</Table.Td>
                      <Table.Td>
                        <Badge variant="light" color={source.origin_type === 'OWN_CWS' ? 'coffee' : 'blue'}>
                          {source.origin_type === 'OWN_CWS' ? 'Baho CWS' : 'Partner supplier'}
                        </Badge>
                      </Table.Td>
                      <Table.Td>{supplier ? [supplier.contact_name, supplier.phone].filter(Boolean).join(' · ') || '—' : '—'}</Table.Td>
                      <Table.Td>{supplier ? [supplier.district, supplier.sector].filter(Boolean).join(', ') || '—' : '—'}</Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          )}
        </Card>
      </SimpleGrid>
    </Stack>
  );
}
