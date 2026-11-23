/**
 * The Baho design system: one place for colours, shapes and component styles.
 * Every screen (web and Android app) picks these up through MantineProvider,
 * so the whole platform changes together. Change a look here, not per screen.
 */
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Checkbox,
  createTheme,
  Drawer,
  Loader,
  Menu,
  Modal,
  NavLink,
  Notification,
  Paper,
  Pagination,
  SegmentedControl,
  Table,
  Tabs,
  ThemeIcon,
  Tooltip,
  type MantineColorsTuple,
} from '@mantine/core';

// Baho green (brand, from the logo / sign-in page): primary actions, active states.
const baho: MantineColorsTuple = [
  '#e8f6f0', '#d2ebe1', '#a5d6c2', '#74c0a1', '#4bad85',
  '#2f9a71', '#1d8762', '#0b5b40', '#084a34', '#053a28',
];

// Coffee (roast brown): accents and secondary highlights.
const coffee: MantineColorsTuple = [
  '#fbf3ee', '#f1ddd0', '#e4bda2', '#d79b72', '#cc7d4a',
  '#c4682f', '#a8502a', '#8a4b2e', '#6e3a24', '#532a1a',
];

const inputStyles = {
  label: { fontWeight: 600, marginBottom: 6, color: 'var(--mantine-color-dark-6)' },
  input: { borderColor: 'var(--baho-border)', backgroundColor: '#fff' },
  description: { marginBottom: 6 },
};

const inputDefaults = { radius: 'md', size: 'sm' } as const;

export const theme = createTheme({
  primaryColor: 'baho',
  primaryShade: 7,
  colors: { baho, coffee },
  defaultRadius: 'md',
  fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  headings: {
    fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontWeight: '750',
  },
  shadows: {
    xs: '0 1px 2px rgba(16, 35, 28, 0.05)',
    sm: '0 1px 3px rgba(16, 35, 28, 0.06), 0 1px 2px rgba(16, 35, 28, 0.04)',
    md: '0 8px 24px rgba(16, 35, 28, 0.08)',
    lg: '0 16px 40px rgba(16, 35, 28, 0.12)',
    xl: '0 24px 60px rgba(16, 35, 28, 0.16)',
  },
  cursorType: 'pointer',
  components: {
    Card: Card.extend({
      defaultProps: { radius: 'lg', padding: 'lg', withBorder: true, shadow: 'sm' },
      styles: { root: { borderColor: 'var(--baho-border)', backgroundColor: '#fff' } },
    }),
    Paper: Paper.extend({ defaultProps: { radius: 'lg' } }),
    Button: Button.extend({
      defaultProps: { radius: 'md' },
      styles: { root: { fontWeight: 650, letterSpacing: 0.1 } },
    }),
    ActionIcon: ActionIcon.extend({ defaultProps: { radius: 'md' } }),
    Badge: Badge.extend({
      defaultProps: { radius: 'xl', variant: 'light' },
      styles: { root: { textTransform: 'none', fontWeight: 650, letterSpacing: 0 } },
    }),
    ThemeIcon: ThemeIcon.extend({ defaultProps: { radius: 'md' } }),
    TextInput: { defaultProps: inputDefaults, styles: inputStyles },
    PasswordInput: { defaultProps: inputDefaults, styles: inputStyles },
    NumberInput: { defaultProps: inputDefaults, styles: inputStyles },
    Textarea: { defaultProps: inputDefaults, styles: inputStyles },
    Select: { defaultProps: { ...inputDefaults, comboboxProps: { radius: 'md', shadow: 'md' } }, styles: inputStyles },
    MultiSelect: { defaultProps: { ...inputDefaults, comboboxProps: { radius: 'md', shadow: 'md' } }, styles: inputStyles },
    FileInput: { defaultProps: inputDefaults, styles: inputStyles },
    DatePickerInput: { defaultProps: inputDefaults, styles: inputStyles },
    Checkbox: Checkbox.extend({ defaultProps: { radius: 'sm' } }),
    SegmentedControl: SegmentedControl.extend({ defaultProps: { radius: 'xl' } }),
    Tabs: Tabs.extend({ defaultProps: { radius: 'md' } }),
    Table: Table.extend({
      defaultProps: { verticalSpacing: 'sm', horizontalSpacing: 'md', highlightOnHover: true },
      styles: {
        th: {
          fontSize: 12,
          fontWeight: 650,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          color: 'var(--mantine-color-gray-6)',
          backgroundColor: '#fafbfa',
          borderBottom: '1px solid var(--baho-border)',
        },
        td: { borderBottom: '1px solid #f0f2f1' },
      },
    }),
    Modal: Modal.extend({
      defaultProps: { radius: 'lg', centered: true, overlayProps: { backgroundOpacity: 0.35, blur: 3 } },
      styles: { title: { fontWeight: 700, fontSize: 18 } },
    }),
    Drawer: Drawer.extend({
      defaultProps: { overlayProps: { backgroundOpacity: 0.35, blur: 3 } },
      styles: { title: { fontWeight: 700, fontSize: 18 } },
    }),
    Menu: Menu.extend({ defaultProps: { radius: 'md', shadow: 'md' } }),
    Tooltip: Tooltip.extend({ defaultProps: { radius: 'md' } }),
    NavLink: NavLink.extend({ styles: { root: { borderRadius: 10 }, label: { fontWeight: 550 } } }),
    Notification: Notification.extend({ defaultProps: { radius: 'lg' } }),
    Pagination: Pagination.extend({ defaultProps: { radius: 'md' } }),
    Loader: Loader.extend({ defaultProps: { color: 'baho' } }),
  },
});
