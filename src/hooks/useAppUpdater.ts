import { useState, useCallback, useRef } from 'react';
import { getPlatformAPI } from '../shared/ipc';
import type { UpdateCheckResult, UpdateDownloadEvent } from '../shared/ipc';

import { showToast } from '../components/Toast';

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

/** 将更新器技术错误映射为中文提示 */
function friendlyUpdateError(err: unknown, context: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('Network'))
    return `${context}失败：网络连接错误，请检查网络后重试`;
  if (msg.includes('signature') || msg.includes('verify'))
    return `${context}失败：更新包验证失败`;
  if (msg.includes('permission') || msg.includes('Permission'))
    return `${context}失败：权限不足，请以管理员身份运行`;
  return `${context}失败：${msg}`;
}

export function useAppUpdater() {
  const [state, setState] = useState<UpdaterState>(INITIAL_STATE);
  const updateRef = useRef<UpdateCheckResult | null>(null);

  const checkForUpdate = useCallback(async () => {
    setState((prev) => ({ ...prev, checking: true, error: null }));
    try {
      const platform = getPlatformAPI();
      const update = await platform.checkForUpdate();
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
      const errorMsg = friendlyUpdateError(err, '检查更新');
      console.error('[updater] check failed:', err);
      showToast('error', errorMsg);
      setState((prev) => ({
        ...prev,
        checking: false,
        error: errorMsg,
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

      await update.downloadAndInstall((event: UpdateDownloadEvent) => {
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

      const platform = getPlatformAPI();
      await platform.relaunch();
    } catch (err) {
      const errorMsg = friendlyUpdateError(err, '下载更新');
      console.error('[updater] download/install failed:', err);
      showToast('error', errorMsg);
      setState((prev) => ({
        ...prev,
        downloading: false,
        installing: false,
        error: errorMsg,
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
