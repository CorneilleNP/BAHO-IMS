/**
 * Where the app runs and which server it talks to.
 *
 * - In a browser (the website) the API is same-origin: "/api/v1".
 * - In the Android app (Capacitor) the page is served from the phone itself,
 *   so the API lives on a configurable server (default: production). The
 *   address is kept in app storage and can be changed on the login screen.
 */
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

export const DEFAULT_SERVER = 'https://baho.izere.work';
const SERVER_KEY = 'baho.server';

export const isNative = Capacitor.isNativePlatform();

let server = DEFAULT_SERVER;

/** Load saved settings before the app renders (call once from main.tsx). */
export async function initPlatform(): Promise<void> {
  if (!isNative) return;
  const saved = (await Preferences.get({ key: SERVER_KEY })).value;
  if (saved) server = saved;
}

export function serverUrl(): string {
  return server;
}

/** Normalise and save the server address ("baho.izere.work" -> "https://baho.izere.work"). */
export async function setServerUrl(value: string): Promise<string> {
  let url = value.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  new URL(url); // throws on nonsense
  server = url;
  await Preferences.set({ key: SERVER_KEY, value: url });
  return url;
}

export function apiBase(): string {
  if (isNative) return `${server}/api/v1`;
  return import.meta.env.VITE_API_URL ?? '/api/v1';
}

/** Small key/value storage: app storage on the phone, localStorage in the browser. */
export const kv = {
  async get(key: string): Promise<string | null> {
    if (isNative) return (await Preferences.get({ key })).value;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string | null): Promise<void> {
    if (isNative) {
      if (value === null) await Preferences.remove({ key });
      else await Preferences.set({ key, value });
      return;
    }
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      // storage unavailable: nothing persists
    }
  },
};
