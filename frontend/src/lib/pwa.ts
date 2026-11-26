/**
 * The website as an installable app (PWA): service worker + "Install app".
 *
 * - The service worker (public build file /sw.js) keeps the app's own files on
 *   the device so the website opens without internet. Data offline is handled
 *   by lib/offline, as before.
 * - Chrome/Edge/Android fire `beforeinstallprompt`: we keep it and show our own
 *   "Install app" button. iPhone/iPad Safari has no such event: we show how to
 *   use Share > Add to Home Screen instead.
 * - Nothing here runs inside the Android app (it is already installed).
 */
import { useSyncExternalStore } from 'react';
import { isNative } from './platform';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallState {
  /** Chrome/Edge/Android: our button can open the browser's install dialog. */
  canPrompt: boolean;
  /** iPhone/iPad Safari: install by hand from the Share menu. */
  iosManual: boolean;
  /** Already opened as an installed app (or this is the Android app). */
  installed: boolean;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function standalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true;
}

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

let state: InstallState = compute();

function compute(): InstallState {
  const installed = isNative || standalone();
  return { canPrompt: !installed && deferred !== null, iosManual: !installed && isIosSafari(), installed };
}

function emit() {
  state = compute();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

/** Opens the browser's install dialog. Resolves true if the person installed it. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  emit();
  return outcome === 'accepted';
}

/** Call once at startup (main.tsx). */
export function initPwa(): void {
  if (isNative || typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // we show our own button instead of the mini-infobar
    deferred = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', emit);
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Not fatal: the website still works online without it.
      });
    });
  }
}
