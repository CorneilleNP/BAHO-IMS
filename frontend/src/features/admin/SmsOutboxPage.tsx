import { useState } from 'react';
import { Badge, Button, Card, Group, Modal, SegmentedControl, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { IconMessage, IconRefresh } from '@tabler/icons-react';
import { DataTable } from '../../components/DataTable';
import { EmptyState, ErrorMessage } from '../../components/Feedback';
import { PageHeader } from '../../components/PageHeader';
import { isAdmin } from '../../lib/access';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/authContext';
import { toast } from '../../lib/toast';
import type { SmsMessage, SmsStatus } from '../../lib/types';
import { query, useList } from '../../lib/useApi';
import { useSubmit } from '../../lib/useSubmit';

const URL = '/notifications/sms/';
const STATUS_COLOR: Record<SmsStatus, string> = { QUEUED: 'blue', SENT: 'teal', FAILED: 'red' };

function TestSmsModal({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const submit = useSubmit();
  const [phone, setPhone] = useState('');
  const [body, setBody] = useState('');

  const send = async () => {
    if (!phone.trim()) return submit.fail('Enter a phone number.');
    const msg = await submit.run(() => api<SmsMessage>(`${URL}test/`, { method: 'POST', body: { to_phone: phone, ...(body.trim() ? { body } : {}) } }));
    if (!msg) return;
    if (msg.status === 'FAILED') toast.error(msg.error || 'The SMS provider refused the message.', 'Test SMS failed');
    else toast.success(`Test SMS ${msg.status === 'SENT' ? 'sent' : 'queued'} to ${msg.to_phone}.`, 'Test SMS');
    onSent();
  };

  return (
    <Modal opened onClose={onClose} title="Send a test SMS">
      <Stack>
        <ErrorMessage>{submit.error}</ErrorMessage>
        <TextInput label="Phone" placeholder="07…" value={phone} onChange={(e) => setPhone(e.currentTarget.value)} data-autofocus />
        <Textarea label="Message (optional)" maxLength={160} autosize minRows={2} value={body} onChange={(e) => setBody(e.currentTarget.value)} description={`${body.length}/160`} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button onClick={send} loading={submit.saving}>Send</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** Every SMS the system tried to send (GRN confirmations to farmers), with retry for failures. */
export function SmsOutboxPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState('All');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [testing, setTesting] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const messages = useList<SmsMessage>(`${URL}${query({ status, search, page })}`);

  if (!isAdmin(user)) {
    return <EmptyState title="Administrators only">Only an administrator can see the SMS outbox.</EmptyState>;
  }

  const retry = async (msg: SmsMessage) => {
    setRetrying(msg.id);
    try {
      const result = await api<SmsMessage>(`${URL}${msg.id}/retry/`, { method: 'POST' });
      if (result.status === 'SENT') toast.success(`Sent to ${result.to_phone}.`, 'SMS sent');
      else toast.error(result.error || 'Still failing.', 'SMS not sent');
      messages.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Retry failed.');
    } finally {
      setRetrying(null);
    }
  };

  return (
    <Stack gap="lg" maw={1200}>
      <PageHeader
        eyebrow="Administration"
        title="SMS outbox"
        description="Farmers get an SMS for every GRN. Failed messages are retried automatically every 10 minutes (up to 5 tries)."
        actions={<Button variant="light" leftSection={<IconMessage size={16} />} onClick={() => setTesting(true)}>Send test SMS</Button>}
      />
      <Card p="lg">
        <Stack>
          <Group align="flex-end">
            <SegmentedControl
              value={status}
              onChange={(v) => { setStatus(v); setPage(1); }}
              data={[{ value: 'All', label: 'All' }, { value: 'QUEUED', label: 'Queued' }, { value: 'SENT', label: 'Sent' }, { value: 'FAILED', label: 'Failed' }]}
            />
            <TextInput label="Phone" placeholder="+2507…" value={search} onChange={(e) => { setSearch(e.currentTarget.value); setPage(1); }} w={200} />
          </Group>
          <DataTable
            rows={messages.items}
            rowKey={(m) => m.id}
            loading={messages.loading}
            error={messages.error}
            minWidth={950}
            empty={{ title: 'No messages yet', hint: 'Messages appear here when GRNs are recorded for farmers with a phone number.' }}
            exportName="sms-outbox"
            pagination={{ page, pageSize: 50, total: messages.total, onChange: setPage }}
            columns={[
              { key: 'created', header: 'Created', nowrap: true, render: (m) => new Date(m.created_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) },
              { key: 'to', header: 'To', mono: true, render: (m) => m.to_phone },
              { key: 'station', header: 'Station', render: (m) => m.facility_name || '—' },
              { key: 'body', header: 'Message', render: (m) => <Text size="sm" lineClamp={2}>{m.body}</Text>, exportValue: (m) => m.body },
              {
                key: 'status',
                header: 'Status',
                nowrap: true,
                exportValue: (m) => m.status,
                render: (m) => (
                  <Stack gap={2}>
                    <Badge color={STATUS_COLOR[m.status]} variant="light">{m.status.toLowerCase()}</Badge>
                    {m.error && <Text size="xs" c="red" lineClamp={2} maw={220}>{m.error}</Text>}
                  </Stack>
                ),
              },
              { key: 'attempts', header: 'Tries', align: 'right', render: (m) => m.attempts },
              {
                key: 'actions',
                header: '',
                exportValue: false,
                render: (m) =>
                  m.status === 'FAILED' && (
                    <Button size="compact-xs" variant="light" leftSection={<IconRefresh size={12} />} loading={retrying === m.id} onClick={() => retry(m)}>
                      Retry
                    </Button>
                  ),
              },
            ]}
          />
        </Stack>
      </Card>
      {testing && <TestSmsModal onClose={() => setTesting(false)} onSent={() => { setTesting(false); messages.reload(); }} />}
    </Stack>
  );
}
