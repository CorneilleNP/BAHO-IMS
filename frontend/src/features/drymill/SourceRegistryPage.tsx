import { useMemo, useState } from 'react';
import { Button, Card, NativeSelect, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconBuildingWarehouse } from '@tabler/icons-react';
import { defaultCwsRegistry } from '../cws/CwsRegistryPage';

export type SourceRecord = {
  id: string;
  name: string;
  type: 'CWS' | 'Supplier';
  cwsId?: string;
  province?: string;
  district?: string;
  sector?: string;
  contact?: string;
  notes?: string;
};

export const defaultSourceRegistry: SourceRecord[] = [
  {
    id: 'gitoki-cws-source',
    name: 'Gitoki CWS',
    type: 'CWS',
    cwsId: 'gitoki-cws',
    province: 'Western Province',
    district: 'Rubavu',
    sector: 'Nyamyumba',
    contact: 'Jane Uwimana',
    notes: 'Primary CWS supply source',
  },
  {
    id: 'bugoyi-cws-source',
    name: 'Bugoyi CWS',
    type: 'CWS',
    cwsId: 'bugoyi-cws',
    province: 'Western Province',
    district: 'Nyabihu',
    sector: 'Jenda',
    contact: 'Emmanuel Ndayisenga',
    notes: 'Secondary CWS supply source',
  },
  {
    id: 'mukamira-coop',
    name: 'Mukamira Cooperative',
    type: 'Supplier',
    province: 'Western Province',
    district: 'Rubavu',
    sector: 'Nyamyumba',
    contact: 'Isaac Mugabo',
    notes: 'Partner supplier',
  },
];

interface SourceRegistryPageProps {
  sourceList: SourceRecord[];
  onAddSource: (source: SourceRecord) => void;
}

export function SourceRegistryPage({ sourceList, onAddSource }: SourceRegistryPageProps) {
  const [form, setForm] = useState({
    name: '',
    type: '' as SourceRecord['type'] | '',
    cwsId: '',
    province: '',
    district: '',
    sector: '',
    contact: '',
    notes: '',
  });

  const normalizeSupplierType = (value: string): SourceRecord['type'] | '' => {
    const normalised = value.trim().toLowerCase();
    if (normalised === 'cws') return 'CWS';
    if (normalised === 'supplier' || normalised === 'usual supplier' || normalised === 'partner supplier' || normalised === 'partner') return 'Supplier';
    return '';
  };

  const linkedCwsOptions = useMemo(
    () => defaultCwsRegistry.map((cws) => ({ value: cws.id, label: cws.name })),
    [],
  );

  const handleSubmit = () => {
    const trimmedName = form.name.trim();
    const sourceType = form.type;
    if (!trimmedName || !sourceType) return;

    const cwsName = form.cwsId.trim();
    const matchedCwsId = defaultCwsRegistry.find((cws) => cws.name.toLowerCase() === cwsName.toLowerCase())?.id;
    const resolvedCwsId = sourceType === 'CWS'
      ? ((matchedCwsId ?? cwsName) || defaultCwsRegistry[0]?.id)
      : undefined;

    const nextSource: SourceRecord = {
      id: `${trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'source'}-${Date.now()}`,
      name: trimmedName,
      type: sourceType,
      cwsId: resolvedCwsId,
      province: form.province.trim(),
      district: form.district.trim(),
      sector: form.sector.trim(),
      contact: form.contact.trim(),
      notes: form.notes.trim(),
    };

    onAddSource(nextSource);
    setForm({
      name: '',
      type: '',
      cwsId: '',
      province: '',
      district: '',
      sector: '',
      contact: '',
      notes: '',
    });
  };

  return (
    <Stack gap="lg">
      <div>
        <Text c="gray.6" fw={700} tt="uppercase" size="xs">
          Registry
        </Text>
        <Title order={1} size={32} fw={800} c="#1d2f2a">
          Register supplier
        </Title>
      </div>

      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
        <Card withBorder radius="lg" p="lg" shadow="sm">
          <Stack gap="md">
            <Text fw={700} size="lg">New supplier profile</Text>

            <TextInput
              label="Supplier name"
              value={form.name}
              onChange={(event) => {
                const nextValue = (event.target as HTMLInputElement | null)?.value ?? '';
                setForm((previous) => ({ ...previous, name: nextValue }));
              }}
            />

            <NativeSelect
              label="Supplier type"
              value={form.type}
              data={[
                { value: '', label: 'Select supplier type' },
                { value: 'CWS', label: 'CWS' },
                { value: 'Supplier', label: 'Supplier' },
              ]}
              onChange={(event) => {
                const nextInput = (event.currentTarget as HTMLSelectElement | null)?.value ?? '';
                const nextType = normalizeSupplierType(nextInput);
                setForm((previous) => ({
                  ...previous,
                  type: nextType || '',
                  cwsId: nextType === 'CWS' ? previous.cwsId : '',
                }));
              }}
            />

            {form.type === 'CWS' && (
              <TextInput
                label="Link to CWS inventory"
                value={form.cwsId}
                onChange={(event) => {
                  const nextValue = (event.target as HTMLInputElement | null)?.value ?? '';
                  setForm((previous) => ({ ...previous, cwsId: nextValue }));
                }}
                list="cws-option-list"
                placeholder="Choose or type CWS"
              />
            )}
            <datalist id="cws-option-list">
              {linkedCwsOptions.map((option) => (
                <option key={option.value} value={option.label} />
              ))}
            </datalist>

            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
              <TextInput
                label="Province"
                value={form.province}
                onChange={(event) => {
                  const nextValue = (event.target as HTMLInputElement | null)?.value ?? '';
                  setForm((previous) => ({ ...previous, province: nextValue }));
                }}
              />
              <TextInput
                label="District"
                value={form.district}
                onChange={(event) => {
                  const nextValue = (event.target as HTMLInputElement | null)?.value ?? '';
                  setForm((previous) => ({ ...previous, district: nextValue }));
                }}
              />
              <TextInput
                label="Sector"
                value={form.sector}
                onChange={(event) => {
                  const nextValue = (event.target as HTMLInputElement | null)?.value ?? '';
                  setForm((previous) => ({ ...previous, sector: nextValue }));
                }}
              />
              <TextInput
                label="Contact"
                value={form.contact}
                onChange={(event) => {
                  const nextValue = (event.target as HTMLInputElement | null)?.value ?? '';
                  setForm((previous) => ({ ...previous, contact: nextValue }));
                }}
              />
            </SimpleGrid>

            <TextInput
              label="Notes"
              value={form.notes}
              onChange={(event) => {
                const nextValue = (event.target as HTMLInputElement | null)?.value ?? '';
                setForm((previous) => ({ ...previous, notes: nextValue }));
              }}
            />

            <Button color="coffee" onClick={handleSubmit} leftSection={<IconBuildingWarehouse size={16} />}>
              Save supplier
            </Button>
          </Stack>
        </Card>

        <Card withBorder radius="lg" p="lg" shadow="sm">
          <Stack gap="md">
            <Text fw={700} size="lg">Saved suppliers</Text>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Linked CWS</Table.Th>
                  <Table.Th>Location</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {sourceList.map((source) => (
                  <Table.Tr key={source.id}>
                    <Table.Td>{source.name}</Table.Td>
                    <Table.Td>{source.type}</Table.Td>
                    <Table.Td>{source.cwsId ? defaultCwsRegistry.find((cws) => cws.id === source.cwsId)?.name ?? source.cwsId : '—'}</Table.Td>
                    <Table.Td>{[source.district, source.sector].filter(Boolean).join(', ') || '—'}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        </Card>
      </SimpleGrid>
    </Stack>
  );
}
