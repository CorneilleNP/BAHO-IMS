import { useMediaQuery } from '@mantine/hooks';

/**
 * The one "is this a phone?" rule for the whole app (and the Android app):
 * narrower than Mantine's `sm` breakpoint (48em = 768px).
 * Mobile components and the phone layouts of shared components use it.
 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 48em)', false, { getInitialValueInEffect: false }) ?? false;
}
