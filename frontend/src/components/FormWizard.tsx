import { useState, type ReactNode } from 'react';
import { Button, Group, Modal, Stack, Stepper } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconArrowLeft, IconArrowRight, IconCheck } from '@tabler/icons-react';
import { ErrorMessage } from './Feedback';

export interface WizardStep {
  label: string;
  description?: string;
  content: ReactNode;
  /** Return an error message to stop on this step, or null to continue. */
  validate?: () => string | null;
}

interface FormWizardProps {
  opened: boolean;
  onClose: () => void;
  title: string;
  steps: WizardStep[];
  /** Shown as the last step; summarise what will be saved. */
  review: ReactNode;
  onSubmit: () => void | Promise<void>;
  submitLabel?: string;
  saving?: boolean;
  /** Server error from the last save attempt. */
  error?: string | null;
  size?: string;
}

/**
 * The one multi-step form used everywhere: a step indicator, Back / Next with
 * checks per step, and a review step before saving. Full screen on phones.
 * Keep the form values in the parent (see useDraft) so nothing is lost when
 * moving between steps. Mount it fresh for each use so it starts at step 1.
 */
export function FormWizard({ opened, onClose, title, steps, review, onSubmit, submitLabel = 'Save', saving = false, error, size = 'xl' }: FormWizardProps) {
  const [active, setActive] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);
  const phone = useMediaQuery('(max-width: 48em)');
  const last = steps.length; // index of the review step

  // A server error usually belongs to an earlier step's field: keep the user on review to read it.
  const next = () => {
    const problem = steps[active]?.validate?.() ?? null;
    setStepError(problem);
    if (!problem) setActive((current) => Math.min(current + 1, last));
  };
  const back = () => {
    setStepError(null);
    setActive((current) => Math.max(current - 1, 0));
  };
  const jump = (index: number) => {
    if (index > active) {
      // only move forward through valid steps
      for (let i = active; i < index; i += 1) {
        const problem = steps[i].validate?.() ?? null;
        if (problem) {
          setActive(i);
          setStepError(problem);
          return;
        }
      }
    }
    setStepError(null);
    setActive(index);
  };

  return (
    <Modal opened={opened} onClose={onClose} title={title} size={size} fullScreen={phone} closeOnClickOutside={false}>
      <Stack gap="md">
        <Stepper active={active} onStepClick={jump} size="sm" allowNextStepsSelect={false} wrap>
          {steps.map((step) => (
            <Stepper.Step key={step.label} label={step.label} description={phone ? undefined : step.description}>
              <Stack gap="sm" pt="sm">
                {step.content}
              </Stack>
            </Stepper.Step>
          ))}
          <Stepper.Step label="Review" description={phone ? undefined : 'Check and save'}>
            <Stack gap="sm" pt="sm">
              {review}
            </Stack>
          </Stepper.Step>
        </Stepper>

        <ErrorMessage>{stepError ?? (active === last ? error : null)}</ErrorMessage>

        <Group justify="space-between">
          <Button variant="default" leftSection={<IconArrowLeft size={16} />} onClick={active === 0 ? onClose : back} disabled={saving}>
            {active === 0 ? 'Cancel' : 'Back'}
          </Button>
          {active < last ? (
            <Button rightSection={<IconArrowRight size={16} />} onClick={next}>
              Next
            </Button>
          ) : (
            <Button leftSection={<IconCheck size={16} />} onClick={() => onSubmit()} loading={saving}>
              {submitLabel}
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
