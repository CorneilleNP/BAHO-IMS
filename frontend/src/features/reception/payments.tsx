import { useState } from 'react';
import { Alert, Badge, Button, Group, Modal, NumberInput, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { IconCash, IconLock } from '@tabler/icons-react';
import { DataTable } from '../../components/DataTable';
import { ErrorMessage } from '../../components/Feedback';
import { VoidButton } from '../../components/VoidButton';
import { api } from '../../lib/api';
import { num, rwf, today } from '../../lib/format';
import { toast } from '../../lib/toast';
import type { CherryPayment, CherryReceipt, PaymentMethod, PaymentStatus } from '../../lib/types';
import { query, useList } from '../../lib/useApi';
import { useSubmit } from '../../lib/useSubmit';
import { METHOD_LABEL, PAYMENT_COLOR, PAYMENT_LABEL } from './paymentLabels';

const METHODS = Object.entries(METHOD_LABEL).map(([value, label]) => ({ value, label }));

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge color={PAYMENT_COLOR[status]} variant="light" styles={{ root: { minWidth: 'max-content' } }}>
      {PAYMENT_LABEL[status]}
    </Badge>
  );
}

function Figure({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{label}</Text>
      <Text fw={700} c={color}>{value}</Text>
    </div>
  );
}

/**
 * Pay (part of) what the farmer is still owed on a GRN, and see its payments.
 * Only the payment is recorded: the GRN's cherry, prices and quantities never
 * change here. Administrators can delete a payment entered by mistake.
 */
export function PaymentModal({
  receipt,
  canPay,
  isAdmin,
  onClose,
  onChanged,
}: {
  receipt: CherryReceipt;
  canPay: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onChanged: (receipt: CherryReceipt) => void;
}) {
  const [current, setCurrent] = useState(receipt);
  const balance = num(current.balance);
  const [amount, setAmount] = useState<number | ''>(balance);
  const [method, setMethod] = useState<Exclude<PaymentMethod, ''>>((current.payment_method || 'CASH') as Exclude<PaymentMethod, ''>);
  const [paidOn, setPaidOn] = useState(today());
  const [reference, setReference] = useState('');
  const payments = useList<CherryPayment>(`/reception/payments/${query({ receipt: current.id, ordering: 'paid_on' })}`);
  const submit = useSubmit();

  const update = (next: CherryReceipt) => {
    setCurrent(next);
    setAmount(num(next.balance));
    payments.reload();
    onChanged(next);
  };

  async function pay() {
    const next = await submit.run(() =>
      api<CherryReceipt>(`/reception/receipts/${current.id}/pay/`, {
        method: 'POST',
        body: { amount: num(amount), method, paid_on: paidOn, reference },
      }),
    );
    if (!next) return;
    toast.success(
      num(next.balance) > 0
        ? `${rwf(amount)} paid to ${next.farmer_name}. Still owed: ${rwf(next.balance)}.`
        : `${next.farmer_name} is fully paid for ${next.grn_number}.`,
      'Payment recorded',
    );
    setReference('');
    update(next);
  }

  return (
    <Modal opened onClose={onClose} title={`Payment · ${current.grn_number}`} size="lg">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <div>
            <Text fw={600}>{current.farmer_name}</Text>
            <Text size="sm" c="dimmed">{current.farmer_code} · received {current.received_on}</Text>
          </div>
          <PaymentBadge status={current.payment_status} />
        </Group>
        <SimpleGrid cols={3}>
          <Figure label="Total due" value={rwf(current.total_amount)} />
          <Figure label="Paid" value={rwf(current.amount_paid)} color="teal.8" />
          <Figure label="Still owed" value={rwf(current.balance)} color={balance > 0 ? 'red.7' : undefined} />
        </SimpleGrid>

        {canPay && balance > 0 && (
          <Stack gap="xs" p="md" style={{ border: '1px solid var(--baho-border)', borderRadius: 12 }}>
            <Text fw={600}>Record a payment</Text>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <NumberInput
                label="Amount paid now (RWF)"
                value={amount}
                onChange={(v) => setAmount(v === '' ? '' : Number(v))}
                min={0}
                max={balance}
                thousandSeparator=","
                hideControls
                description={num(amount) < balance && num(amount) > 0 ? `Still owed after this: ${rwf(balance - num(amount))}` : 'The full balance'}
              />
              <Select label="Paid by" data={METHODS} value={method} onChange={(v) => setMethod((v ?? 'CASH') as typeof method)} allowDeselect={false} />
              <TextInput label="Date paid" type="date" value={paidOn} onChange={(e) => setPaidOn(e.currentTarget.value)} />
              <TextInput label="Reference (bank / MoMo)" value={reference} onChange={(e) => setReference(e.currentTarget.value)} placeholder="Optional" />
            </SimpleGrid>
            <ErrorMessage>{submit.error}</ErrorMessage>
            <Group justify="flex-end">
              <Button leftSection={<IconCash size={16} />} onClick={pay} loading={submit.saving} disabled={num(amount) <= 0 || num(amount) > balance}>
                {num(amount) >= balance ? 'Pay in full' : 'Record partial payment'}
              </Button>
            </Group>
          </Stack>
        )}

        <Alert variant="light" color="gray" icon={<IconLock size={16} />} p="xs">
          Only the payment is recorded here. The GRN&apos;s cherry, quantities and prices can only be corrected by an administrator.
        </Alert>

        <div>
          <Text fw={600} mb={6}>Payments</Text>
          <DataTable
            rows={payments.items}
            rowKey={(p) => p.id}
            loading={payments.loading}
            error={payments.error}
            empty={{ title: 'No payment yet' }}
            columns={[
              { key: 'date', header: 'Date', nowrap: true, render: (p) => p.paid_on },
              { key: 'amount', header: 'Amount', align: 'right', render: (p) => rwf(p.amount), exportValue: (p) => p.amount },
              { key: 'method', header: 'Paid by', render: (p) => METHOD_LABEL[p.method] ?? p.method },
              { key: 'ref', header: 'Reference', render: (p) => p.reference || '—' },
              { key: 'by', header: 'Recorded by', render: (p) => p.created_by_name },
              isAdmin && {
                key: 'void',
                header: '',
                exportValue: false,
                render: (p) => (
                  <VoidButton
                    path={`/reception/payments/${p.id}/`}
                    label={`payment of ${rwf(p.amount)}`}
                    onDone={() => void api<CherryReceipt>(`/reception/receipts/${current.id}/`).then(update)}
                  />
                ),
              },
            ]}
          />
        </div>
      </Stack>
    </Modal>
  );
}
