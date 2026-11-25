import { Badge, Button, Drawer, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconClipboardCheck } from '@tabler/icons-react';
import { DataTable } from '../../components/DataTable';
import { ErrorMessage } from '../../components/Feedback';
import { FormSkeleton } from '../../components/Skeletons';
import { kg, pct } from '../../lib/format';
import type { ReactNode } from 'react';
import { VarianceKg, VariancePct, type LotWithVariance } from './variance';

interface Props {
  lotId: string | null;
  /** The page's useApi state for `/processing/lots/<lotId>/` (it reloads it after saving actuals). */
  detail: { data: LotWithVariance | null; error: string | null };
  statusBadge: (lot: LotWithVariance) => ReactNode;
  /** Set when the user may record actuals on this lot. */
  onRecordActuals?: (lot: LotWithVariance) => void;
  onClose: () => void;
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{label}</Text>
      <Text fw={700} component="div">{children}</Text>
    </div>
  );
}

/** One lot: per-grade estimate vs actual with variance (gain green, loss red), totals and out-turn. */
export function LotDetailDrawer({ lotId, detail, statusBadge, onRecordActuals, onClose }: Props) {
  const lot = detail.data && detail.data.id === lotId ? detail.data : null;

  return (
    <Drawer opened={!!lotId} onClose={onClose} position="right" size="xl" title={lot ? `Lot ${lot.lot_number}` : 'Processing lot'}>
      {detail.error ? (
        <ErrorMessage>{detail.error}</ErrorMessage>
      ) : !lot ? (
        <FormSkeleton />
      ) : (
        <Stack gap="lg">
          <Group justify="space-between" align="flex-start">
            <div>
              <Text fw={600}>{lot.process_label}</Text>
              <Text size="sm" c="dimmed">{lot.facility_name} · {lot.lot_date}</Text>
            </div>
            {statusBadge(lot)}
          </Group>

          <SimpleGrid cols={{ base: 2, sm: 4 }}>
            <Stat label="Cherry input">{kg(lot.cherry_input_kg)} kg</Stat>
            <Stat label="Estimated">{kg(lot.total_estimated_kg, 2)} kg</Stat>
            <Stat label="Actual">{lot.total_actual_kg === null ? '—' : `${kg(lot.total_actual_kg, 2)} kg`}</Stat>
            <Stat label="Out-turn">{lot.total_outturn_pct === null ? '—' : pct(lot.total_outturn_pct, 2)}</Stat>
          </SimpleGrid>

          <div>
            <Text fw={600} mb={4}>Estimate vs actual by grade</Text>
            <Text size="xs" c="dimmed" mb="sm">
              Variance = actual − estimated, as a % of the estimate. Green is a gain, red a loss. Totals compare only grades with an actual recorded
              {lot.variance.compared_estimated_kg !== null && ` (estimate ${kg(lot.variance.compared_estimated_kg, 2)} kg)`}.
            </Text>
            <DataTable
              rows={lot.results}
              rowKey={(r) => r.grade}
              minWidth={620}
              empty={{ title: 'No grades on this lot' }}
              exportName={`lot-${lot.lot_number}-variance`}
              columns={[
                { key: 'grade', header: 'Grade', render: (r) => <Text fw={600} size="sm">{r.grade_name}</Text>, exportValue: (r) => r.grade_name, footer: 'Total' },
                { key: 'est', header: 'Estimated (kg)', align: 'right', nowrap: true, render: (r) => kg(r.estimated_kg, 2), exportValue: (r) => r.estimated_kg, footer: kg(lot.total_estimated_kg, 2) },
                {
                  key: 'act',
                  header: 'Actual (kg)',
                  align: 'right',
                  nowrap: true,
                  render: (r) => (r.actual_kg === null ? '—' : kg(r.actual_kg, 2)),
                  exportValue: (r) => r.actual_kg,
                  footer: lot.total_actual_kg === null ? '—' : kg(lot.total_actual_kg, 2),
                },
                {
                  key: 'var',
                  header: 'Variance (kg)',
                  align: 'right',
                  render: (r) => <VarianceKg value={r.variance_kg} />,
                  exportValue: (r) => r.variance_kg,
                  footer: <VarianceKg value={lot.variance.variance_kg} fw={700} />,
                },
                {
                  key: 'varpct',
                  header: 'Variance %',
                  align: 'right',
                  render: (r) => <VariancePct value={r.variance_pct} />,
                  exportValue: (r) => r.variance_pct,
                  footer: <VariancePct value={lot.variance.variance_pct} fw={700} />,
                },
                {
                  key: 'out',
                  header: 'Out-turn %',
                  align: 'right',
                  nowrap: true,
                  render: (r) => (r.outturn_pct === null ? '—' : pct(r.outturn_pct, 2)),
                  exportValue: (r) => r.outturn_pct,
                  footer: lot.total_outturn_pct === null ? '—' : pct(lot.total_outturn_pct, 2),
                },
              ]}
            />
          </div>

          {lot.total_actual_kg === null && (
            <Badge variant="light" color="gray" style={{ alignSelf: 'flex-start' }}>Awaiting actuals: no variance yet</Badge>
          )}
          {lot.notes && <Text size="sm" c="dimmed">Notes: {lot.notes}</Text>}

          {onRecordActuals && lot.status !== 'CLOSED' && (
            <Button variant="light" leftSection={<IconClipboardCheck size={16} />} onClick={() => onRecordActuals(lot)} style={{ alignSelf: 'flex-start' }}>
              Record actuals
            </Button>
          )}
        </Stack>
      )}
    </Drawer>
  );
}
