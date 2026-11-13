import { useEffect, useState } from 'react';
import { AppShell, Button, Group, NavLink as MantineNavLink, ScrollArea, Text } from '@mantine/core';
import {
  IconBuildingWarehouse,
  IconCoffee,
  IconDroplet,
  IconShip,
  IconUsers,
} from '@tabler/icons-react';
import { NavLink as RouterNavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { LoginPage } from './features/auth/LoginPage';
import { defaultCwsRegistry } from './features/cws/CwsRegistryPage';
import { defaultProcessDefinitions, ProcessOnCwsPage } from './features/cws/ProcessOnCwsPage';
import { CherryReceiptForm } from './features/reception/CherryReceiptForm';
import { ProcessingLotForm } from './features/processing/ProcessingLotForm';
import { SourceRegistryPage, defaultSourceRegistry } from './features/drymill/SourceRegistryPage';
import { StockUpdatePage } from './features/drymill/StockUpdatePage';
import { ParchProcessingPage } from './features/drymill/ParchProcessingPage';
import { ExportUpdatesPage } from './features/drymill/ExportUpdatesPage';

const navSections = [
  {
    label: 'Dry Mill',
    items: [
      { to: '/drymill/stock', label: 'Stock Update', icon: IconBuildingWarehouse },
      { to: '/drymill/sources', label: 'Suppliers', icon: IconUsers },
      { to: '/drymill/processing', label: 'Parchment Processing', icon: IconDroplet },
      { to: '/drymill/export', label: 'Export Updates', icon: IconShip },
    ],
  },
  {
    label: 'CWS',
    items: [
      { to: '/reception', label: 'Cherry Reception', icon: IconCoffee },
      { to: '/processing', label: 'Processing Lots', icon: IconUsers },
      { to: '/cws/process', label: 'Register Process', icon: IconUsers },
    ],
  },
];

function DashboardLandingPage() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{ width: '100%', maxWidth: 900 }}>
        <Text size="sm" tt="uppercase" fw={700} c="dimmed" mb="lg">
          Access dashboard
        </Text>
        <Text size="h2" fw={800} style={{ fontSize: 42, lineHeight: 1.1, marginBottom: 32 }}>
          Choose your section
        </Text>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))', gap: 24 }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: 24, border: '1px solid #e2e0dc', boxShadow: '0 6px 24px rgba(20, 34, 20, 0.04)' }}>
            <Text fw={700} size="xl" mb="xs">Dry Mill</Text>
            <Text c="dimmed" size="sm" mb="lg">
              HQ operations, stock updates, processing, and export tracking.
            </Text>
            <Button onClick={() => navigate('/drymill/stock')} style={{ background: '#0b5b40', borderRadius: 12 }}>
              Open Dry Mill
            </Button>
          </div>

          <div style={{ background: '#fff', borderRadius: 18, padding: 24, border: '1px solid #e2e0dc', boxShadow: '0 6px 24px rgba(20, 34, 20, 0.04)' }}>
            <Text fw={700} size="xl" mb="xs">CWS</Text>
            <Text c="dimmed" size="sm" mb="lg">
              Field operations, cherry reception, process registration, and lot processing.
            </Text>
            <Button onClick={() => navigate('/cws/process')} style={{ background: '#0b5b40', borderRadius: 12 }}>
              Open CWS
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [processDefinitions, setProcessDefinitions] = useState(() => {
    const stored = localStorage.getItem('baho-process-definitions');
    if (!stored) return defaultProcessDefinitions;

    try {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : defaultProcessDefinitions;
    } catch {
      return defaultProcessDefinitions;
    }
  });
  const [sourceRegistry, setSourceRegistry] = useState(() => {
    const stored = localStorage.getItem('baho-source-registry');
    if (!stored) return defaultSourceRegistry;

    try {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : defaultSourceRegistry;
    } catch {
      return defaultSourceRegistry;
    }
  });

  useEffect(() => {
    localStorage.setItem('baho-source-registry', JSON.stringify(sourceRegistry));
  }, [sourceRegistry]);

  useEffect(() => {
    localStorage.setItem('baho-process-definitions', JSON.stringify(processDefinitions));
  }, [processDefinitions]);

  const isLoginPage = location.pathname === '/';
  const isDashboardPage = location.pathname === '/dashboard';

  const currentSection = location.pathname.startsWith('/drymill/')
    ? 'drymill'
    : location.pathname.startsWith('/cws/') || location.pathname === '/reception' || location.pathname === '/processing'
      ? 'cws'
      : null;

  const visibleSections = currentSection === 'drymill'
    ? [navSections[0]]
    : currentSection === 'cws'
      ? [navSections[1]]
      : [];

  const addProcessDefinition = (process: typeof defaultProcessDefinitions[number]) => {
    setProcessDefinitions((previous) => [process, ...previous]);
  };

  const addSourceRegistryEntry = (source: typeof defaultSourceRegistry[number]) => {
    setSourceRegistry((previous) => [source, ...previous]);
  };

  if (isLoginPage) {
    return <LoginPage />;
  }

  return (
    <AppShell
      navbar={{ width: 250, breakpoint: 'sm' }}
      header={{ height: 56 }}
      padding="lg"
    >
      <AppShell.Header style={{ background: '#f5f4f1', color: '#1a1a1a', border: 'none', boxShadow: 'none' }}>
        <Group h="100%" px="md" justify="space-between">
          <Group gap={8} align="center">
            <img src="/baho-logo.svg" alt="BAHO coffee company" style={{ height: 52, width: 'auto', display: 'block' }} />
          </Group>
          <Group gap="sm">
            {currentSection && (
              <Button
                size="compact-sm"
                variant="subtle"
                color="dark"
                onClick={() => navigate('/dashboard')}
                style={{ color: '#2d3d2d' }}
              >
                Back
              </Button>
            )}
            <Text size="sm" fw={600} c="#3d5140">Crop year 2026</Text>
          </Group>
        </Group>
      </AppShell.Header>

      {!isDashboardPage && (
        <AppShell.Navbar style={{ background: '#2a1a12', border: 'none' }} p="sm">
          <ScrollArea>
            {visibleSections.map((section) => (
              <div key={section.label} style={{ marginBottom: 20 }}>
                <Text size="xs" fw={700} c="gray.5" tt="uppercase" px="xs" mb={6}>
                  {section.label}
                </Text>
                {section.items.map((item) => {
                  const isActive = location.pathname === item.to;
                  return (
                    <MantineNavLink
                      key={item.to}
                      component={RouterNavLink}
                      to={item.to}
                      label={item.label}
                      leftSection={<item.icon size={18} />}
                      active={isActive}
                      variant="filled"
                      color="coffee"
                      style={{ borderRadius: 8, marginBottom: 2, color: isActive ? 'white' : '#d9c9bd' }}
                    />
                  );
                })}
              </div>
            ))}
          </ScrollArea>
        </AppShell.Navbar>
      )}

      <AppShell.Main style={{ background: '#f7f5f3' }}>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/dashboard" element={<DashboardLandingPage />} />
          <Route path="/drymill/stock" element={<StockUpdatePage sourceList={sourceRegistry} />} />
          <Route path="/drymill/sources" element={<SourceRegistryPage sourceList={sourceRegistry} onAddSource={addSourceRegistryEntry} />} />
          <Route path="/drymill/processing" element={<ParchProcessingPage />} />
          <Route path="/drymill/export" element={<ExportUpdatesPage />} />
          <Route path="/reception" element={<CherryReceiptForm />} />
          <Route path="/processing" element={<ProcessingLotForm processDefinitions={processDefinitions} />} />
          <Route path="/cws/process" element={<ProcessOnCwsPage cwsList={defaultCwsRegistry} processDefinitions={processDefinitions} onAddProcess={addProcessDefinition} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell.Main>
    </AppShell>
  );
}

export default App;
