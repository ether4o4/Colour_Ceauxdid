/**
 * Cross-platform secure storage wrapper.
 *
 * - Native (iOS / Android): uses expo-secure-store → OS keychain (Keychain
 *   Services on iOS, encrypted SharedPreferences on Android).
 * - Web: falls back to AsyncStorage (which is localStorage under the hood)
 *   because browsers don't expose an OS keychain to JS. A lightweight obfuscation
 *   is applied so plain-text secrets don't show up in devtools at a glance.
 *
 * API mirrors expo-secure-store's setItemAsync / getItemAsync / deleteItemAsync.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Keys are namespaced so we can migrate or purge together.
const PREFIX = 'cc_sec_';

// ── Web obfuscation (XOR + base64). NOT cryptographic. Prevents at-a-glance
// readability in devtools. Real protection on web would need WebCrypto + a
// user passphrase, which is a separate UX flow.
const WEB_SALT = 'colour-ceauxdid-v1';

function xorB64(input: string, salt: string): string {
  const out: number[] = [];
  for (let i = 0; i < input.length; i++) {
    out.push(input.charCodeAt(i) ^ salt.charCodeAt(i % salt.length));
  }
  // btoa works on web; base64 shim via Buffer on native but we only run this on web
  const bin = String.fromCharCode(...out);
  return typeof btoa !== 'undefined' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
}

function xorB64Decode(input: string, salt: string): string {
  const bin = typeof atob !== 'undefined' ? atob(input) : Buffer.from(input, 'base64').toString('binary');
  const out: number[] = [];
  for (let i = 0; i < bin.length; i++) {
    out.push(bin.charCodeAt(i) ^ salt.charCodeAt(i % salt.length));
  }
  return String.fromCharCode(...out);
}

// Lazy require so web bundle doesn't pull in the native module.
let _secureStore: any = null;
async function getSecureStore() {
  if (Platform.OS === 'web') return null;
  if (_secureStore) return _secureStore;
  try {
    _secureStore = await import('expo-secure-store');
    return _secureStore;
  } catch {
    return null;
  }
}

export async function setSecret(key: string, value: string): Promise<void> {
  const ss = await getSecureStore();
  if (ss) {
    try {
      await ss.setItemAsync(PREFIX + key, value);
      return;
    } catch {
      // fall through to AsyncStorage
    }
  }
  const stored = Platform.OS === 'web' ? 'x1:' + xorB64(value, WEB_SALT) : value;
  await AsyncStorage.setItem(PREFIX + key, stored);
}

export async function getSecret(key: string): Promise<string | null> {
  const ss = await getSecureStore();
  if (ss) {
    try {
      const v = await ss.getItemAsync(PREFIX + key);
      if (v != null) return v;
      // fall through in case earlier writes landed in AsyncStorage
    } catch {}
  }
  const raw = await AsyncStorage.getItem(PREFIX + key);
  if (!raw) return null;
  if (raw.startsWith('x1:')) {
    try { return xorB64Decode(raw.slice(3), WEB_SALT); } catch { return null; }
  }
  return raw;
}

export async function deleteSecret(key: string): Promise<void> {
  const ss = await getSecureStore();
  if (ss) { try { await ss.deleteItemAsync(PREFIX + key); } catch {} }
  await AsyncStorage.removeItem(PREFIX + key);
}
