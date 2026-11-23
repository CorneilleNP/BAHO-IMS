import { useState } from 'react';
import { Badge, Button, Card, Divider, Drawer, Group, NumberInput, Progress, SimpleGrid, Stack, Table, Tabs, Text, TextInput, Timeline } from '@mantine/core';
import { IconCheck, IconEdit, IconHistory, IconPackage, IconScale, IconX } from '@tabler/icons-react';
import { EmptyState, ErrorMessage } from '../../components/Feedback';
import { FormSkeleton, TableSkeleton } from '../../components/Skeletons';
import { VoidButton } from '../../components/VoidButton';
import { api } from '../../lib/api';
import { confirmAction } from '../../lib/confirm';
import { kg, num } from '../../lib/format';
import { processingColor, processingLabel, qualityColor } from '../../lib/stockLabels';
import { toast } from '../../lib/toast';
import type { HistoryEntry, HqStockReceiptDetail } from '../../lib/types';
import { errorText, useApi } from '../../lib/useApi';
import { useSubmit } from '../../lib/useSubmit';


interface Props {
  receiptId: string | null;
  writable: boolean;
  onClose: () => void;
  onEdit: (receipt: HqStockReceiptDetail) => void;
  /** Something changed (quality, adjustment, void): refresh the list. */
  onChanged: () => void;
}

/** Everything about one stock receipt, where its stock went, and its change history. */
export function StockReceiptDrawer({ receiptId, writable, onClose, onEdit, onChanged }: Props) {
  const detail = useApi<HqStockReceiptDetail>(receiptId ? `/drymill/stock-receipts/${receiptId}/` : null);
  const history = useApi<HistoryEntry[]>(receiptId ? `/drymill/stock-receipts/${receiptId}/history/` : null);
  const r = detail.data;

  const refresh = () => {
    detail.reload();
    history.reload();
    onChanged();
  };

  async function setQuality(status: 'ACCEPTED' | 'REJECTED' | 'PENDING') {
    if (!r) return;
    const comment = await confirmAction({
      title: status === 'REJECTED' ? `Reject ${r.receipt_number}?` : `Mark ${r.receipt_number} as ${status.toLowerCase()}?`,
      message: status === 'ACCEPTED' ? 'Accepted coffee can be used by dry mill batches.' : 'This coffee will not be available for milling.',
      confirmLabel: status === 'REJECTED' ? 'Reject' : 'Confirm',
      danger: status === 'REJECTED',
      requireReason: status === 'REJECTED',
    });
    if (comment === null) return;
    try {
      await api('/drymill/stock-receipts/quality/', { method: 'POST', body: { ids: [r.id], quality_status: status, comment } });
      toast.success(`${r.receipt_number} is now ${status.toLowerCase()}.`, 'Quality updated');
      refresh();
    } catch (err) {
      toast.error(errorText(err), 'Could not update quality');
    }
  }

  return (
    <Drawer opened={!!receiptId} onClose={onClose} position="right" size="xl" title={r ? `Stock receipt ${r.receipt_number}` : 'Stock receipt'}>
      {detail.error ? (
        <ErrorMessage>{detail.error}</ErrorMessage>
      ) : !r ? (
        <FormSkeleton fields={8} />
      ) : (
        <Stack gap="md">
          <Group justify="space-between">
            <Group gap="xs">
              <Badge color={qualityColor[r.quality_status]} variant="light">{r.quality_status}</Badge>
              <Badge color={processingColor[r.processing_status]} variant="light">{processingLabel[r.processing_status]}</Badge>
              {r.import_batch && <Badge variant="outline" color="gray">Imported · sheet row {r.source_row}</Badge>}
            </Group>
            {writable && (
              <Group gap="xs">
                <Button size="compact-sm" variant="light" leftSection={<IconEdit size={14} />} onClick={() => onEdit(r)}>Edit</Button>
                {r.quality_status !== 'ACCEPTED' && (
                  <Button size="compact-sm" color="green" variant="light" leftSection={<IconCheck size={14} />} onClick={() => setQuality('ACCEPTED')}>Accept</Button>
                )}
                {r.quality_status !== 'REJECTED' && num(r.processed_kg) === 0 && (
                  <Button size="compact-sm" color="red" variant="light" leftSection={<IconX size={14} />} onClick={() => setQuality('REJECTED')}>Reject</Button>
                )}
                {num(r.processed_kg) === 0 && num(r.adjusted_kg) === 0 && (
                  <VoidButton path={`/drymill/stock-receipts/${r.id}/`} label={`receipt ${r.receipt_number}`} onDone={() => { onChanged(); onClose(); }} />
                )}
              </Group>
            )}
          </Group>

          <StockPosition r={r} />

          <Tabs defaultValue="details">
            <Tabs.List>
              <Tabs.Tab value="details">Details</Tabs.Tab>
              <Tabs.Tab value="stock" leftSection={<IconPackage size={14} />}>Stock movements</Tabs.Tab>
              <Tabs.Tab value="history" leftSection={<IconHistory size={14} />}>History</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="details" pt="md">
              <Section title="Source & arrival" rows={[
                ['Arrival date', r.arrival_date],
                ['Source', r.source_name],
                ['Origin', r.origin_type === 'OWN_CWS' ? 'Baho' : 'Partner'],
                ['Type', r.item_type === 'PARCH' ? 'Parchment' : 'Green'],
                ['As written in the sheet', r.source_raw],
              ]} />
              <Section title="Coffee" rows={[
                ['Process', r.process_name || 'Not assigned yet'],
                ['Sub-process', r.sub_process_name],
                ['Recorded as', r.process_raw],
                ['Grade', r.grade],
                ['Lot ID', r.lot_reference],
              ]} />
              <Section title="Weighing" rows={[
                ['Delivery note', [r.delivery_note_no, r.delivery_note_qty_kg ? `${kg(r.delivery_note_qty_kg)} kg` : ''].filter(Boolean).join(' · ')],
                ['Weighing status', r.weighing_status === 'DONE' ? 'Done' : 'Pending'],
                ['Gross weight', r.gross_weight_kg ? `${kg(r.gross_weight_kg)} kg` : ''],
                ['Net weight', `${kg(r.net_weight_kg)} kg`],
                ['Bags', [r.number_of_bags ? `${r.number_of_bags} bags` : '', r.tare_per_bag_kg ? `${r.tare_per_bag_kg} kg tare` : '', `${kg(r.weight_of_bags_kg, 2)} kg`].filter(Boolean).join(' · ')],
                ['Variance vs delivery note', r.variance_kg === null ? '' : `${kg(r.variance_kg, 2)} kg`],
              ]} />
              <Section title="Documents & storage" rows={[
                ['Purchase contract', r.purchase_contract_number],
                ['WRN', r.wrn_number],
                ['Warehouse cell', r.warehouse_cell],
                ['Stock card', r.stock_card_number],
              ]} />
              <Section title="Quality" rows={[
                ['Status', r.quality_status],
                ['Comment', r.quality_comment],
              ]} />
              <Text size="xs" c="dimmed" mt="sm">
                Created {new Date(r.created_at).toLocaleString()} {r.created_by_name && `by ${r.created_by_name}`} · updated {new Date(r.updated_at).toLocaleString()}
                {r.updated_by_name && ` by ${r.updated_by_name}`}
              </Text>
            </Tabs.Panel>

            <Tabs.Panel value="stock" pt="md">
              <Stack gap="md">
                <Text fw={600} size="sm">Dry mill batches that used this receipt</Text>
                {r.movements.length === 0 ? (
                  <Text size="sm" c="dimmed">Not milled yet.</Text>
                ) : (
                  <Table striped>
                    <Table.Thead>
                      <Table.Tr><Table.Th>Batch</Table.Th><Table.Th>Date</Table.Th><Table.Th ta="right">Taken (kg)</Table.Th></Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {r.movements.map((m) => (
                        <Table.Tr key={m.batch}><Table.Td ff="monospace">{m.batch_no}</Table.Td><Table.Td>{m.processing_date}</Table.Td><Table.Td ta="right">{kg(m.qty_kg)}</Table.Td></Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                )}
                <Divider />
                <Text fw={600} size="sm">Stock adjustments</Text>
                {r.adjustments.length === 0 ? (
                  <Text size="sm" c="dimmed">No adjustments.</Text>
                ) : (
                  <Table striped>
                    <Table.Thead>
                      <Table.Tr><Table.Th>Date</Table.Th><Table.Th ta="right">kg</Table.Th><Table.Th>Reason</Table.Th><Table.Th>By</Table.Th></Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {r.adjustments.map((a) => (
                        <Table.Tr key={a.id}><Table.Td>{a.adjusted_on}</Table.Td><Table.Td ta="right" c={num(a.qty_kg) < 0 ? 'red' : 'teal'}>{kg(a.qty_kg, 2)}</Table.Td><Table.Td>{a.reason}</Table.Td><Table.Td>{a.created_by_name || '—'}</Table.Td></Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                )}
                {writable && <AdjustForm receiptId={r.id} balance={num(r.stock_balance_kg)} onDone={refresh} />}
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="history" pt="md">
              {history.loading && !history.data ? (
                <TableSkeleton rows={3} columns={2} />
              ) : !history.data?.length ? (
                <EmptyState title="No history yet" />
              ) : (
                <Timeline bulletSize={18} lineWidth={2}>
                  {history.data.map((entry, i) => (
                    <Timeline.Item key={i} title={`${entry.type.charAt(0).toUpperCase()}${entry.type.slice(1)} by ${entry.user}`}>
                      <Text size="xs" c="dimmed">{new Date(entry.date).toLocaleString()}</Text>
                      {entry.changes.map((c, j) => (
                        <Text key={j} size="sm">
                          <strong>{c.field}</strong>: {String(c.old ?? '—') || '—'} → {String(c.new ?? '—') || '—'}
                        </Text>
                      ))}
                    </Timeline.Item>
                  ))}
                </Timeline>
              )}
            </Tabs.Panel>
          </Tabs>
        </Stack>
      )}
    </Drawer>
  );
}

function StockPosition({ r }: { r: HqStockReceiptDetail }) {
  const pure = num(r.pure_weight_kg);
  const used = pure - num(r.stock_balance_kg);
  return (
    <Card p="md">
      <Group gap="xs" mb="xs">
        <IconScale size={16} />
        <Text fw={600} size="sm">Stock position</Text>
      </Group>
      <SimpleGrid cols={{ base: 2, sm: 4 }} mb="sm">
        <Fig label="Pure weight" value={`${kg(pure)} kg`} />
        <Fig label="Milled" value={`${kg(r.processed_kg)} kg`} />
        <Fig label="Adjusted" value={`${kg(r.adjusted_kg)} kg`} />
        <Fig label="Balance" value={`${kg(r.stock_balance_kg)} kg`} strong />
      </SimpleGrid>
      <Progress value={pure > 0 ? Math.min(100, (used / pure) * 100) : 0} color="coffee" size="sm" />
      {r.processing_date && <Text size="xs" c="dimmed" mt={6}>First milled on {r.processing_date}</Text>}
    </Card>
  );
}

function AdjustForm({ receiptId, balance, onDone }: { receiptId: string; balance: number; onDone: () => void }) {
  const [qty, setQty] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const submit = useSubmit();
  async function save() {
    if (qty === '' || qty === 0) return submit.fail('Enter the quantity (negative to remove stock).');
    if (!reason.trim()) return submit.fail('Explain the adjustment.');
    const ok = await submit.run(() => api(`/drymill/stock-receipts/${receiptId}/adjust/`, { method: 'POST', body: { qty_kg: qty, reason } }));
    if (ok === undefined) return;
    toast.success(`${qty > 0 ? '+' : ''}${kg(qty, 2)} kg recorded.`, 'Stock adjusted');
    setQty('');
    setReason('');
    onDone();
  }
  return (
    <Card p="sm" bg="gray.0">
      <Text fw={600} size="sm" mb="xs">Adjust stock</Text>
      <Group align="flex-end" gap="xs" wrap="wrap">
        <NumberInput label="Quantity (kg)" description={`Balance now ${kg(balance, 2)} kg · negative removes`} value={qty} onChange={(v) => setQty(v === '' ? '' : Number(v))} hideControls w={200} />
        <TextInput label="Reason" placeholder="e.g. moisture loss after recount" value={reason} onChange={(e) => setReason(e.currentTarget.value)} style={{ flex: 1, minWidth: 200 }} />
        <Button onClick={save} loading={submit.saving}>Record</Button>
      </Group>
      <ErrorMessage>{submit.error}</ErrorMessage>
    </Card>
  );
}

function Section({ title, rows }: { title: string; rows: Array<[string, string | number | null | undefined]> }) {
  const shown = rows.filter(([, v]) => v !== '' && v !== null && v !== undefined);
  return (
    <Stack gap={4} mb="md">
      <Text fw={700} size="xs" tt="uppercase" c="dimmed">{title}</Text>
      {shown.length === 0 ? (
        <Text size="sm" c="dimmed">—</Text>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={4} verticalSpacing={4}>
          {shown.map(([label, value]) => (
            <Group key={label} gap={6} wrap="nowrap" align="baseline">
              <Text size="sm" c="dimmed" miw={150}>{label}</Text>
              <Text size="sm" fw={500}>{value}</Text>
            </Group>
          ))}
        </SimpleGrid>
      )}
    </Stack>
  );
}

function Fig({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text fw={strong ? 800 : 600} size={strong ? 'lg' : 'sm'}>{value}</Text>
    </div>
  );
}
