import { SimpleGrid, Switch, Text, TextInput } from '@mantine/core';
import { FormWizard } from '../../components/FormWizard';
import { LocationPicker } from '../../components/LocationPicker';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';
import type { Facility } from '../../lib/types';
import { useDraft } from '../../lib/useDraft';
import { useSubmit } from '../../lib/useSubmit';

interface StationForm {
  name: string;
  code: string;
  location: string | null;
  location_label: string;
  contact_name: string;
  contact_phone: string;
  is_active: boolean;
}

/** A short code to tell the station apart in numbering (GRNs, receipts…) - letters/digits, no spaces. */
const suggestCode = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10);

const blank = (): StationForm => ({ name: '', code: '', location: null, location_label: '', contact_name: '', contact_phone: '', is_active: true });
const fromFacility = (f: Facility): StationForm => ({
  name: f.name,
  code: f.code,
  location: f.location,
  location_label: f.location_label,
  contact_name: f.contact_name,
  contact_phone: f.contact_phone,
  is_active: f.is_active,
});

interface Props {
  station?: Facility | null;
  onClose: () => void;
  onSaved: (station: Facility) => void;
}

/** Register (or edit) a coffee washing station: name, a short code for document
 * numbering, and where it is in Rwanda's admin hierarchy. Admin only. */
export function CwsStationWizard({ station, onClose, onSaved }: Props) {
  const editing = !!station;
  const draft = useDraft<StationForm>(editing ? null : 'cws-station', () => (station ? fromFacility(station) : blank()));
  const form = draft.value;
  const submit = useSubmit();
  const text = (field: keyof StationForm) => (e: { currentTarget: { value: string } }) => draft.set(field)(e.currentTarget.value as never);

  const steps = [
    {
      label: 'Identity',
      validate: () => (!form.name.trim() ? 'Enter the station name.' : !form.code.trim() ? 'Enter a short code for this station.' : null),
      content: (
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput
            label="Station name"
            required
            value={form.name}
            onChange={(e) => {
              const name = e.currentTarget.value;
              draft.setValue((prev) => ({ ...prev, name, code: editing ? prev.code : suggestCode(name) }));
            }}
            data-autofocus
          />
          <TextInput
            label="Code"
            required
            description="Used in GRN and receipt numbers - keep it short"
            value={form.code}
            onChange={(e) => draft.set('code')(e.currentTarget.value.toUpperCase())}
          />
          {editing && (
            <Switch
              label="Active"
              description="Inactive stations stay in history but drop off new-record dropdowns"
              checked={form.is_active}
              onChange={(e) => draft.set('is_active')(e.currentTarget.checked)}
            />
          )}
        </SimpleGrid>
      ),
    },
    {
      label: 'Location',
      content: <LocationPicker legend="Where the station is" value={form.location} onChange={draft.set('location')} />,
    },
    {
      label: 'Contact',
      description: 'Optional',
      content: (
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label="Contact person" value={form.contact_name} onChange={text('contact_name')} />
          <TextInput label="Phone" value={form.contact_phone} onChange={text('contact_phone')} />
        </SimpleGrid>
      ),
    },
  ];

  const review = (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
      {[
        ['Name', form.name],
        ['Code', form.code],
        ['Location', form.location ? form.location_label || 'Chosen' : '—'],
        ['Contact', [form.contact_name, form.contact_phone].filter(Boolean).join(' · ')],
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
      facility_type: 'CWS',
      name: form.name.trim(),
      code: form.code.trim(),
      location: form.location,
      contact_name: form.contact_name,
      contact_phone: form.contact_phone,
      ...(editing ? { is_active: form.is_active } : {}),
    };
    const saved = await submit.run(() =>
      editing
        ? api<Facility>(`/organization/facilities/${station!.id}/`, { method: 'PATCH', body })
        : api<Facility>('/organization/facilities/', { method: 'POST', body }),
    );
    if (!saved) return;
    toast.success(`${saved.name} (${saved.code})`, editing ? 'Station updated' : 'Station registered');
    draft.reset();
    onSaved(saved);
  }

  const close = () => {
    if (!editing) draft.reset();
    onClose();
  };

  return (
    <FormWizard
      opened
      onClose={close}
      title={editing ? `Edit ${station!.name}` : 'Register a coffee washing station'}
      steps={steps}
      review={review}
      onSubmit={save}
      submitLabel={editing ? 'Save changes' : 'Save station'}
      saving={submit.saving}
      error={submit.error}
      size="lg"
    />
  );
}
