/**
 * Centralized phone UI (website on a phone and the Android app).
 * Screens don't build their own phone layouts: they use the shared components
 * (DataTable, PageHeader...), which switch to these on small screens.
 *
 *   useIsMobile     the one "is this a phone?" rule
 *   MobileAppBar    top bar: menu, page title, sync status, account menu
 *   MobileTabBar    bottom navigation: section's main screens + More
 *   MobileCardList  DataTable rows as cards (used by DataTable automatically)
 *   MobileMoreSheet "More": bottom sheet of icon tiles for screens not on the tab bar
 */
export { useIsMobile } from './useIsMobile';
export { MobileAppBar } from './MobileAppBar';
export { MobileTabBar, type MobileTab } from './MobileTabBar';
export { MobileCardList } from './MobileCardList';
export { MobileMoreSheet, type MoreItem } from './MobileMoreSheet';
