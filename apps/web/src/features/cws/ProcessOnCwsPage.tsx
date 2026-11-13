import { useState } from 'react';
import { Badge, Button, Card, Container, Group, NumberInput, Select, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconClipboardCheck, IconPackage } from '@tabler/icons-react';
import type { CwsRecord } from './CwsRegistryPage';

export type ProductEstimateKey = 'A1' | 'A2' | 'A3' | 'HPC';

export type ProcessDefinition = {
  id: string;
  cwsId: string;
  processName: string;
  subProcessName: string;
  estimates: Record<ProductEstimateKey, number>;
};

const percentValue = (value: number | string) => Number(value) || 0;

export const defaultProcessDefinitions: ProcessDefinition[] = [
  {
    id: 'gitoki-fw-standard',
    cwsId: 'gitoki-cws',
    processName: 'Fully Washed',
    subProcessName: 'Standard Run',
    estimates: { A1: 14, A2: 4, A3: 2.5, HPC: 1.5 },
  },
  {
    id: 'gitoki-nn-standard',
    cwsId: 'gitoki-cws',
    processName: 'Normal Natural',
    subProcessName: 'Standard Run',
    estimates: { A1: 30, A2: 0, A3: 0, HPC: 3 },
  },
  {
    id: 'bugoyi-fw-standard',
    cwsId: 'bugoyi-cws',
    processName: 'Fully Washed',
    subProcessName: 'Standard Run',
    estimates: { A1: 13, A2: 5, A3: 2, HPC: 1 },
  },
];

interface ProcessOnCwsPageProps {
  cwsList: CwsRecord[];
  processDefinitions: ProcessDefinition[];
  onAddProcess: (record: ProcessDefinition) => void;
}

export function ProcessOnCwsPage({ cwsList, processDefinitions, onAddProcess }: ProcessOnCwsPageProps) {
  const [form, setForm] = useState({
    cwsId: cwsList[0]?.id ?? '',
    processName: '',
    subProcessName: '',
    A1: '',
    A2: '',
    A3: '',
    HPC: '',
  });

  const readInputValue = (event: React.ChangeEvent<HTMLInputElement>) => {
    const target = event?.target;
    return target && 'value' in target ? String(target.value ?? '') : '';
  };

  const handleSubmit = () => {
    if (!form.cwsId || !form.processName.trim() || !form.subProcessName.trim()) return;

    const estimates = {
      A1: percentValue(form.A1),
      A2: percentValue(form.A2),
      A3: percentValue(form.A3),
      HPC: percentValue(form.HPC),
    };

    const total = Object.values(estimates).reduce((sum, value) => sum + value, 0);
    if (total <= 0) return;

    const newProcess: ProcessDefinition = {
      id: `${form.processName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${form.subProcessName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
      cwsId: form.cwsId,
      processName: form.processName.trim(),
      subProcessName: form.subProcessName.trim(),
      estimates,
    };

    onAddProcess(newProcess);
    setForm({
      cwsId: form.cwsId,
      processName: '',
      subProcessName: '',
      A1: '',
      A2: '',
      A3: '',
      HPC: '',
    });
  };

  const selectedCws = cwsList.find((cws) => cws.id === form.cwsId) ?? cwsList[0];

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <div>
          <Text c="gray.6" fw={700} tt="uppercase" size="xs">
            CWS configuration
          </Text>
          <Title order={1} size={32} fw={800} c="#1d2f2a">
            Register process on CWS
          </Title>
        </div>

        <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
          <Card withBorder radius="lg" p="lg" shadow="sm">
            <Stack gap="md">
              <Text fw={700} size="lg">Add another process</Text>

              <Select
                label="CWS"
                data={cwsList.map((cws) => ({ value: cws.id, label: cws.name }))}
                value={form.cwsId}
                onChange={(value) => value && setForm((previous) => ({ ...previous, cwsId: value }))}
              />

              <TextInput
                label="Process name"
                value={form.processName}
                placeholder="Fully Washed"
                onChange={(event) => setForm((previous) => ({ ...previous, processName: readInputValue(event) }))}
              />

              <TextInput
                label="Sub-process name"
                value={form.subProcessName}
                placeholder="Standard Run"
                onChange={(event) => setForm((previous) => ({ ...previous, subProcessName: readInputValue(event) }))}
              />

              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                <NumberInput label="A1 %" value={form.A1 === '' ? '' : Number(form.A1)} onChange={(value) => setForm((previous) => ({ ...previous, A1: value === '' ? '' : String(value) }))} min={0} decimalScale={3} hideControls suffix="%" />
                <NumberInput label="A2 %" value={form.A2 === '' ? '' : Number(form.A2)} onChange={(value) => setForm((previous) => ({ ...previous, A2: value === '' ? '' : String(value) }))} min={0} decimalScale={3} hideControls suffix="%" />
                <NumberInput label="A3 %" value={form.A3 === '' ? '' : Number(form.A3)} onChange={(value) => setForm((previous) => ({ ...previous, A3: value === '' ? '' : String(value) }))} min={0} decimalScale={3} hideControls suffix="%" />
                <NumberInput label="HPC %" value={form.HPC === '' ? '' : Number(form.HPC)} onChange={(value) => setForm((previous) => ({ ...previous, HPC: value === '' ? '' : String(value) }))} min={0} decimalScale={3} hideControls suffix="%" />
              </SimpleGrid>

              <Button color="coffee" leftSection={<IconPackage size={16} />} onClick={handleSubmit}>
                Add process
              </Button>
            </Stack>
          </Card>

          <Card withBorder radius="lg" p="lg" shadow="sm">
            <Stack gap="md">
              <Text fw={700} size="lg">Registered processes</Text>

              <Card withBorder radius="md" p="sm" bg="gray.0">
                <Group justify="space-between">
                  <Text fw={600}>{selectedCws?.name}</Text>
                  <Badge leftSection={<IconClipboardCheck size={12} />} color="teal" variant="light">
                    Active CWS
                  </Badge>
                </Group>
              </Card>

              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Process</Table.Th>
                    <Table.Th>Sub-process</Table.Th>
                    <Table.Th>Estimate</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {processDefinitions
                    .filter((process) => process.cwsId === form.cwsId)
                    .map((process) => (
                      <Table.Tr key={process.id}>
                        <Table.Td>{process.processName}</Table.Td>
                        <Table.Td>{process.subProcessName}</Table.Td>
                        <Table.Td>
                          A1 {process.estimates.A1}%, A2 {process.estimates.A2}%, A3 {process.estimates.A3}%, HPC {process.estimates.HPC}%
                        </Table.Td>
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
