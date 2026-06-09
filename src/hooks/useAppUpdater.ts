import { useState, useCallback, useRef } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

interface UpdateInfo {
  version: string;
  date?: string;
  body?: string;
}

interface UpdaterState {
  checking: boolean;
  updateAvailable: boolean;
  downloading: boolean;
  downloadProgress: number;
  installing: boolean;
  error: string | null;
  updateInfo: UpdateInfo | null;
}

const INITIAL_STATE: UpdaterState = {
  checking: false,
  updateAvailable: false,
  downloading: false,
  downloadProgress: 0,
  installing: false,
  error: null,
  updateInfo: null,
};

export function useAppUpdater() {
  const [state, setState] = useState<UpdaterState>(INITIAL_STATE);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateRef = useRef<any>(null);

  const checkForUpdate = useCallback(async () => {
    setState((prev) => ({ ...prev, checking: true, error: null }));
    try {
      const update = await check();
      if (update) {
        updateRef.current = update;
        setState((prev) => ({
          ...prev,
          checking: false,
          updateAvailable: true,
          updateInfo: {
            version: update.version,
            date: update.date,
            body: update.body,
          },
        }));
        return true;
      } else {
        setState((prev) => ({
          ...prev,
          checking: false,
          updateAvailable: false,
        }));
        return false;
      }
    } catch (err) {
      console.error('[updater] check failed:', err);
      setState((prev) => ({
        ...prev,
        checking: false,
        error: err instanceof Error ? err.message : String(err),
      }));
      return false;
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    const update = updateRef.current;
    if (!update) return;

    setState((prev) => ({
      ...prev,
      downloading: true,
      downloadProgress: 0,
      error: null,
    }));

    try {
      let downloaded = 0;
      let contentLength = 0;

      await update.downloadAndInstall((event: any) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength ?? 0;
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              const progress = Math.round((downloaded / contentLength) * 100);
              setState((prev) => ({ ...prev, downloadProgress: progress }));
            }
            break;
          case 'Finished':
            setState((prev) => ({
              ...prev,
              downloading: false,
              installing: true,
              downloadProgress: 100,
            }));
            break;
        }
      });

      await relaunch();
    } catch (err) {
      console.error('[updater] download/install failed:', err);
      setState((prev) => ({
        ...prev,
        downloading: false,
        installing: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, []);

  const dismissUpdate = useCallback(() => {
    setState((prev) => ({
      ...prev,
      updateAvailable: false,
      updateInfo: null,
    }));
    updateRef.current = null;
  }, []);

  return {
    ...state,
    checkForUpdate,
    downloadAndInstall,
    dismissUpdate,
  };
}
