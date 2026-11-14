import { SimpleGrid, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { FormWizard } from '../../components/FormWizard';
import { LocationPicker } from '../../components/LocationPicker';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';
import type { Supplier } from '../../lib/types';
import { useDraft } from '../../lib/useDraft';
import { useSubmit } from '../../lib/useSubmit';

interface SupplierForm {
  name: string;
  tin: string;
  location: string | null;
  location_label: string;
  contact_name: string;
  phone: string;
  notes: string;
}

const blank = (): SupplierForm => ({ name: '', tin: '', location: null, location_label: '', contact_name: '', phone: '', notes: '' });
const fromSupplier = (s: Supplier): SupplierForm => ({
  name: s.name,
  tin: s.tin,
  location: s.location,
  location_label: s.location_label,
  contact_name: s.contact_name,
  phone: s.phone,
  notes: s.notes,
});

/** Register or edit a partner supplier: identity → location → contact → review. */
export function SupplierWizard({ supplier, onClose, onSaved }: { supplier?: Supplier | null; onClose: () => void; onSaved: (s: Supplier) => void }) {
  const editing = !!supplier;
  const draft = useDraft<SupplierForm>(editing ? null : 'supplier', () => (supplier ? fromSupplier(supplier) : blank()));
  const form = draft.value;
  const submit = useSubmit();
  const text = (field: keyof SupplierForm) => (e: { currentTarget: { value: string } }) => draft.set(field)(e.currentTarget.value as never);

  const steps = [
    {
      label: 'Identity',
      validate: () => (!form.name.trim() ? 'Enter the supplier name.' : null),
      content: (
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label="Supplier name" required value={form.name} onChange={text('name')} data-autofocus />
          <TextInput label="TIN" value={form.tin} onChange={text('tin')} />
        </SimpleGrid>
      ),
    },
    {
      label: 'Location',
      content: <LocationPicker legend="Where the supplier is" value={form.location} onChange={draft.set('location')} />,
    },
    {
      label: 'Contact',
      content: (
        <Stack gap="sm">
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput label="Contact person" value={form.contact_name} onChange={text('contact_name')} />
            <TextInput label="Phone" value={form.phone} onChange={text('phone')} />
          </SimpleGrid>
          <Textarea label="Notes" value={form.notes} onChange={text('notes')} autosize minRows={2} />
        </Stack>
      ),
    },
  ];

  const review = (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
      {[
        ['Name', form.name],
        ['TIN', form.tin],
        ['Location', form.location ? form.location_label || 'Chosen' : '—'],
        ['Contact', [form.contact_name, form.phone].filter(Boolean).join(' · ')],
        ['Notes', form.notes],
      ].map(([label, value]) => (
        <div key={label}>
          <Text size="xs" c="dimmed">{label}</Text>
          <Text fw={600} size="sm">{value || '—'}</Text>
        </div>
      ))}
    </SimpleGrid>
  );

  async function save() {
    const body = { name: form.name, tin: form.tin, location: form.location, contact_name: form.contact_name, phone: form.phone, notes: form.notes };
    const saved = await submit.run(() =>
      editing
        ? api<Supplier>(`/drymill/suppliers/${supplier!.id}/`, { method: 'PATCH', body })
        : api<Supplier>('/drymill/suppliers/', { method: 'POST', body }),
    );
    if (!saved) return;
    toast.success(saved.name, editing ? 'Supplier updated' : 'Supplier registered');
    draft.reset();
    onSaved(saved);
  }

  return (
    <FormWizard
      opened
      onClose={onClose}
      title={editing ? `Edit ${supplier!.name}` : 'Register partner supplier'}
      steps={steps}
      review={review}
      onSubmit={save}
      submitLabel={editing ? 'Save changes' : 'Save supplier'}
      saving={submit.saving}
      error={submit.error}
      size="lg"
    />
  );
}
