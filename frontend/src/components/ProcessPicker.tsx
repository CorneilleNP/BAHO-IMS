import { useState } from 'react';
import { ActionIcon, Group, Select, TextInput, Tooltip } from '@mantine/core';
import { IconCheck, IconPlus, IconX } from '@tabler/icons-react';
import { api } from '../lib/api';
import { toast } from '../lib/toast';
import type { CatalogProcess, CatalogSubProcess } from '../lib/types';
import { errorText, useApi } from '../lib/useApi';

interface ProcessPickerProps {
  process: string | null;
  subProcess: string | null;
  onChange: (value: { process: string | null; subProcess: string | null }) => void;
  /** Allow creating a missing sub-process under the chosen process. */
  canAdd?: boolean;
  required?: boolean;
}

/** One of the five processes, then (optionally) one of its sub-processes. */
export function ProcessPicker({ process, subProcess, onChange, canAdd = false, required = true }: ProcessPickerProps) {
  const processes = useApi<CatalogProcess[]>('/processing/catalog/processes/');
  const subs = useApi<CatalogSubProcess[]>(process ? `/processing/catalog/sub-processes/?process=${process}&is_active=true` : null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  async function addSubProcess() {
    if (!newName.trim() || !process) return;
    setSaving(true);
    try {
      const created = await api<CatalogSubProcess>('/processing/catalog/sub-processes/', {
        method: 'POST',
        body: { name: newName, process },
      });
      toast.success(`${created.name} added under ${created.process_name}.`, 'Sub-process added');
      subs.reload();
      onChange({ process, subProcess: created.id });
      setAdding(false);
      setNewName('');
    } catch (err) {
      toast.error(errorText(err), 'Could not add sub-process');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Select
        label="Process"
        required={required}
        placeholder={processes.loading ? 'Loading…' : 'One of the five processes'}
        data={(processes.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
        value={process}
        onChange={(value) => onChange({ process: value, subProcess: null })}
        allowDeselect={!required}
      />
      {adding ? (
        <Group gap={4} align="flex-end" wrap="nowrap">
          <TextInput
            label="New sub-process"
            placeholder="e.g. WASHED NO 12"
            value={newName}
            onChange={(e) => setNewName(e.currentTarget.value)}
            style={{ flex: 1 }}
            data-autofocus
          />
          <ActionIcon size="lg" mb={1} onClick={addSubProcess} loading={saving} aria-label="Add sub-process">
            <IconCheck size={16} />
          </ActionIcon>
          <ActionIcon size="lg" mb={1} variant="default" onClick={() => setAdding(false)} aria-label="Cancel">
            <IconX size={16} />
          </ActionIcon>
        </Group>
      ) : (
        <Group gap={4} align="flex-end" wrap="nowrap">
          <Select
            label="Sub-process"
            placeholder={!process ? 'Choose the process first' : subs.loading ? 'Loading…' : 'Optional'}
            data={(subs.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
            value={subProcess}
            onChange={(value) => onChange({ process, subProcess: value })}
            disabled={!process}
            searchable
            clearable
            nothingFoundMessage="Not found"
            style={{ flex: 1 }}
          />
          {canAdd && process && (
            <Tooltip label="Add a sub-process" withArrow>
              <ActionIcon size="lg" mb={1} variant="light" onClick={() => setAdding(true)} aria-label="Add a sub-process">
                <IconPlus size={16} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      )}
    </>
  );
}
