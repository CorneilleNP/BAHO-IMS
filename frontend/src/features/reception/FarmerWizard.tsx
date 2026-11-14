import { Select, SimpleGrid, Text, TextInput } from '@mantine/core';
import { FormWizard } from '../../components/FormWizard';
import { LocationPicker } from '../../components/LocationPicker';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';
import type { Farmer } from '../../lib/types';
import { useDraft } from '../../lib/useDraft';
import { useSubmit } from '../../lib/useSubmit';

interface FarmerForm {
  full_name: string;
  gender: string;
  national_id: string;
  location: string | null;
  phone: string;
}

const blank = (): FarmerForm => ({ full_name: '', gender: '', national_id: '', location: null, phone: '' });
const GENDERS = [
  { value: 'M', label: 'Male' },
  { value: 'F', label: 'Female' },
  { value: 'O', label: 'Other' },
];

/** Register a farmer at a station: identity → where they live → contact → review. */
export function FarmerWizard({ stationId, stationName, onClose, onSaved }: { stationId: string; stationName: string; onClose: () => void; onSaved: (farmer: Farmer) => void }) {
  const draft = useDraft<FarmerForm>(`farmer-${stationId}`, blank);
  const form = draft.value;
  const submit = useSubmit();

  const steps = [
    {
      label: 'Identity',
      validate: () => (!form.full_name.trim() ? 'Enter the farmer’s full name.' : null),
      content: (
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <TextInput label="Full name" required value={form.full_name} onChange={(e) => draft.set('full_name')(e.currentTarget.value)} data-autofocus />
          <Select label="Gender" data={GENDERS} value={form.gender || null} onChange={(v) => draft.set('gender')(v ?? '')} clearable />
          <TextInput label="National ID" value={form.national_id} onChange={(e) => draft.set('national_id')(e.currentTarget.value)} />
        </SimpleGrid>
      ),
    },
    {
      label: 'Where they live',
      content: <LocationPicker legend="Farmer's village" value={form.location} onChange={draft.set('location')} />,
    },
    {
      label: 'Contact',
      content: <TextInput label="Phone" placeholder="07…" value={form.phone} onChange={(e) => draft.set('phone')(e.currentTarget.value)} maw={300} />,
    },
  ];

  const review = (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
      {[
        ['Name', form.full_name],
        ['Gender', GENDERS.find((g) => g.value === form.gender)?.label ?? ''],
        ['National ID', form.national_id],
        ['Phone', form.phone],
        ['Station', stationName],
        ['Farmer code', 'assigned automatically'],
      ].map(([label, value]) => (
        <div key={label}>
          <Text size="xs" c="dimmed">{label}</Text>
          <Text fw={600} size="sm">{value || '—'}</Text>
        </div>
      ))}
    </SimpleGrid>
  );

  async function save() {
    const farmer = await submit.run(() => api<Farmer>('/farmers/', { method: 'POST', body: { ...form, home_facility: stationId } }));
    if (!farmer) return;
    toast.success(`${farmer.full_name} (${farmer.farmer_code})`, 'Farmer registered');
    draft.reset();
    onSaved(farmer);
  }

  return <FormWizard opened onClose={onClose} title={`Register farmer at ${stationName}`} steps={steps} review={review} onSubmit={save} submitLabel="Save farmer" saving={submit.saving} error={submit.error} />;
}
