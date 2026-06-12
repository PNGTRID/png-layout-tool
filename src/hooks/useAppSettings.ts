import { useState, useCallback } from 'react';
import type { AppSettings } from '../shared/app-settings';
import { loadSettings, saveSettings } from '../shared/app-settings';

/**
 * React hook for application settings backed by localStorage.
 * Loads once on init; every update is persisted immediately so changes
 * survive across sessions.
 */
export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());

  const updateSettings = useCallback((updater: (prev: AppSettings) => AppSettings) => {
    setSettings(prev => {
      const next = updater(prev);
      saveSettings(next);
      return next;
    });
  }, []);

  return { settings, updateSettings };
}
