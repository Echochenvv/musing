/**
 * Runtime configuration store · single source of truth for all credentials.
 *
 * Storage strategy:
 *   - Secret fields  → expo-secure-store (OS Keychain / Keystore, encrypted)
 *   - Normal fields  → AsyncStorage (plain JSON, OK for non-sensitive IDs)
 *
 * Loading: read saved values from storage (Settings screen). Empty until set.
 * No build-time .env fallback — every install must be configured via Settings.
 *
 * Reactivity:
 *   - First read primes the in-memory cache.
 *   - SettingsScreen calls saveConfig(), which writes to storage and
 *     notifies subscribers; any `useConfig()` consumer re-renders.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';

export type AssigneeType = 'agent' | 'member';

export type MusingConfig = {
  iflytekAppid: string;
  iflytekApiKey: string;
  iflytekApiSecret: string;
  multicaServerUrl: string;
  multicaToken: string;
  multicaWorkspaceId: string;
  multicaDefaultAssigneeId: string;
  multicaDefaultAssigneeType: AssigneeType;
};

const SECRET_FIELDS = [
  'iflytekAppid',
  'iflytekApiKey',
  'iflytekApiSecret',
  'multicaToken',
] as const;

const NORMAL_FIELDS = [
  'multicaServerUrl',
  'multicaWorkspaceId',
  'multicaDefaultAssigneeId',
  'multicaDefaultAssigneeType',
] as const;

const SECURE_KEY = (f: string) => `musing.secret.${f}`;
const ASYNC_KEY = 'musing.config.v1';

export const EMPTY_CONFIG: MusingConfig = {
  iflytekAppid: '',
  iflytekApiKey: '',
  iflytekApiSecret: '',
  multicaServerUrl: '',
  multicaToken: '',
  multicaWorkspaceId: '',
  multicaDefaultAssigneeId: '',
  multicaDefaultAssigneeType: 'agent',
};

let cached: MusingConfig | null = null;
let pending: Promise<MusingConfig> | null = null;
type Listener = (c: MusingConfig) => void;
const listeners: Set<Listener> = new Set();

async function readSecret(field: string): Promise<string> {
  try {
    return (await SecureStore.getItemAsync(SECURE_KEY(field))) || '';
  } catch {
    return '';
  }
}

async function writeSecret(field: string, value: string): Promise<void> {
  if (value) {
    await SecureStore.setItemAsync(SECURE_KEY(field), value);
  } else {
    try {
      await SecureStore.deleteItemAsync(SECURE_KEY(field));
    } catch {
      // ignore — key may not exist
    }
  }
}

async function readNormal(): Promise<Partial<MusingConfig>> {
  try {
    const raw = await AsyncStorage.getItem(ASYNC_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<MusingConfig>;
  } catch {
    return {};
  }
}

async function loadFromStorage(): Promise<MusingConfig> {
  const [appid, apiKey, apiSecret, mToken, normal] = await Promise.all([
    readSecret('iflytekAppid'),
    readSecret('iflytekApiKey'),
    readSecret('iflytekApiSecret'),
    readSecret('multicaToken'),
    readNormal(),
  ]);

  return {
    iflytekAppid: appid,
    iflytekApiKey: apiKey,
    iflytekApiSecret: apiSecret,
    multicaToken: mToken,
    multicaServerUrl: normal.multicaServerUrl || '',
    multicaWorkspaceId: normal.multicaWorkspaceId || '',
    multicaDefaultAssigneeId: normal.multicaDefaultAssigneeId || '',
    multicaDefaultAssigneeType:
      (normal.multicaDefaultAssigneeType as AssigneeType) || 'agent',
  };
}

/** Sync read from in-memory cache. Returns empty config until first `ensureConfig()` resolves. */
export function getCachedConfig(): MusingConfig {
  return cached ?? EMPTY_CONFIG;
}

/** Resolve current config (cached after first call). */
export async function ensureConfig(): Promise<MusingConfig> {
  if (cached) return cached;
  if (!pending) {
    pending = loadFromStorage().then((c) => {
      cached = c;
      pending = null;
      return c;
    });
  }
  return pending;
}

/** Force reload from storage, e.g. after Settings save. */
export async function refreshConfig(): Promise<MusingConfig> {
  const c = await loadFromStorage();
  cached = c;
  listeners.forEach((l) => l(c));
  return c;
}

export async function saveConfig(next: MusingConfig): Promise<MusingConfig> {
  await Promise.all([
    writeSecret('iflytekAppid', next.iflytekAppid),
    writeSecret('iflytekApiKey', next.iflytekApiKey),
    writeSecret('iflytekApiSecret', next.iflytekApiSecret),
    writeSecret('multicaToken', next.multicaToken),
    AsyncStorage.setItem(
      ASYNC_KEY,
      JSON.stringify({
        multicaServerUrl: next.multicaServerUrl,
        multicaWorkspaceId: next.multicaWorkspaceId,
        multicaDefaultAssigneeId: next.multicaDefaultAssigneeId,
        multicaDefaultAssigneeType: next.multicaDefaultAssigneeType,
      } satisfies Partial<MusingConfig>),
    ),
  ]);
  return refreshConfig();
}

/** Drop saved values for one or all fields (handy for "Reset" button). */
export async function clearAllConfig(): Promise<MusingConfig> {
  await Promise.all([
    writeSecret('iflytekAppid', ''),
    writeSecret('iflytekApiKey', ''),
    writeSecret('iflytekApiSecret', ''),
    writeSecret('multicaToken', ''),
    AsyncStorage.removeItem(ASYNC_KEY),
  ]);
  return refreshConfig();
}

/** React hook · returns null until first load completes, then live-updates. */
export function useConfig(): MusingConfig | null {
  const [c, setC] = useState<MusingConfig | null>(cached);
  useEffect(() => {
    let mounted = true;
    if (!cached) {
      ensureConfig().then((v) => {
        if (mounted) setC(v);
      });
    }
    listeners.add(setC);
    return () => {
      mounted = false;
      listeners.delete(setC);
    };
  }, []);
  return c;
}

/** Quick predicates for "is this group ready to use" UI dots. */
export function isIflytekConfigured(c: MusingConfig | null): boolean {
  return !!(
    c &&
    c.iflytekAppid &&
    c.iflytekApiKey &&
    c.iflytekApiSecret
  );
}

export function isMulticaConfigured(c: MusingConfig | null): boolean {
  return !!(
    c &&
    c.multicaServerUrl &&
    c.multicaToken &&
    c.multicaWorkspaceId
  );
}

export { SECRET_FIELDS, NORMAL_FIELDS };
