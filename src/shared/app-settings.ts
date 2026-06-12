/**
 * Application-level user settings, persisted across sessions via localStorage.
 * Tauri WebView exposes localStorage natively, so no extra plugin dependency is needed.
 */
import type { QuantityTemplate } from './types';
import { DEFAULT_QUANTITY_TEMPLATE } from './constants';

/** Application-level user settings (persisted across sessions). */
export interface AppSettings {
  /** Filename quantity recognition template */
  quantityTemplate: QuantityTemplate;
}

/** localStorage key for persisted settings */
const SETTINGS_KEY = 'png-layout-tool-settings';

/** Default settings applied on first run or when storage is unreadable */
export const DEFAULT_SETTINGS: AppSettings = {
  quantityTemplate: { ...DEFAULT_QUANTITY_TEMPLATE },
};

/** Merge a partially-parsed settings object over defaults (forward-compatible). */
function mergeSettings(partial: Partial<AppSettings> | null): AppSettings {
  return {
    quantityTemplate: {
      ...DEFAULT_QUANTITY_TEMPLATE,
      ...(partial?.quantityTemplate ?? {}),
    },
  };
}

/**
 * Load settings from localStorage, merged over defaults.
 * Returns defaults on any parse/storage error so the app never blocks on bad data.
 */
export function loadSettings(): AppSettings {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return mergeSettings(parsed);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Persist settings to localStorage. Silently ignores storage failures (e.g. quota). */
export function saveSettings(settings: AppSettings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage full or blocked — settings stay in-memory only for this session
  }
}
