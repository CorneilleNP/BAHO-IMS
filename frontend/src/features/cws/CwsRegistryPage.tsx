import { useState } from 'react';
import { Button, Card, Container, NativeSelect, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconBuildingWarehouse } from '@tabler/icons-react';

export type CwsRecord = {
  id: string;
  name: string;
  country: string;
  province: string;
  district: string;
  sector: string;
  village: string;
  cell: string;
  manager: string;
};

export const defaultCwsRegistry: CwsRecord[] = [
  {
    id: 'gitoki-cws',
    name: 'Gitoki CWS',
    country: 'Rwanda',
    province: 'Western Province',
    district: 'Rubavu',
    sector: 'Nyamyumba',
    village: 'Gitoki',
    cell: 'Gitoki',
    manager: 'Jane Uwimana',
  },
  {
    id: 'bugoyi-cws',
    name: 'Bugoyi CWS',
    country: 'Rwanda',
    province: 'Western Province',
    district: 'Nyabihu',
    sector: 'Jenda',
    village: 'Bugoyi',
    cell: 'Bugoyi',
    manager: 'Emmanuel Ndayisenga',
  },
];

interface CwsRegistryPageProps {
  cwsList: CwsRecord[];
  selectedCwsId: string;
  onSelect: (cwsId: string) => void;
  onCreate: (record: CwsRecord) => void;
}

export function CwsRegistryPage({ cwsList, selectedCwsId, onSelect, onCreate }: CwsRegistryPageProps) {
  const [form, setForm] = useState({
    name: '',
    country: 'Rwanda',
    province: '',
    district: '',
    sector: '',
    village: '',
    cell: '',
    manager: '',
  });

  const handleSubmit = () => {
    const nextRecord: CwsRecord = {
      id: `${form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'cws'}-${Date.now()}`,
      name: form.name.trim(),
      country: form.country.trim() || 'Rwanda',
      province: form.province.trim(),
      district: form.district.trim(),
      sector: form.sector.trim(),
      village: form.village.trim(),
      cell: form.cell.trim(),
      manager: form.manager.trim(),
    };

    if (!nextRecord.name || !nextRecord.province || !nextRecord.district || !nextRecord.sector || !nextRecord.village || !nextRecord.cell || !nextRecord.manager) {
      return;
    }

    onCreate(nextRecord);
    onSelect(nextRecord.id);
    setForm({
      name: '',
      country: 'Rwanda',
      province: '',
      district: '',
      sector: '',
      village: '',
      cell: '',
      manager: '',
    });
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <div>
          <Text c="gray.6" fw={700} tt="uppercase" size="xs">
            Registry
          </Text>
          <Title order={1} size={32} fw={800} c="#1d2f2a">
            Register CWS
          </Title>
        </div>

        <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
          <Card withBorder radius="lg" p="lg" shadow="sm">
            <Stack gap="md">
              <Text fw={700} size="lg">New CWS profile</Text>

              <TextInput
                label="CWS name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.currentTarget.value }))}
              />

              <NativeSelect
                label="Country"
                value={form.country}
                onChange={(event) => setForm((prev) => ({ ...prev, country: event.currentTarget.value }))}
                data={['Rwanda']}
              />

              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
                <TextInput label="Province" value={form.province} onChange={(event) => setForm((prev) => ({ ...prev, province: event.currentTarget.value }))} />
                <TextInput label="District" value={form.district} onChange={(event) => setForm((prev) => ({ ...prev, district: event.currentTarget.value }))} />
                <TextInput label="Sector" value={form.sector} onChange={(event) => setForm((prev) => ({ ...prev, sector: event.currentTarget.value }))} />
                <TextInput label="Village" value={form.village} onChange={(event) => setForm((prev) => ({ ...prev, village: event.currentTarget.value }))} />
                <TextInput label="Cell" value={form.cell} onChange={(event) => setForm((prev) => ({ ...prev, cell: event.currentTarget.value }))} />
                <TextInput label="Manager" value={form.manager} onChange={(event) => setForm((prev) => ({ ...prev, manager: event.currentTarget.value }))} />
              </SimpleGrid>

              <Button color="coffee" onClick={handleSubmit} leftSection={<IconBuildingWarehouse size={16} />}>
                Save CWS
              </Button>
            </Stack>
          </Card>

          <Card withBorder radius="lg" p="lg" shadow="sm">
            <Stack gap="md">
              <Text fw={700} size="lg">Registered CWS</Text>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Manager</Table.Th>
                    <Table.Th>Location</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {cwsList.map((item) => (
                    <Table.Tr
                      key={item.id}
                      style={{ cursor: 'pointer', background: selectedCwsId === item.id ? '#f8efe6' : undefined }}
                      onClick={() => onSelect(item.id)}
                    >
                      <Table.Td>{item.name}</Table.Td>
                      <Table.Td>{item.manager}</Table.Td>
                      <Table.Td>{`${item.village}, ${item.cell}, ${item.sector}, ${item.district}`}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Stack>
          </Card>
        </SimpleGrid>
      </Stack>
    </Container>
  );
}
