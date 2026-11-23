import { AppShell, Burger, Button, Center, Group, Loader, NavLink as MantineNavLink, ScrollArea, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useEffect } from 'react';
import type { ComponentType } from 'react';
import {
  IconBuildingWarehouse,
  IconChartBar,
  IconClipboardList,
  IconCoffee,
  IconDroplet,
  IconFileImport,
  IconKey,
  IconListDetails,
  IconLogout,
  IconMessage,
  IconPlant2,
  IconUserCog,
  IconShip,
  IconSitemap,
  IconTruckDelivery,
  IconUsers,
} from '@tabler/icons-react';
import { NavLink as RouterNavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { LoginPage } from './features/auth/LoginPage';
import { allowedSections, canAccessSection, isAdmin, sectionForPath, type Section } from './lib/access';
import { useAuth } from './lib/authContext';
import { ProcessOnCwsPage } from './features/cws/ProcessOnCwsPage';
import { CwsStationsPage } from './features/cws/CwsStationsPage';
import { CherryReceiptForm } from './features/reception/CherryReceiptForm';
import { CwsDashboardPage } from './features/reception/CwsDashboardPage';
import { ProcessingLotForm } from './features/processing/ProcessingLotForm';
import { ProcessingLotReportPage } from './features/processing/ProcessingLotReportPage';
import { SourceRegistryPage } from './features/drymill/SourceRegistryPage';
import { ProcessesPage } from './features/drymill/ProcessesPage';
import { StockUpdatePage } from './features/drymill/StockUpdatePage';
import { ParchProcessingPage } from './features/drymill/ParchProcessingPage';
import { ExportUpdatesPage } from './features/drymill/ExportUpdatesPage';
import { CwsTransfersPage } from './features/transfers/CwsTransfersPage';
import { ChangePasswordPage } from './features/account/ChangePasswordPage';
import { ImportsPage } from './features/admin/ImportsPage';
import { SmsOutboxPage } from './features/admin/SmsOutboxPage';
import { UsersPage } from './features/admin/UsersPage';
import { StockLedgerPage } from './features/drymill/StockLedgerPage';
import { LaborPage } from './features/labor/LaborPage';
import { FarmersPage } from './features/reception/FarmersPage';
import { SyncPage } from './features/sync/SyncPage';
import { SyncIndicator } from './components/SyncIndicator';
import { confirmAction } from './lib/confirm';
import { getSyncStatus } from './lib/offline/store';

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  /** Only shown to the ADMIN role, e.g. registering a new station. */
  adminOnly?: boolean;
}

const navSections: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Dry Mill',
    items: [
      { to: '/drymill/stock', label: 'Stock Update', icon: IconBuildingWarehouse },
      { to: '/drymill/ledger', label: 'Stock Ledger', icon: IconListDetails },
      { to: '/drymill/sources', label: 'Suppliers', icon: IconUsers },
      { to: '/drymill/processes', label: 'Processes', icon: IconSitemap },
      { to: '/drymill/processing', label: 'Parchment Processing', icon: IconDroplet },
      { to: '/drymill/export', label: 'Export Updates', icon: IconShip },
    ],
  },
  {
    label: 'CWS',
    items: [
      { to: '/cws/dashboard', label: 'Dashboard', icon: IconChartBar },
      { to: '/reception', label: 'Cherry Reception', icon: IconCoffee },
      { to: '/cws/farmers', label: 'Farmers', icon: IconPlant2 },
      { to: '/processing', label: 'Processing Lots', icon: IconUsers },
      { to: '/cws/lots-report', label: 'Lots Report', icon: IconClipboardList },
      { to: '/cws/transfers', label: 'Transfers to Dry Mill', icon: IconTruckDelivery },
      { to: '/cws/labor', label: 'Casual Labor', icon: IconUsers },
      { to: '/cws/process', label: 'Register Process', icon: IconUsers },
      { to: '/cws/stations', label: 'Register CWS', icon: IconBuildingWarehouse, adminOnly: true },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/admin/users', label: 'Users', icon: IconUserCog },
      { to: '/admin/sms', label: 'SMS Outbox', icon: IconMessage },
      { to: '/admin/imports', label: 'Import Cherry Receipts', icon: IconFileImport },
    ],
  },
];

function DashboardLandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const sections = allowedSections(user);

  if (sections.length === 0) {
    return (
      <Center h="100%" p="xl">
        <Stack align="center" gap="xs" maw={460} ta="center">
          <Text fw={700} size="xl">No sections assigned yet</Text>
          <Text c="dimmed">
            Your account has no role that opens a section of the app. Ask your Baho administrator to
            assign you a role and a station.
          </Text>
        </Stack>
      </Center>
    );
  }

  return (
    <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{ width: '100%', maxWidth: 900 }}>
        <Text size="sm" tt="uppercase" fw={700} c="dimmed" mb="lg">
          Access dashboard
        </Text>
        <Text size="h2" fw={800} style={{ fontSize: 42, lineHeight: 1.1, marginBottom: 32 }}>
          Choose your section
        </Text>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24 }}>
          {sections.includes('drymill') && (
          <div style={{ background: '#fff', borderRadius: 18, padding: 24, border: '1px solid #e2e0dc', boxShadow: '0 6px 24px rgba(20, 34, 20, 0.04)' }}>
            <Text fw={700} size="xl" mb="xs">Dry Mill</Text>
            <Text c="dimmed" size="sm" mb="lg">
              HQ operations, stock updates, processing, and export tracking.
            </Text>
            <Button onClick={() => navigate('/drymill/stock')} style={{ background: '#0b5b40', borderRadius: 12 }}>
              Open Dry Mill
            </Button>
          </div>
          )}

          {sections.includes('admin') && (
          <div style={{ background: '#fff', borderRadius: 18, padding: 24, border: '1px solid #e2e0dc', boxShadow: '0 6px 24px rgba(20, 34, 20, 0.04)' }}>
            <Text fw={700} size="xl" mb="xs">Administration</Text>
            <Text c="dimmed" size="sm" mb="lg">
              User accounts and roles, the SMS outbox, and importing old spreadsheets.
            </Text>
            <Button onClick={() => navigate('/admin/users')} style={{ background: '#0b5b40', borderRadius: 12 }}>
              Open Administration
            </Button>
          </div>
          )}

          {sections.includes('cws') && (
          <div style={{ background: '#fff', borderRadius: 18, padding: 24, border: '1px solid #e2e0dc', boxShadow: '0 6px 24px rgba(20, 34, 20, 0.04)' }}>
            <Text fw={700} size="xl" mb="xs">CWS</Text>
            <Text c="dimmed" size="sm" mb="lg">
              Field operations, cherry reception, process registration, and lot processing.
            </Text>
            <Button onClick={() => navigate('/cws/dashboard')} style={{ background: '#0b5b40', borderRadius: 12 }}>
              Open CWS
            </Button>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading, logout } = useAuth();
  const [navOpened, { toggle: toggleNav, close: closeNav }] = useDisclosure(false);

  // Tapping a nav link closes the mobile drawer instead of leaving it open over the new page.
  useEffect(() => {
    closeNav();
  }, [location.pathname, closeNav]);

  const isLoginPage = location.pathname === '/';
  const isDashboardPage = location.pathname === '/dashboard';

  const currentSection: Section | null = sectionForPath(location.pathname);

  const visibleSections = currentSection === 'drymill'
    ? [navSections[0]]
    : currentSection === 'cws'
      ? [navSections[1]]
      : currentSection === 'admin'
        ? [navSections[2]]
        : [];
  const isAccountPage = location.pathname === '/account/password';
  const hideNavbar = isDashboardPage || isAccountPage || location.pathname === '/sync';

  if (loading) {
    return (
      <Center h="100vh">
        <Loader color="coffee" />
      </Center>
    );
  }

  if (isLoginPage) {
    return <LoginPage />;
  }

  // Every other page needs a signed-in user; remember where they were going.
  if (!user) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  // A temporary password (new account or admin reset) must be replaced before anything else.
  if (user.must_change_password && !isAccountPage) {
    return <Navigate to="/account/password" replace />;
  }

  // A user without the role for this section is sent to the section chooser.
  if (currentSection && !canAccessSection(user, currentSection)) {
    return <Navigate to="/dashboard" replace />;
  }

  const hasSeveralSections = allowedSections(user).length > 1;
  const roleSummary = user.roles
    .map((assignment) => (assignment.facility ? `${assignment.role_name} · ${assignment.facility.name}` : assignment.role_name))
    .join(', ');

  const handleLogout = async () => {
    const { pending, failed } = getSyncStatus();
    if (pending + failed > 0) {
      const ok = await confirmAction({
        title: 'Saves are still waiting',
        message: `${pending + failed} save(s) made on this device have not reached the server yet. They stay on this device and are sent the next time you sign in here. Sign out anyway?`,
        confirmLabel: 'Sign out',
        danger: true,
      });
      if (ok === null) return;
    }
    logout();
    navigate('/', { replace: true });
  };

  return (
    <AppShell
      navbar={{ width: 250, breakpoint: 'sm', collapsed: { mobile: hideNavbar || !navOpened, desktop: hideNavbar } }}
      header={{ height: 56 }}
      padding="lg"
    >
      <AppShell.Header style={{ background: '#f5f4f1', color: '#1a1a1a', border: 'none', boxShadow: 'none' }}>
        <Group h="100%" px="md" justify="space-between">
          <Group gap={8} align="center">
            {!hideNavbar && <Burger opened={navOpened} onClick={toggleNav} hiddenFrom="sm" size="sm" aria-label="Toggle navigation" />}
            <img src="/baho-image.jpg" alt="BAHO coffee company" style={{ height: 52, width: 'auto', display: 'block', objectFit: 'contain' }} />
          </Group>
          <Group gap="sm">
            {currentSection && hasSeveralSections && (
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
            <SyncIndicator />
            <Text size="sm" fw={600} c="#3d5140" visibleFrom="sm">Crop year 2026</Text>
            <Stack gap={0} align="flex-end" visibleFrom="sm">
              <Text size="sm" fw={700} c="#1a1a1a">{user.full_name}</Text>
              <Text size="xs" c="dimmed" lineClamp={1} maw={320}>{roleSummary || 'No role assigned'}</Text>
            </Stack>
            <Button
              size="compact-sm"
              variant="subtle"
              color="dark"
              leftSection={<IconKey size={14} />}
              onClick={() => navigate('/account/password')}
              visibleFrom="sm"
            >
              Password
            </Button>
            <Button
              size="compact-sm"
              variant="light"
              color="dark"
              leftSection={<IconLogout size={14} />}
              onClick={() => void handleLogout()}
            >
              Sign out
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

      {!hideNavbar && (
        <AppShell.Navbar style={{ background: '#2a1a12', border: 'none' }} p="sm">
          <ScrollArea>
            {visibleSections.map((section) => (
              <div key={section.label} style={{ marginBottom: 20 }}>
                <Text size="xs" fw={700} c="gray.5" tt="uppercase" px="xs" mb={6}>
                  {section.label}
                </Text>
                {section.items.filter((item) => !item.adminOnly || isAdmin(user)).map((item) => {
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
          <Route path="/account/password" element={<ChangePasswordPage />} />
          <Route path="/sync" element={<SyncPage />} />
          <Route path="/drymill/stock" element={<StockUpdatePage />} />
          <Route path="/drymill/ledger" element={<StockLedgerPage />} />
          <Route path="/cws/farmers" element={<FarmersPage />} />
          <Route path="/cws/labor" element={<LaborPage />} />
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/sms" element={<SmsOutboxPage />} />
          <Route path="/admin/imports" element={<ImportsPage />} />
          <Route path="/drymill/sources" element={<SourceRegistryPage />} />
          <Route path="/drymill/processes" element={<ProcessesPage />} />
          <Route path="/drymill/processing" element={<ParchProcessingPage />} />
          <Route path="/drymill/export" element={<ExportUpdatesPage />} />
          <Route path="/cws/dashboard" element={<CwsDashboardPage />} />
          <Route path="/reception" element={<CherryReceiptForm />} />
          <Route path="/processing" element={<ProcessingLotForm />} />
          <Route path="/cws/lots-report" element={<ProcessingLotReportPage />} />
          <Route path="/cws/transfers" element={<CwsTransfersPage />} />
          <Route path="/cws/process" element={<ProcessOnCwsPage />} />
          <Route path="/cws/stations" element={<CwsStationsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell.Main>
    </AppShell>
  );
}

export default App;
