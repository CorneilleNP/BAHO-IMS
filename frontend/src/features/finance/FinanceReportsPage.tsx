import { useState } from 'react';
import { Button, Card, Group, Stack, Text } from '@mantine/core';
import { IconFileSpreadsheet, IconFileTypePdf } from '@tabler/icons-react';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import { PageHeader } from '../../components/PageHeader';
import { useAuth } from '../../lib/authContext';
import { ANY_DATE, type DateRange } from '../../lib/format';
import { useMyStations } from '../../lib/stations';
import { toast } from '../../lib/toast';
import { errorText } from '../../lib/useApi';
import { downloadFinanceExcel, downloadFinancePdf, loadFinanceReport, type FinanceReportFilters } from './financeReport';
import { StationFilter } from './financeShared';
import { isFinanceAdmin } from './financeUtils';

/**
 * Finance report per CWS (PDF or Excel): opening balance, funds received,
 * spending by category, by month, and the full cash book with a running
 * balance. HQ may also take every station together.
 */
export function FinanceReportsPage() {
  const { user } = useAuth();
  const hq = isFinanceAdmin(user);
  const stations = useMyStations();
  const [station, setStation] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange>(ANY_DATE);
  const [busy, setBusy] = useState<'pdf' | 'excel' | null>(null);
  const single = stations.options.length === 1 ? stations.options[0].value : null;
  const chosen = station ?? single;
  const allowAll = hq && stations.options.length > 1;
  const ready = Boolean(chosen) || allowAll;

  async function download(kind: 'pdf' | 'excel') {
    const picked = stations.stations.find((s) => s.id === chosen);
    const filters: FinanceReportFilters = {
      station: chosen,
      stationLabel: picked?.name ?? 'All stations',
      stationCode: picked?.code ?? 'all',
      dateFrom: range[0],
      dateTo: range[1],
    };
    setBusy(kind);
    try {
      const data = await loadFinanceReport(filters);
      if (kind === 'pdf') await downloadFinancePdf(filters, data);
      else await downloadFinanceExcel(filters, data);
      toast.success('The file is in your downloads.', 'Finance report downloaded');
    } catch (err) {
      toast.error(errorText(err), 'Download failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Stack gap="lg" maw={1000}>
      <PageHeader
        eyebrow="Finance"
        title="Finance reports"
        description="For one CWS and a period: opening balance, funds received, what was spent by category (expenses, cherry, casual labor), closing balance and every movement."
      />
      <Card p="md">
        <Group align="flex-end" gap="sm" wrap="wrap">
          <StationFilter value={station} onChange={setStation} allowAll={allowAll} label={allowAll ? 'CWS station (empty = all stations)' : 'CWS station'} w={280} />
          <DateRangeFilter value={range} onChange={setRange} label="Period" />
        </Group>
        <Text size="xs" c="dimmed" mt="xs">Leave the dates empty for everything since the beginning.</Text>
      </Card>
      <Card p="lg">
        <Stack gap="sm">
          <Text fw={700} fz="lg">Station finance report</Text>
          <Text size="sm" c="dimmed">
            Summary (opening balance, funds received, spent, closing balance, still owed to farmers) · spending by category · by month ·
            cash book with running balance.
          </Text>
          {!ready && <Text size="sm" c="orange.8">Choose a station first.</Text>}
          <Group>
            <Button leftSection={<IconFileTypePdf size={16} />} onClick={() => download('pdf')} loading={busy === 'pdf'} disabled={!ready || busy !== null}>
              Download PDF
            </Button>
            <Button variant="light" leftSection={<IconFileSpreadsheet size={16} />} onClick={() => download('excel')} loading={busy === 'excel'} disabled={!ready || busy !== null}>
              Download Excel
            </Button>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}
