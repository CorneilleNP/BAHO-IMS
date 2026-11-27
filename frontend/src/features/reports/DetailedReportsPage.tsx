import { useState, type ComponentType } from 'react';
import { Button, Card, Group, Select, SimpleGrid, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconBuildingWarehouse, IconCoffee, IconDownload, IconFileSpreadsheet, IconPlant2 } from '@tabler/icons-react';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import { PageHeader } from '../../components/PageHeader';
import { ANY_DATE, type DateRange } from '../../lib/format';
import { useMyStations } from '../../lib/stations';
import { toast } from '../../lib/toast';
import { downloadProductionReport, downloadReceptionReport } from './cwsReports';
import { downloadDryMillReport } from './drymillReports';

interface ReportCardProps {
  title: string;
  icon: ComponentType<{ size?: number }>;
  color: string;
  sheets: string[];
  run: () => Promise<number>;
}

function ReportCard({ title, icon: Icon, color, sheets, run }: ReportCardProps) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const count = await run();
      toast.success(count ? 'The Excel file is in your downloads.' : 'Nothing was recorded in this period: the file is empty.', `${title} downloaded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The report could not be prepared.', 'Download failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card padding="lg" h="100%">
      <Stack gap="sm" h="100%">
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon size={44} radius="md" variant="light" color={color}>
            <Icon size={24} />
          </ThemeIcon>
          <Text fw={700} fz="lg">{title}</Text>
        </Group>
        <Text size="sm" c="dimmed" style={{ flex: 1 }}>
          Excel workbook with: {sheets.join(' · ')}.
        </Text>
        <Group>
          <Button leftSection={<IconDownload size={16} />} onClick={download} loading={busy}>
            Download Excel
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

/**
 * Detailed reports to download (Excel), with every detail per record:
 * - CWS: cherry reception (each GRN with farmer, cherry, transport, payment) and
 *   production (lots by grade, estimate vs actual, transfers to dry mill).
 * - Dry mill: stock receipts, milling batches (inputs/outputs), export shipments.
 * The server scopes the data to the user's role and stations.
 */
export function DetailedReportsPage({ section }: { section: 'cws' | 'drymill' }) {
  const [range, setRange] = useState<DateRange>(ANY_DATE);
  const stations = useMyStations();
  const [station, setStation] = useState<string | null>(null);
  const multiStation = stations.options.length > 1;
  const stationLabel = station ? (stations.options.find((o) => o.value === station)?.label ?? '') : multiStation ? 'All stations' : (stations.options[0]?.label ?? 'My station');
  const cwsFilters = { dateFrom: range[0], dateTo: range[1], station, stationLabel };

  return (
    <Stack gap="lg" maw={1100}>
      <PageHeader
        eyebrow={section === 'cws' ? 'CWS' : 'Dry Mill'}
        title="Detailed reports"
        description="Download every record with all its details as an Excel workbook, for the period (and station) you choose."
      />

      <Card p="md">
        <Group align="flex-end" gap="sm" wrap="wrap">
          {section === 'cws' && (
            <Select
              label="CWS station"
              placeholder={stations.loading ? 'Loading…' : multiStation ? 'All stations' : 'My station'}
              data={stations.options}
              value={station}
              onChange={setStation}
              clearable
              searchable
              w={240}
            />
          )}
          <DateRangeFilter value={range} onChange={setRange} label={section === 'cws' ? 'Date' : 'Date (arrival / milling / NAEB delivery)'} />
        </Group>
        <Text size="xs" c="dimmed" mt="xs">
          <IconFileSpreadsheet size={13} style={{ verticalAlign: '-2px' }} /> Leave the dates empty for everything recorded. Large periods can take a few seconds.
        </Text>
      </Card>

      {section === 'cws' ? (
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <ReportCard
            title="Cherry reception report"
            icon={IconCoffee}
            color="baho"
            sheets={[
              'every delivery (GRN) on its own row by date, with farmer details (name, ID, phone, gender, province to village)',
              'good and float cherry kg, price and amount',
              'transport per kg and total, commission, total amount, amount paid and still owed',
              'totals per farmer (deliveries, first/last date, paid, still owed) and per day',
            ]}
            run={() => downloadReceptionReport(cwsFilters)}
          />
          <ReportCard
            title="CWS production report"
            icon={IconPlant2}
            color="green"
            sheets={[
              'every processing lot (cherry input, estimated, actual, variance, out-turn, status)',
              'each lot by grade',
              'totals by grade',
              'transfers to dry mill (bags, gross, bags weight, net, moisture)',
            ]}
            run={() => downloadProductionReport(cwsFilters)}
          />
        </SimpleGrid>
      ) : (
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <ReportCard
            title="Dry mill report"
            icon={IconBuildingWarehouse}
            color="coffee"
            sheets={[
              'every stock receipt with all Stock Update columns (weights, quality, processing, balance)',
              'milling batches with their input receipts and green grades',
              'batch inputs and outputs line by line',
              'export shipments by line (client, NAEB date, grade, kg)',
            ]}
            run={() => downloadDryMillReport({ dateFrom: range[0], dateTo: range[1] })}
          />
        </SimpleGrid>
      )}
    </Stack>
  );
}
