import { useState, type FormEvent } from 'react';
import { Alert, Button, PasswordInput, Text, TextInput } from '@mantine/core';
import { IconArrowRight, IconCloudCheck, IconLeaf, IconLock, IconMail, IconRoute, IconServer, IconWifiOff } from '@tabler/icons-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { allowedSections, canAccessPath, type CurrentUser } from '../../lib/access';
import { isNative, serverUrl, setServerUrl } from '../../lib/platform';
import { useAuth } from '../../lib/authContext';
import './LoginPage.css';

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

const inputStyles = {
  label: { fontWeight: 600, color: '#2c3d36', marginBottom: 6 },
  input: {
    height: 52,
    borderRadius: 14,
    background: '#f5f8f6',
    border: '1px solid #e1e9e4',
    fontSize: 16, // 16px+ stops phones zooming into the field
  },
} as const;

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
      setError(message === 'No active account found with the given credentials' ? 'Incorrect email or password.' : message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login">
      <div className="login-hero">
        <img src="/baho-login-page.jpeg" alt="" />
        <div className="login-hero-text">
          <h2>From the farmer's cherry to the export container.</h2>
          <p>Reception, processing, dry mill and export for every Baho station, in one place.</p>
          <div className="login-chips">
            <span><IconWifiOff size={15} /> Works offline</span>
            <span><IconCloudCheck size={15} /> Syncs automatically</span>
            <span><IconRoute size={15} /> Farmer-to-export traceability</span>
          </div>
        </div>
      </div>

      <div className="login-sheet">
        <div className="login-card">
          <div className="login-logo">
            <img src="/baho-image.jpg" alt="Baho Coffee" />
          </div>

          <h1 className="login-title">Welcome back</h1>
          <p className="login-subtitle">Sign in to Baho IMS to continue.</p>

          <form onSubmit={handleSubmit} noValidate>
            {error && (
              <Alert color="red" variant="light" radius="md" mb="md" role="alert">
                {error}
              </Alert>
            )}

            <TextInput
              label="Email"
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
              type="email"
              name="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="off"
              placeholder="you@baho.rw"
              disabled={submitting}
              leftSection={<IconMail size={19} stroke={1.7} />}
              styles={inputStyles}
            />

            <PasswordInput
              label="Password"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              name="password"
              autoComplete="current-password"
              placeholder="Your password"
              disabled={submitting}
              mt="md"
              leftSection={<IconLock size={19} stroke={1.7} />}
              styles={inputStyles}
            />

            <div className="login-row">
              <button type="button" className="login-link" onClick={() => setShowForgotHelp((shown) => !shown)}>
                Forgot password?
              </button>
            </div>
            {showForgotHelp && (
              <Text size="sm" c="gray.7" mt={-12} mb="md">
                Accounts are managed by your Baho administrator. Ask them to reset your password.
              </Text>
            )}

            <Button type="submit" fullWidth className="login-submit" loading={submitting} rightSection={<IconArrowRight size={18} />}>
              Sign in
            </Button>
          </form>
        </div>

        <div className="login-footer">
          {isNative && <ServerSetting />}
          <span>
            <IconLeaf size={12} style={{ verticalAlign: -1 }} /> Baho Coffee Company · Unique in speciality from Rwanda
          </span>
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
      <div className="login-server">
        <IconServer size={14} />
        <span>{current.replace(/^https?:\/\//, '')}</span>
        <button type="button" className="login-link" onClick={() => setEditing(true)}>
          Change
        </button>
      </div>
    );
  }
  return (
    <div>
      <TextInput
        label="Server address"
        description={value.startsWith('http://') ? 'Not encrypted (http): use only for testing on your own Wi-Fi.' : 'Ask your administrator if unsure.'}
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        error={error}
        autoCapitalize="off"
        autoCorrect="off"
        styles={inputStyles}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <Button size="xs" radius="md" color="teal" onClick={() => void save()}>Save</Button>
        <Button size="xs" radius="md" variant="default" onClick={() => { setEditing(false); setValue(current); }}>Cancel</Button>
      </div>
    </div>
  );
}
