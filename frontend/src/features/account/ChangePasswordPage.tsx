import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, PasswordInput, Stack, Text } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { ErrorMessage } from '../../components/Feedback';
import { PageHeader } from '../../components/PageHeader';
import { useAuth } from '../../lib/authContext';
import { toast } from '../../lib/toast';
import { useSubmit } from '../../lib/useSubmit';

/** Change your own password. Forced after an admin creates the account or resets it. */
export function ChangePasswordPage() {
  const navigate = useNavigate();
  const { user, changePassword } = useAuth();
  const submit = useSubmit();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const forced = Boolean(user?.must_change_password);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!current || !next) return submit.fail('Fill in every field.');
    if (next.length < 8) return submit.fail('The new password needs at least 8 characters.');
    if (next !== confirm) return submit.fail('The two new passwords do not match.');
    const me = await submit.run(() => changePassword(current, next));
    if (!me) return;
    toast.success('Your password was changed. Other devices were signed out.', 'Password changed');
    navigate('/dashboard', { replace: true });
  };

  return (
    <Stack gap="lg" maw={520}>
      <PageHeader eyebrow="Your account" title="Change password" />
      {forced && (
        <Alert color="yellow" variant="light">
          Your administrator set a temporary password for you. Choose your own password to continue.
        </Alert>
      )}
      <Card withBorder radius="md" p="lg">
        <form onSubmit={handleSubmit} noValidate>
          <Stack>
            <ErrorMessage>{submit.error}</ErrorMessage>
            <PasswordInput
              label={forced ? 'Temporary password' : 'Current password'}
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.currentTarget.value)}
              required
              data-autofocus
            />
            <PasswordInput
              label="New password"
              description="At least 8 characters; not only numbers, not a common password."
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.currentTarget.value)}
              required
            />
            <PasswordInput
              label="Repeat new password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.currentTarget.value)}
              required
            />
            <Text size="xs" c="dimmed">You stay signed in here; every other device is signed out.</Text>
            <Button type="submit" loading={submit.saving}>
              Change password
            </Button>
          </Stack>
        </form>
      </Card>
    </Stack>
  );
}
