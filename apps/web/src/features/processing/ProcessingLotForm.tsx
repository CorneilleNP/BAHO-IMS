import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, Container, Group, NumberInput, Select, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { calculateEstimate, calculateOutturnPct } from '@baho/shared-types';
import { defaultCwsRegistry } from '../cws/CwsRegistryPage';
import type { ProcessDefinition } from '../cws/ProcessOnCwsPage';

interface ProcessingLotFormProps {
  processDefinitions?: ProcessDefinition[];
}

const productOrder = ['A1', 'A2', 'A3', 'HPC'] as const;

export function ProcessingLotForm({ processDefinitions = [] }: ProcessingLotFormProps) {
  const [selectedCwsId, setSelectedCwsId] = useState(defaultCwsRegistry[0].id);
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);
  const [lotCode, setLotCode] = useState('');
  const [cherryInputKg, setCherryInputKg] = useState<number | ''>('');
  const [actuals, setActuals] = useState<Record<string, number | ''>>({});

  const availableProcesses = useMemo(
    () => processDefinitions.filter((process) => process.cwsId === selectedCwsId),
    [processDefinitions, selectedCwsId],
  );

  useEffect(() => {
    if (!availableProcesses.length) {
      setSelectedProcessId(null);
      return;
    }

    if (!selectedProcessId || !availableProcesses.some((process) => process.id === selectedProcessId)) {
      setSelectedProcessId(availableProcesses[0].id);
    }
  }, [availableProcesses, selectedProcessId]);

  const selectedProcess = availableProcesses.find((process) => process.id === selectedProcessId) ?? availableProcesses[0];
  const estimateRows = useMemo(() => {
    if (!selectedProcess) return [];

    return productOrder.map((product) => {
      const percentValue = selectedProcess.estimates[product] ?? 0;
      const ratio = percentValue / 100;
      const estimated = calculateEstimate(Number(cherryInputKg) || 0, ratio);
      const actualQty = Number(actuals[product]) || 0;

      return {
        product,
        percent: percentValue,
        ratio,
        estimated,
        actualQty,
        outturn: calculateOutturnPct(actualQty, Number(cherryInputKg) || 0),
      };
    });
  }, [actuals, cherryInputKg, selectedProcess]);

  const totalRatio = selectedProcess
    ? productOrder.reduce((sum, product) => sum + ((selectedProcess.estimates[product] ?? 0) / 100), 0)
    : 0;

  const cherryInput = Number(cherryInputKg) || 0;

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <div>
          <Text c="gray.6" fw={700} tt="uppercase" size="xs">
            CWS operations
          </Text>
          <Title order={1} size={32} fw={800} c="#1d2f2a">
            New processing lot
          </Title>
        </div>

        <Card withBorder radius="lg" p="lg" shadow="sm">
          <Stack gap="md">
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <Select
                label="CWS"
                data={defaultCwsRegistry.map((cws) => ({ value: cws.id, label: cws.name }))}
                value={selectedCwsId}
                onChange={(value) => value && setSelectedCwsId(value)}
              />

              <Select
                label="Registered process"
                data={availableProcesses.map((process) => ({
                  value: process.id,
                  label: `${process.processName} / ${process.subProcessName}`,
                }))}
                value={selectedProcessId}
                disabled={!availableProcesses.length}
                onChange={(value) => setSelectedProcessId(value)}
                placeholder={availableProcesses.length ? 'Select process' : 'No process registered'}
              />
            </SimpleGrid>

            <TextInput
              label="Lot code"
              value={lotCode}
              placeholder="e.g. GTK-FW-014"
              onChange={(event) => setLotCode(event.currentTarget.value)}
            />

            <NumberInput
              label="Cherry input (kg)"
              value={cherryInputKg}
              onChange={(value) => setCherryInputKg(value === '' ? '' : Number(value))}
              min={0}
              placeholder="10422"
            />

            {selectedProcess ? (
              <>
                <Text size="sm" c="dimmed">
                  Selected process: <strong>{selectedProcess.processName}</strong> / <strong>{selectedProcess.subProcessName}</strong>
                </Text>
                <Text size="sm" c="dimmed">
                  Overall estimate ratio: <strong>{(totalRatio * 100).toFixed(1)}%</strong>
                </Text>
              </>
            ) : (
              <Text size="sm" c="dimmed">
                No processes are registered for this CWS yet. Add one in the process registry first.
              </Text>
            )}
          </Stack>
        </Card>

        {selectedProcess && (
          <Card withBorder radius="lg" p="lg" shadow="sm">
            <Stack gap="md">
              <Text fw={700} size="lg">Estimate on tables (live)</Text>

              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Grade</Table.Th>
                    <Table.Th>Estimate ratio</Table.Th>
                    <Table.Th>Estimated qty (kg)</Table.Th>
                    <Table.Th>Actual qty (kg)</Table.Th>
                    <Table.Th>Out-turn %</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {estimateRows.map((row) => (
                    <Table.Tr key={row.product}>
                      <Table.Td>{row.product}</Table.Td>
                      <Table.Td>{row.percent.toFixed(1)}%</Table.Td>
                      <Table.Td>{row.estimated.toFixed(2)}</Table.Td>
                      <Table.Td>
                        <NumberInput
                          value={actuals[row.product] ?? ''}
                          onChange={(value) => setActuals((previous) => ({ ...previous, [row.product]: value === '' ? '' : Number(value) }))}
                          min={0}
                          hideControls
                          style={{ maxWidth: 120 }}
                        />
                      </Table.Td>
                      <Table.Td>
                        {row.actualQty > 0 && cherryInput > 0 ? `${row.outturn.toFixed(2)}%` : '—'}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Stack>
          </Card>
        )}

        <Group justify="space-between">
          <Badge color="coffee" variant="light">
            {lotCode || 'Lot not saved yet'}
          </Badge>
          <Button color="coffee" disabled={!selectedProcess}>
            Save process lot
          </Button>
        </Group>
      </Stack>
    </Container>
  );
}
