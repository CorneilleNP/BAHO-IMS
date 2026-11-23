import { useState, type FormEvent } from 'react';
import { Alert, Button, PasswordInput, Text, TextInput } from '@mantine/core';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { allowedSections, canAccessPath, type CurrentUser } from '../../lib/access';
import { isNative, serverUrl, setServerUrl } from '../../lib/platform';
import { useAuth } from '../../lib/authContext';

const SECTION_HOME = { drymill: '/drymill/stock', cws: '/cws/process', admin: '/admin/users' } as const;

/**
 * Where to land after login: the page they were sent away from (only if
 * their role may open it), else their only section, else the chooser.
 */
function landingPath(user: CurrentUser, from?: string): string {
  if (from && from !== '/' && canAccessPath(user, from)) return from;
  const sections = allowedSections(user);
  return sections.length === 1 ? SECTION_HOME[sections[0]] : '/dashboard';
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showForgotHelp, setShowForgotHelp] = useState(false);
  const from = (location.state as { from?: string } | null)?.from;

  if (user) {
    return <Navigate to={user.must_change_password ? '/account/password' : landingPath(user, from)} replace />;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const me = await login(email, password);
      navigate(me.must_change_password ? '/account/password' : landingPath(me, from), { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed.';
      setError(
        message === 'No active account found with the given credentials'
          ? 'Incorrect email or password.'
          : message,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', background: '#f3f3f1', overflow: 'hidden' }}>
      <div className="login-form-pane" style={{ flex: '0 0 48%', background: '#f4f4f2', padding: '26px 42px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 16, color: '#4a4a4a', marginBottom: 18 }}>
          <div style={{ width: 12, height: 12, borderRadius: 4, background: '#0b5b40', display: 'inline-block' }} />
          <div style={{ fontWeight: 700 }}>baho/login</div>
        </div>

        <div style={{ maxWidth: 500, marginLeft: 4, marginTop: 0 }}>
          <h1 style={{ fontSize: '2.8rem', lineHeight: 1.08, margin: 0, color: '#0b3c2e', fontWeight: 700 }}>
            Welcome to BAHO IMS
          </h1>
          <Text size="md" c="gray.7" mt="sm" style={{ maxWidth: 420, lineHeight: 1.5 }}>
            Track coffee receipts, processing, and stock in one place.
          </Text>

          <form onSubmit={handleSubmit} noValidate style={{ marginTop: 28 }}>
            {error && (
              <Alert color="red" variant="light" radius="md" mb="md" role="alert">
                {error}
              </Alert>
            )}

            <TextInput
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
              type="email"
              name="email"
              autoComplete="username"
              placeholder="Email address"
              aria-label="Email address"
              autoFocus
              disabled={submitting}
              radius="md"
              size="lg"
              leftSection={<span style={{ fontSize: 18 }}>✉</span>}
              styles={{
                input: {
                  background: '#edf3f4',
                  border: '1px solid #dfe8ea',
                  color: '#234339',
                  fontWeight: 600,
                  height: 50,
                },
              }}
            />

            <PasswordInput
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              name="password"
              autoComplete="current-password"
              placeholder="Password"
              aria-label="Password"
              disabled={submitting}
              mt="sm"
              radius="md"
              size="lg"
              visibilityToggleIcon={({ reveal }) => (
                <span style={{ fontSize: 18 }}>{reveal ? '🙈' : '👁'}</span>
              )}
              styles={{
                input: {
                  background: '#edf3f4',
                  border: '1px solid #dfe8ea',
                  color: '#234339',
                  fontWeight: 600,
                  height: 50,
                },
              }}
            />

            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <button
                type="button"
                onClick={() => setShowForgotHelp((shown) => !shown)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#3b5b52',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Forgot password?
              </button>
              {showForgotHelp && (
                <Text size="sm" c="gray.7" mt={6}>
                  Accounts are managed by your Baho administrator. Ask them to reset your password.
                </Text>
              )}
            </div>

            <Button
              type="submit"
              fullWidth
              mt="lg"
              size="lg"
              loading={submitting}
              style={{
                background: '#0b5b40',
                minHeight: 50,
                borderRadius: 14,
                fontWeight: 700,
                fontSize: 18,
              }}
            >
              Sign In
            </Button>
          </form>
          {isNative && <ServerSetting />}
        </div>
      </div>

      <div className="login-art-pane" style={{ flex: '1 1 52%', position: 'relative', overflow: 'hidden', background: '#0b5b40', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px 0' }}>
        <div style={{ width: '78%', height: '82%', background: '#0b5b40', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: 'none', border: 'none', borderRadius: 0 }}>
          <img
            src="/baho-login-page.jpeg"
            alt="BAHO coffee"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              objectPosition: 'center center',
              display: 'block',
              filter: 'saturate(1.1) contrast(1.05)',
              background: '#0b5b40',
            }}
          />
        </div>
      </div>
    </div>
  );
}

/** Android app only: which Baho server to sign in to (default: the live site). */
function ServerSetting() {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(serverUrl());
  const [current, setCurrent] = useState(serverUrl());
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    try {
      const url = await setServerUrl(value);
      setCurrent(url);
      setValue(url);
      setEditing(false);
      setError(null);
    } catch {
      setError('Enter a server address like baho.izere.work');
    }
  };

  if (!editing) {
    return (
      <Text size="xs" c="dimmed" mt="md">
        Server: {current}{' '}
        <button type="button" onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', padding: 0, color: '#0b5b40', cursor: 'pointer', fontWeight: 600 }}>
          Change
        </button>
      </Text>
    );
  }
  return (
    <div style={{ marginTop: 16 }}>
      <TextInput
        label="Server address"
        description={current.startsWith('http://') ? 'Not encrypted (http): use only for testing on your own Wi-Fi.' : 'Ask your administrator if unsure.'}
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        error={error}
        autoCapitalize="off"
        autoCorrect="off"
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <Button size="xs" onClick={() => void save()}>Save</Button>
        <Button size="xs" variant="default" onClick={() => { setEditing(false); setValue(current); }}>Cancel</Button>
      </div>
    </div>
  );
}
