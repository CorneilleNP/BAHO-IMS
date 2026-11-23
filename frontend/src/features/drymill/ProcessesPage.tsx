import { useMemo, useState } from 'react';
import { Badge, Button, Card, Group, Modal, Select, SimpleGrid, Stack, Switch, Tabs, Text, TextInput, Tooltip } from '@mantine/core';
import { IconArrowMerge, IconBulb, IconCheck, IconEdit, IconPlus, IconSearch } from '@tabler/icons-react';
import { DataTable } from '../../components/DataTable';
import { ErrorMessage } from '../../components/Feedback';
import { KpiCard } from '../../components/KpiCard';
import { PageHeader } from '../../components/PageHeader';
import { api } from '../../lib/api';
import { canWrite } from '../../lib/access';
import { useAuth } from '../../lib/authContext';
import { confirmAction } from '../../lib/confirm';
import { kg } from '../../lib/format';
import { toast } from '../../lib/toast';
import type { CatalogProcess, CatalogSubProcess } from '../../lib/types';
import { errorText, query, useApi } from '../../lib/useApi';
import { useSubmit } from '../../lib/useSubmit';

const UNASSIGNED = 'unassigned';

/**
 * The five processes and their sub-processes. Select sub-processes (e.g. the
 * labels imported from the stock sheet) and assign them to a process, merge
 * spelling duplicates, rename or deactivate. Stock receipts follow along.
 */
export function ProcessesPage() {
  const { user } = useAuth();
  const writable = canWrite(user, 'drymill');
  const [tab, setTab] = useState<string>(UNASSIGNED);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignTo, setAssignTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogSubProcess | null>(null);
  const [adding, setAdding] = useState(false);

  const processes = useApi<CatalogProcess[]>('/processing/catalog/processes/');
  const unassignedCount = useApi<CatalogSubProcess[]>('/processing/catalog/sub-processes/?unassigned=true&is_active=true');
  const subs = useApi<CatalogSubProcess[]>(
    `/processing/catalog/sub-processes/${query({
      unassigned: tab === UNASSIGNED ? 'true' : null,
      process: tab !== UNASSIGNED ? tab : null,
      is_active: showInactive ? null : 'true',
      search: search.trim(),
    })}`,
  );
  const rows = subs.data ?? [];
  const chosen = rows.filter((r) => selected.has(r.id));
  const processOptions = (processes.data ?? []).map((p) => ({ value: p.id, label: p.name }));
  const unassigned = unassignedCount.data ?? [];
  const unassignedKg = unassigned.reduce((sum, s) => sum + Number(s.net_weight_kg), 0);

  const refresh = () => {
    setSelected(new Set());
    subs.reload();
    processes.reload();
    unassignedCount.reload();
  };

  async function assign(groups: Map<string | null, string[]>, label: string) {
    setBusy(true);
    try {
      let total = 0;
      for (const [process, ids] of groups) {
        const res = await api<{ updated: number }>('/processing/catalog/sub-processes/assign/', { method: 'POST', body: { ids, process } });
        total += res.updated;
      }
      toast.success(`${total} sub-process${total === 1 ? '' : 'es'} ${label}. Their stock receipts moved with them.`, 'Assigned');
      setAssignTo(null);
      refresh();
    } catch (err) {
      toast.error(errorText(err), 'Could not assign');
    } finally {
      setBusy(false);
    }
  }

  function assignSelected() {
    if (!assignTo) return;
    const name = processOptions.find((p) => p.value === assignTo)?.label ?? '';
    assign(new Map([[assignTo, chosen.map((c) => c.id)]]), `assigned to ${name}`);
  }

  function applySuggestions() {
    const groups = new Map<string | null, string[]>();
    chosen.forEach((c) => {
      if (!c.suggested_process) return;
      groups.set(c.suggested_process.id, [...(groups.get(c.suggested_process.id) ?? []), c.id]);
    });
    if (groups.size === 0) return toast.info('None of the selected sub-processes has a suggestion.');
    assign(groups, 'assigned to their suggested process');
  }

  async function unassignSelected() {
    const ok = await confirmAction({
      title: `Move ${chosen.length} back to “Not assigned”?`,
      message: 'Their stock receipts will show “Not assigned” until they are assigned again.',
      confirmLabel: 'Unassign',
    });
    if (ok === null) return;
    assign(new Map([[null, chosen.map((c) => c.id)]]), 'unassigned');
  }

  async function setActive(active: boolean) {
    try {
      await api('/processing/catalog/sub-processes/activate/', { method: 'POST', body: { ids: chosen.map((c) => c.id), is_active: active } });
      toast.success(`${chosen.length} sub-process${chosen.length === 1 ? '' : 'es'} ${active ? 'activated' : 'deactivated'}.`);
      refresh();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  const withSuggestion = chosen.filter((c) => c.suggested_process).length;

  return (
    <Stack gap="lg">
      <PageHeader
        eyebrow="Configuration"
        title="Processes and sub-processes"
        description="Baho runs five processes. Every other name (e.g. “WASHED NO 1”, “ECLIPSE NAT”) is a sub-process of one of them."
        actions={writable && <Button leftSection={<IconPlus size={16} />} onClick={() => setAdding(true)}>New sub-process</Button>}
      />

      <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }}>
        <KpiCard label="Not assigned yet" value={`${unassigned.length}`} accent="orange" delta={unassigned.length ? `${kg(unassignedKg)} kg waiting` : undefined} loading={unassignedCount.loading && !unassignedCount.data} />
        {(processes.data ?? []).map((p) => (
          <KpiCard key={p.id} label={p.name} value={`${kg(p.net_weight_kg)} kg`} loading={processes.loading && !processes.data} />
        ))}
      </SimpleGrid>

      <Card p="md">
        <Tabs value={tab} onChange={(v) => { setTab(v ?? UNASSIGNED); setSelected(new Set()); }}>
          <Tabs.List>
            <Tabs.Tab value={UNASSIGNED} rightSection={<Badge size="xs" color="orange" variant="filled">{unassigned.length}</Badge>}>Not assigned</Tabs.Tab>
            {(processes.data ?? []).map((p) => (
              <Tabs.Tab key={p.id} value={p.id} rightSection={<Badge size="xs" variant="light">{p.sub_processes}</Badge>}>{p.name}</Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>

        <Group justify="space-between" mt="md" mb="xs" gap="sm">
          <TextInput placeholder="Search names and spellings…" leftSection={<IconSearch size={14} />} value={search} onChange={(e) => setSearch(e.currentTarget.value)} w={280} />
          <Switch label="Show inactive" checked={showInactive} onChange={(e) => setShowInactive(e.currentTarget.checked)} />
        </Group>

        {writable && selected.size > 0 && (
          <Card p="sm" mb="sm" bg="coffee.0">
            <Group gap="sm" wrap="wrap" align="flex-end">
              <Text fw={600} size="sm">{selected.size} selected</Text>
              <Select placeholder="Assign to process…" data={processOptions} value={assignTo} onChange={setAssignTo} w={240} aria-label="Assign to process" />
              <Button leftSection={<IconCheck size={16} />} disabled={!assignTo} loading={busy} onClick={assignSelected}>Assign</Button>
              {tab === UNASSIGNED && (
                <Tooltip label="Each selected name goes to the process suggested from its words (NAT, HONEY, ANAER, WASH…)" withArrow multiline w={260}>
                  <Button variant="light" leftSection={<IconBulb size={16} />} disabled={withSuggestion === 0} loading={busy} onClick={applySuggestions}>
                    Use suggestions ({withSuggestion})
                  </Button>
                </Tooltip>
              )}
              <Button variant="default" leftSection={<IconArrowMerge size={16} />} disabled={selected.size < 2} onClick={() => setMergeOpen(true)}>Merge…</Button>
              {tab !== UNASSIGNED && <Button variant="subtle" onClick={unassignSelected}>Unassign</Button>}
              <Button variant="subtle" onClick={() => setActive(!chosen.every((c) => c.is_active))}>
                {chosen.every((c) => c.is_active) ? 'Deactivate' : 'Activate'}
              </Button>
              <Button variant="subtle" onClick={() => setSelected(new Set())}>Clear</Button>
            </Group>
          </Card>
        )}

        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          loading={subs.loading}
          error={subs.error}
          minWidth={760}
          selection={writable ? { selected, onChange: setSelected } : undefined}
          exportName="sub-processes"
          empty={{
            title: tab === UNASSIGNED ? 'Everything is assigned' : 'No sub-processes under this process yet',
            hint: tab === UNASSIGNED ? 'New names from imports or receipts will appear here.' : 'Assign names from the “Not assigned” tab.',
          }}
          columns={[
            {
              key: 'name',
              header: 'Sub-process',
              exportValue: (r) => r.name,
              render: (r) => (
                <Group gap={6} wrap="nowrap">
                  <Text size="sm" fw={600} c={r.is_active ? undefined : 'dimmed'}>{r.name}</Text>
                  {!r.is_active && <Badge size="xs" color="gray">inactive</Badge>}
                </Group>
              ),
            },
            tab === UNASSIGNED && {
              key: 'suggested',
              header: 'Suggested process',
              exportValue: (r) => r.suggested_process?.name ?? '',
              render: (r) => (r.suggested_process ? <Badge variant="light" color="coffee" leftSection={<IconBulb size={10} />}>{r.suggested_process.name}</Badge> : <Text size="xs" c="dimmed">no guess</Text>),
            },
            tab !== UNASSIGNED && { key: 'process', header: 'Process', render: (r) => r.process_name },
            { key: 'aliases', header: 'Also written as', render: (r) => <Text size="xs" c="dimmed">{r.aliases.join(', ') || '—'}</Text>, exportValue: (r) => r.aliases.join('; ') },
            { key: 'receipts', header: 'Receipts', align: 'right', render: (r) => r.receipts.toLocaleString(), exportValue: (r) => r.receipts },
            { key: 'kg', header: 'Net weight (kg)', align: 'right', render: (r) => kg(r.net_weight_kg), exportValue: (r) => r.net_weight_kg },
            writable && {
              key: 'edit',
              header: '',
              exportValue: false,
              render: (r) => (
                <Button size="compact-xs" variant="subtle" leftSection={<IconEdit size={12} />} onClick={(e) => { e.stopPropagation(); setEditing(r); }}>Edit</Button>
              ),
            },
          ]}
        />
      </Card>

      {mergeOpen && <MergeModal items={chosen} onClose={() => setMergeOpen(false)} onDone={() => { setMergeOpen(false); refresh(); }} />}
      {editing && <EditModal sub={editing} processOptions={processOptions} onClose={() => setEditing(null)} onDone={() => { setEditing(null); refresh(); }} />}
      {adding && <AddModal processOptions={processOptions} defaultProcess={tab !== UNASSIGNED ? tab : null} onClose={() => setAdding(false)} onDone={() => { setAdding(false); refresh(); }} />}
    </Stack>
  );
}

function MergeModal({ items, onClose, onDone }: { items: CatalogSubProcess[]; onClose: () => void; onDone: () => void }) {
  const biggest = useMemo(() => [...items].sort((a, b) => b.receipts - a.receipts)[0], [items]);
  const [into, setInto] = useState<string | null>(biggest?.id ?? null);
  const submit = useSubmit();
  async function save() {
    const merged = await submit.run(() =>
      api<CatalogSubProcess>('/processing/catalog/sub-processes/merge/', { method: 'POST', body: { ids: items.map((i) => i.id), into } }),
    );
    if (!merged) return;
    toast.success(`Merged into ${merged.name}; the other names now resolve to it.`, 'Merged');
    onDone();
  }
  return (
    <Modal opened onClose={onClose} title={`Merge ${items.length} sub-processes`}>
      <Stack gap="sm">
        <Text size="sm">Keep one name. The others become its alternative spellings, and all their stock receipts move to it.</Text>
        <Select label="Keep" data={items.map((i) => ({ value: i.id, label: `${i.name} (${i.receipts} receipts)` }))} value={into} onChange={setInto} allowDeselect={false} />
        <ErrorMessage>{submit.error}</ErrorMessage>
        <Button onClick={save} loading={submit.saving} leftSection={<IconArrowMerge size={16} />}>Merge</Button>
      </Stack>
    </Modal>
  );
}

function EditModal({ sub, processOptions, onClose, onDone }: { sub: CatalogSubProcess; processOptions: Array<{ value: string; label: string }>; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(sub.name);
  const [process, setProcess] = useState<string | null>(sub.process);
  const [alias, setAlias] = useState('');
  const submit = useSubmit();
  async function save() {
    const body: Record<string, unknown> = {};
    if (name.trim() !== sub.name) body.name = name;
    if (process !== sub.process) body.process = process;
    if (alias.trim()) body.alias = alias;
    if (Object.keys(body).length === 0) return onClose();
    const saved = await submit.run(() => api<CatalogSubProcess>(`/processing/catalog/sub-processes/${sub.id}/`, { method: 'PATCH', body }));
    if (!saved) return;
    toast.success(`${saved.name}${saved.process_name ? ` · ${saved.process_name}` : ''}`, 'Sub-process updated');
    onDone();
  }
  return (
    <Modal opened onClose={onClose} title={`Edit ${sub.name}`}>
      <Stack gap="sm">
        <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} description="The old name keeps working as an alternative spelling." />
        <Select label="Process" data={processOptions} value={process} onChange={setProcess} clearable placeholder="Not assigned" />
        <TextInput label="Add another spelling" placeholder="e.g. WASHED NO1" value={alias} onChange={(e) => setAlias(e.currentTarget.value)} />
        {sub.aliases.length > 0 && <Text size="xs" c="dimmed">Already also written as: {sub.aliases.join(', ')}</Text>}
        <ErrorMessage>{submit.error}</ErrorMessage>
        <Button onClick={save} loading={submit.saving}>Save</Button>
      </Stack>
    </Modal>
  );
}

function AddModal({ processOptions, defaultProcess, onClose, onDone }: { processOptions: Array<{ value: string; label: string }>; defaultProcess: string | null; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [process, setProcess] = useState<string | null>(defaultProcess);
  const submit = useSubmit();
  async function save() {
    if (!name.trim()) return submit.fail('Enter a name.');
    const created = await submit.run(() => api<CatalogSubProcess>('/processing/catalog/sub-processes/', { method: 'POST', body: { name, process } }));
    if (!created) return;
    toast.success(`${created.name}${created.process_name ? ` under ${created.process_name}` : ''}`, 'Sub-process added');
    onDone();
  }
  return (
    <Modal opened onClose={onClose} title="New sub-process">
      <Stack gap="sm">
        <TextInput label="Name" required value={name} onChange={(e) => setName(e.currentTarget.value)} data-autofocus />
        <Select label="Process" data={processOptions} value={process} onChange={setProcess} clearable placeholder="Not assigned" />
        <ErrorMessage>{submit.error}</ErrorMessage>
        <Button onClick={save} loading={submit.saving}>Add</Button>
      </Stack>
    </Modal>
  );
}
