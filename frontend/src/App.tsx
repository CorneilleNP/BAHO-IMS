import { AppShell, Burger, Button, Card, Center, Group, Loader, NavLink as MantineNavLink, ScrollArea, SimpleGrid, Stack, Text, ThemeIcon, Title, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useEffect } from 'react';
import type { ComponentType } from 'react';
import {
  IconArrowRight,
  IconBuildingWarehouse,
  IconChartBar,
  IconClipboardList,
  IconCoffee,
  IconCloudUpload,
  IconDroplet,
  IconFileImport,
  IconFileSpreadsheet,
  IconCash,
  IconChartPie,
  IconReceipt2,
  IconKey,
  IconTrash,
  IconLayoutGrid,
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
import { TrashPage } from './features/trash/TrashPage';
import { DetailedReportsPage } from './features/reports/DetailedReportsPage';
import { FinanceDashboardPage } from './features/finance/FinanceDashboardPage';
import { ExpensesPage } from './features/finance/ExpensesPage';
import { FundsPage } from './features/finance/FundsPage';
import { FinanceReportsPage } from './features/finance/FinanceReportsPage';
import { SyncIndicator } from './components/SyncIndicator';
import { InstallAppCard } from './components/InstallAppCard';
import { MobileAppBar, MobileMoreSheet, MobileTabBar, useIsMobile, type MobileTab } from './components/mobile';
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
      { to: '/drymill/reports', label: 'Detailed Reports', icon: IconFileSpreadsheet },
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
      { to: '/cws/reports', label: 'Detailed Reports', icon: IconFileSpreadsheet },
      { to: '/cws/labor', label: 'Casual Labor', icon: IconUsers },
      { to: '/cws/process', label: 'Register Process', icon: IconUsers },
      { to: '/cws/stations', label: 'Register CWS', icon: IconBuildingWarehouse, adminOnly: true },
    ],
  },
  {
    label: 'Finance',
    items: [
      { to: '/finance/dashboard', label: 'Finance Dashboard', icon: IconChartPie },
      { to: '/finance/expenses', label: 'Expenses', icon: IconReceipt2 },
      { to: '/finance/funds', label: 'Funds to Stations', icon: IconCash },
      { to: '/finance/reports', label: 'Finance Reports', icon: IconFileSpreadsheet },
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

// Shown under every section: offline queue and own account.
const accountSection: { label: string; items: NavItem[] } = {
  label: 'This device & account',
  items: [
    { to: '/sync', label: 'Sync & offline', icon: IconCloudUpload },
    { to: '/trash', label: 'Trash', icon: IconTrash },
    { to: '/account/password', label: 'Change password', icon: IconKey },
  ],
};

const SECTION_NAV: Record<Section, number> = { drymill: 0, cws: 1, finance: 2, admin: 3 };

// Phone bottom bar: the screens used most in each section (the rest is under "More").
const MOBILE_TABS: Record<Section, string[]> = {
  cws: ['/cws/dashboard', '/reception', '/cws/farmers', '/cws/labor'],
  drymill: ['/drymill/stock', '/drymill/ledger', '/drymill/processing', '/drymill/export'],
  finance: ['/finance/dashboard', '/finance/expenses', '/finance/funds', '/finance/reports'],
  admin: ['/admin/users', '/admin/sms', '/admin/imports'],
};

const SHORT_LABELS: Record<string, string> = {
  '/reception': 'Reception',
  '/drymill/stock': 'Stock',
  '/drymill/ledger': 'Ledger',
  '/drymill/processing': 'Milling',
  '/drymill/export': 'Export',
  '/admin/imports': 'Import',
  '/admin/sms': 'SMS',
  '/cws/labor': 'Labor',
  '/finance/dashboard': 'Finance',
  '/finance/funds': 'Funds',
  '/finance/reports': 'Reports',
};

const ALL_ITEMS: NavItem[] = [...navSections.flatMap((s) => s.items), ...accountSection.items];

function pageTitle(pathname: string): string {
  if (pathname === '/dashboard') return 'Baho IMS';
  return ALL_ITEMS.find((item) => item.to === pathname)?.label ?? 'Baho IMS';
}

function mobileTabs(section: Section | null): MobileTab[] {
  if (!section) return [];
  return MOBILE_TABS[section]
    .map((to) => ALL_ITEMS.find((item) => item.to === to))
    .filter((item): item is NavItem => Boolean(item))
    .map((item) => ({ to: item.to, label: SHORT_LABELS[item.to] ?? item.label, icon: item.icon }));
}

const SECTION_CARDS: Array<{ section: Section; title: string; text: string; to: string; icon: ComponentType<{ size?: number }>; color: string }> = [
  { section: 'cws', title: 'CWS', text: 'Cherry reception, farmers, processing lots, labor and transfers.', to: '/cws/dashboard', icon: IconCoffee, color: 'baho' },
  { section: 'drymill', title: 'Dry Mill', text: 'HQ stock, parchment milling, stock ledger and export.', to: '/drymill/stock', icon: IconBuildingWarehouse, color: 'coffee' },
  { section: 'finance', title: 'Finance', text: 'Funds given to each CWS, expenses, cherry and labor payments, balance and reports.', to: '/finance/dashboard', icon: IconCash, color: 'teal' },
  { section: 'admin', title: 'Administration', text: 'Users and roles, SMS outbox, importing old sheets.', to: '/admin/users', icon: IconUserCog, color: 'gray' },
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

  const firstName = user?.full_name.split(' ')[0] ?? '';
  return (
    <Stack maw={980} mx="auto" py={{ base: 'md', sm: 48 }} px={{ base: 0, sm: 'md' }} gap="xl">
      <div>
        <Text c="baho.7" fw={700} tt="uppercase" size="xs" lts={0.6}>Baho IMS</Text>
        <Title order={1} fz={{ base: 28, sm: 38 }} lh={1.15}>
          Hello{firstName ? `, ${firstName}` : ''} 👋
        </Title>
        <Text c="dimmed" mt={6}>Where do you want to work today?</Text>
      </div>
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
        {SECTION_CARDS.filter((card) => sections.includes(card.section)).map((card) => (
          <UnstyledButton key={card.section} onClick={() => navigate(card.to)} className="section-card">
            <Card h="100%" padding="xl">
              <Stack gap="md" h="100%">
                <ThemeIcon size={52} radius="lg" variant="light" color={card.color}>
                  <card.icon size={28} />
                </ThemeIcon>
                <div style={{ flex: 1 }}>
                  <Text fw={750} fz={20}>{card.title}</Text>
                  <Text c="dimmed" size="sm" mt={4}>{card.text}</Text>
                </div>
                <Group gap={6} c="baho.7">
                  <Text fw={650} size="sm">Open</Text>
                  <IconArrowRight size={16} />
                </Group>
              </Stack>
            </Card>
          </UnstyledButton>
        ))}
      </SimpleGrid>
      <InstallAppCard dismissible />
    </Stack>
  );
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading, logout } = useAuth();
  const [navOpened, { toggle: toggleNav, close: closeNav }] = useDisclosure(false);
  const isMobile = useIsMobile();

  // Tapping a nav link closes the mobile drawer instead of leaving it open over the new page.
  useEffect(() => {
    closeNav();
  }, [location.pathname, closeNav]);

  const isLoginPage = location.pathname === '/';
  const isDashboardPage = location.pathname === '/dashboard';

  const currentSection: Section | null = sectionForPath(location.pathname);

  const isAccountPage = location.pathname === '/account/password';
  // On a section page: that section's menu. On shared pages (Sync, password):
  // the menus of every section the user may open, so there is always a way back.
  const sectionMenus = currentSection
    ? [navSections[SECTION_NAV[currentSection]]]
    : allowedSections(user).map((section) => navSections[SECTION_NAV[section]]);
  const severalSections = allowedSections(user).length > 1;
  const accountMenu: { label: string; items: NavItem[] } = severalSections
    ? { ...accountSection, items: [{ to: '/dashboard', label: 'All sections', icon: IconLayoutGrid }, ...accountSection.items] }
    : accountSection;
  const visibleSections = [...sectionMenus, accountMenu];
  // Bottom tabs: this section's main screens; on shared pages, the user's first section.
  const tabs = mobileTabs(currentSection ?? allowedSections(user)[0] ?? null);
  // Only the section chooser (and the forced first password change) has no menu.
  const hideNavbar = isDashboardPage || (isAccountPage && Boolean(user?.must_change_password));

  if (loading) {
    return (
      <Center h="100vh">
        <Loader />
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
      navbar={{ width: 256, breakpoint: 'sm', collapsed: { mobile: true, desktop: hideNavbar } }}
      header={{ height: isMobile ? 60 : 56 }}
      footer={{ height: 68, collapsed: !isMobile || hideNavbar || tabs.length === 0 }}
      padding={isMobile ? 'sm' : 'lg'}
    >
      <AppShell.Header
        style={{
          background: '#ffffff',
          color: '#15211c',
          border: 'none',
          borderBottom: '1px solid var(--baho-border)',
        }}
      >
        {isMobile ? (
          <MobileAppBar
            title={pageTitle(location.pathname)}
            user={user}
            onMenu={hideNavbar ? undefined : toggleNav}
            onSignOut={() => void handleLogout()}
          />
        ) : (
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
        )}
      </AppShell.Header>

      {isMobile && !hideNavbar && tabs.length > 0 && (
        <AppShell.Footer style={{ background: 'rgba(255, 255, 255, 0.96)', backdropFilter: 'blur(10px)', borderTop: '1px solid var(--baho-border)' }}>
          <MobileTabBar tabs={tabs} onMore={toggleNav} />
        </AppShell.Footer>
      )}

      {isMobile && (
        <MobileMoreSheet
          opened={navOpened}
          onClose={closeNav}
          activePath={location.pathname}
          onNavigate={(to) => navigate(to)}
          onSignOut={() => void handleLogout()}
          groups={visibleSections.map((section) => ({
            label: section.label,
            // Screens already on the bottom bar are not repeated here.
            items: section.items.filter((item) => (!item.adminOnly || isAdmin(user)) && !tabs.some((t) => t.to === item.to)),
          })).concat(
            currentSection
              ? allowedSections(user)
                  .filter((other) => other !== currentSection)
                  .map((other) => navSections[SECTION_NAV[other]])
                  .map((section) => ({ label: section.label, items: section.items.filter((item) => !item.adminOnly || isAdmin(user)) }))
              : [],
          )}
        />
      )}

      {!hideNavbar && (
        <AppShell.Navbar style={{ background: '#ffffff', borderRight: '1px solid var(--baho-border)' }} p="sm">
          <ScrollArea>
            {visibleSections.map((section) => (
              <div key={section.label} style={{ marginBottom: 18 }}>
                <Text size="11px" fw={700} c="gray.6" tt="uppercase" lts={0.6} px="sm" mb={6} mt={6}>
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
                      leftSection={<item.icon size={19} />}
                      active={isActive}
                      variant="light"
                      color="baho"
                      style={{ marginBottom: 2, fontWeight: isActive ? 700 : 550, color: isActive ? undefined : '#3b4a44' }}
                    />
                  );
                })}
              </div>
            ))}
          </ScrollArea>
        </AppShell.Navbar>
      )}

      <AppShell.Main style={{ background: 'var(--baho-bg)' }}>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/dashboard" element={<DashboardLandingPage />} />
          <Route path="/account/password" element={<ChangePasswordPage />} />
          <Route path="/sync" element={<SyncPage />} />
          <Route path="/trash" element={<TrashPage />} />
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
          <Route path="/cws/reports" element={<DetailedReportsPage section="cws" />} />
          <Route path="/drymill/reports" element={<DetailedReportsPage section="drymill" />} />
          <Route path="/finance/dashboard" element={<FinanceDashboardPage />} />
          <Route path="/finance/expenses" element={<ExpensesPage />} />
          <Route path="/finance/funds" element={<FundsPage />} />
          <Route path="/finance/reports" element={<FinanceReportsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell.Main>
    </AppShell>
  );
}

export default App;
