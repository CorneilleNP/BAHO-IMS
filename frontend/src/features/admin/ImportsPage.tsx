import { useState } from 'react';
import { Alert, Badge, Button, Card, FileInput, Group, List, NumberInput, Select, SimpleGrid, Stack, Table, Text } from '@mantine/core';
import { IconFileUpload } from '@tabler/icons-react';
import { EmptyState, ErrorMessage } from '../../components/Feedback';
import { KpiCard } from '../../components/KpiCard';
import { PageHeader } from '../../components/PageHeader';
import { isAdmin } from '../../lib/access';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/authContext';
import { kg } from '../../lib/format';
import { toast } from '../../lib/toast';
import type { Facility, Paginated } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { useSubmit } from '../../lib/useSubmit';

interface ImportReport {
  source: string;
  station: string;
  committed: boolean;
  rows_read: number;
  skipped_empty: number;
  already_imported: number;
  created: number;
  farmers_created: number;
  farmers_matched: number;
  good_kg: string;
  float_kg: string;
  errors: Array<{ row: number; reason: string }>;
  warnings: Array<{ row: number; message: string }>;
}

const COLUMNS = 'A Date · B Farmer · C Phone · D Email · E Sector · F Cell · G Village · H GRN · I–L Good qty/price/transport/commission · M–P Float qty/price/transport/commission · Q Total qty · R Total amount · S Paid · T Not paid';

/** Load a station's old "CHERRY RECEIVED" Excel sheet (saved as CSV): dry run first, then import. */
export function ImportsPage() {
  const { user } = useAuth();
  const stations = useApi<Paginated<Facility>>('/organization/facilities/?facility_type=CWS&is_active=true&page_size=500&ordering=name');
  const submit = useSubmit();
  const [file, setFile] = useState<File | null>(null);
  const [station, setStation] = useState<string | null>(null);
  const [headerRows, setHeaderRows] = useState<number | string>(4);
  const [report, setReport] = useState<ImportReport | null>(null);

  if (!isAdmin(user)) {
    return <EmptyState title="Administrators only">Only an administrator can import old spreadsheets.</EmptyState>;
  }

  const run = async (commit: boolean) => {
    if (!file) return submit.fail('Choose the CSV file.');
    if (!station) return submit.fail('Choose the station the sheet belongs to.');
    const form = new FormData();
    form.append('file', file);
    form.append('station', station);
    form.append('commit', commit ? 'true' : 'false');
    form.append('header_rows', String(headerRows || 0));
    const result = await submit.run(() => api<ImportReport>('/imports/cherry-receipts/', { method: 'POST', body: form }));
    if (!result) return;
    setReport(result);
    if (commit) toast.success(`${result.created} GRNs and ${result.farmers_created} new farmers imported.`, 'Import finished');
  };

  return (
    <Stack gap="lg" maw={1100}>
      <PageHeader
        eyebrow="Administration"
        title="Import cherry receipts"
        description="Bring a station's old CHERRY RECEIVED sheet into the system. Always check the dry run first; importing the same file twice never duplicates GRNs."
      />
      <Card withBorder radius="md" p="lg">
        <Stack>
          <ErrorMessage>{submit.error}</ErrorMessage>
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <FileInput
              label="Sheet (CSV)"
              description="In Excel: File › Save as › CSV UTF-8"
              accept=".csv,text/csv"
              leftSection={<IconFileUpload size={16} />}
              value={file}
              onChange={(f) => { setFile(f); setReport(null); }}
              clearable
            />
            <Select
              label="Station"
              data={(stations.data?.results ?? []).map((s) => ({ value: s.code, label: s.name }))}
              value={station}
              onChange={(v) => { setStation(v); setReport(null); }}
              searchable
            />
            <NumberInput label="Title rows above the data" value={headerRows} onChange={setHeaderRows} min={0} max={20} allowDecimal={false} />
          </SimpleGrid>
          <Text size="xs" c="dimmed">Columns are read by position: {COLUMNS}</Text>
          <Group justify="flex-end">
            <Button variant="light" onClick={() => run(false)} loading={submit.saving}>Dry run</Button>
            <Button onClick={() => run(true)} loading={submit.saving} disabled={!report || report.committed || report.created === 0}>
              Import
            </Button>
          </Group>
        </Stack>
      </Card>

      {report && (
        <Stack>
          <Alert color={report.committed ? 'teal' : 'blue'} variant="light">
            {report.committed
              ? `Imported into ${report.station}. The numbers below were written to the database.`
              : `Dry run for ${report.station}: nothing was saved. Check the errors and warnings, then press Import.`}
          </Alert>
          <SimpleGrid cols={{ base: 2, md: 4 }}>
            <KpiCard label={report.committed ? 'GRNs created' : 'GRNs to create'} value={String(report.created)} />
            <KpiCard label="New farmers" value={String(report.farmers_created)} />
            <KpiCard label="Good cherry" value={`${kg(report.good_kg)} kg`} />
            <KpiCard label="Float cherry" value={`${kg(report.float_kg)} kg`} />
          </SimpleGrid>
          <Text size="sm" c="dimmed">
            {report.rows_read} rows read · {report.already_imported} already imported · {report.skipped_empty} empty · {report.farmers_matched} rows for known farmers
          </Text>
          {report.errors.length > 0 && (
            <Card withBorder radius="md" p="lg">
              <Group mb="sm"><Text fw={700}>Rows not imported</Text><Badge color="red" variant="light">{report.errors.length}</Badge></Group>
              <Table.ScrollContainer minWidth={500}>
                <Table striped>
                  <Table.Thead><Table.Tr><Table.Th>Row</Table.Th><Table.Th>Reason</Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody>
                    {report.errors.map((e) => (
                      <Table.Tr key={`${e.row}-${e.reason}`}><Table.Td>{e.row}</Table.Td><Table.Td>{e.reason}</Table.Td></Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </Card>
          )}
          {report.warnings.length > 0 && (
            <Card withBorder radius="md" p="lg">
              <Group mb="sm"><Text fw={700}>Warnings</Text><Badge color="yellow" variant="light">{report.warnings.length}</Badge></Group>
              <List size="sm" spacing={4}>
                {report.warnings.map((w) => (
                  <List.Item key={`${w.row}-${w.message}`}>Row {w.row}: {w.message}</List.Item>
                ))}
              </List>
            </Card>
          )}
        </Stack>
      )}
    </Stack>
  );
}
