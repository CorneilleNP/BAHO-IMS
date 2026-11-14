import { useState } from 'react';
import { Button, PasswordInput, Text, TextInput } from '@mantine/core';
import { useNavigate } from 'react-router-dom';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('info@baho.rw');
  const [password, setPassword] = useState('');

  const handleSubmit = () => {
    navigate('/dashboard');
  };

  return (
    <div style={{ height: '100vh', display: 'flex', background: '#f3f3f1', overflow: 'hidden' }}>
      <div style={{ flex: '0 0 48%', background: '#f4f4f2', padding: '26px 42px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
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

          <div style={{ marginTop: 28 }}>
            <TextInput
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
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
            </div>

            <Button
              fullWidth
              mt="lg"
              size="lg"
              onClick={handleSubmit}
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
          </div>
        </div>
      </div>

      <div style={{ flex: '1 1 52%', position: 'relative', overflow: 'hidden', background: '#0b5b40', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px 0' }}>
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
