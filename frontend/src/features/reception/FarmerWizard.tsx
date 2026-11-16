import { NumberInput, Select, SimpleGrid, Text, TextInput } from '@mantine/core';
import { FormWizard } from '../../components/FormWizard';
import { LocationPicker } from '../../components/LocationPicker';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';
import type { Farmer } from '../../lib/types';
import { useDraft } from '../../lib/useDraft';
import { useSubmit } from '../../lib/useSubmit';

type Num = number | '';

interface FarmerForm {
  full_name: string;
  gender: string;
  national_id: string;
  location: string | null;
  phone: string;
  household_size: Num;
  land_area_ha: Num;
}

const blank = (): FarmerForm => ({
  full_name: '',
  gender: '',
  national_id: '',
  location: null,
  phone: '',
  household_size: '',
  land_area_ha: '',
});
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
      label: 'Contact & household',
      content: (
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <TextInput label="Phone" placeholder="07…" value={form.phone} onChange={(e) => draft.set('phone')(e.currentTarget.value)} />
          <NumberInput label="Household size" placeholder="People in the household" value={form.household_size} onChange={(v) => draft.set('household_size')(v === '' ? '' : Number(v))} min={0} allowDecimal={false} hideControls />
          <NumberInput label="Plot / land area (ha)" description="Optional" placeholder="e.g. 0.25" value={form.land_area_ha} onChange={(v) => draft.set('land_area_ha')(v === '' ? '' : Number(v))} min={0} decimalScale={3} hideControls />
        </SimpleGrid>
      ),
    },
  ];

  const review = (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
      {[
        ['Name', form.full_name],
        ['Gender', GENDERS.find((g) => g.value === form.gender)?.label ?? ''],
        ['National ID', form.national_id],
        ['Phone', form.phone],
        ['Household size', form.household_size === '' ? '' : String(form.household_size)],
        ['Plot / land area (ha)', form.land_area_ha === '' ? '' : String(form.land_area_ha)],
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
    const body = {
      ...form,
      household_size: form.household_size === '' ? null : form.household_size,
      land_area_ha: form.land_area_ha === '' ? null : form.land_area_ha,
      home_facility: stationId,
    };
    const farmer = await submit.run(() => api<Farmer>('/farmers/', { method: 'POST', body }));
    if (!farmer) return;
    toast.success(`${farmer.full_name} (${farmer.farmer_code})`, 'Farmer registered');
    draft.reset();
    onSaved(farmer);
  }

  // Closing without saving also clears the draft, so the next registration starts blank.
  const close = () => {
    draft.reset();
    onClose();
  };
  return <FormWizard opened onClose={close} title={`Register farmer at ${stationName}`} steps={steps} review={review} onSubmit={save} submitLabel="Save farmer" saving={submit.saving} error={submit.error} />;
}
