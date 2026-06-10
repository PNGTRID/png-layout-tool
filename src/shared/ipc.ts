/** Options for the native save-file dialog. */
export interface SaveDialogOptions {
  /** File type filters shown in the dialog */
  filters: { name: string; extensions: string[] }[];
  /** Suggested default file path */
  defaultPath?: string;
}

/**
 * Platform abstraction layer.
 * Provides a mock-friendly interface for Tauri IPC.
 * Call setPlatformAPI() in tests to inject a mock.
 */

/** 更新器下载事件 */
export interface UpdateDownloadEvent {
  event: 'Started' | 'Progress' | 'Finished';
  data: { contentLength?: number; chunkLength: number };
}

/** 更新器检查结果 */
export interface UpdateCheckResult {
  version: string;
  date?: string;
  body?: string;
  downloadAndInstall(onEvent: (e: UpdateDownloadEvent) => void): Promise<void>;
}

export interface IPlatformAPI {
  showSaveDialog(options: SaveDialogOptions): Promise<string | null>;
  writeFile(filePath: string, data: Uint8Array): Promise<void>;
  checkForUpdate(): Promise<UpdateCheckResult | null>;
  relaunch(): Promise<void>;
}

// Production implementation — uses dynamic import to keep Tauri optional
class TauriPlatformAPI implements IPlatformAPI {
  async showSaveDialog(options: SaveDialogOptions): Promise<string | null> {
    const { save } = await import('@tauri-apps/plugin-dialog');
    return await save({
      filters: options.filters,
      defaultPath: options.defaultPath,
    });
  }

  async writeFile(filePath: string, data: Uint8Array): Promise<void> {
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    await writeFile(filePath, data);
  }

  async checkForUpdate(): Promise<UpdateCheckResult | null> {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (!update) return null;
    return {
      version: update.version,
      date: update.date,
      body: update.body,
      downloadAndInstall: update.downloadAndInstall.bind(update),
    };
  }

  async relaunch(): Promise<void> {
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  }
}

// Detect Tauri environment at runtime
const isTauri = typeof window !== 'undefined' &&
  '__TAURI_INTERNALS__' in window &&
  // Extra check: ensure the internal object is a real Tauri bridge
  typeof (window as Record<string, unknown>).__TAURI_INTERNALS__ === 'object';

// Singleton instance — replaceable for testing
let _instance: IPlatformAPI | null = null;

export function getPlatformAPI(): IPlatformAPI {
  if (!_instance) {
    _instance = isTauri ? new TauriPlatformAPI() : new NullPlatformAPI();
  }
  return _instance;
}

/** Replace the platform API (use in tests) */
export function setPlatformAPI(api: IPlatformAPI | null): void {
  _instance = api;
}

// Null-object fallback for non-Tauri environments
class NullPlatformAPI implements IPlatformAPI {
  async showSaveDialog(): Promise<string | null> {
    return null;
  }
  async writeFile(): Promise<void> {
    // no-op in browser
  }
  async checkForUpdate(): Promise<null> {
    return null;
  }
  async relaunch(): Promise<void> {
    // no-op in browser
  }
}

/**
 * Convenience wrapper — delegates all calls to the active platform API.
 * Replaces the previous Proxy-based approach for better debuggability
 * and TypeScript type safety.
 */
export const platformAPI: IPlatformAPI = {
  showSaveDialog(options: SaveDialogOptions): Promise<string | null> {
    return getPlatformAPI().showSaveDialog(options);
  },
  writeFile(filePath: string, data: Uint8Array): Promise<void> {
    return getPlatformAPI().writeFile(filePath, data);
  },
  checkForUpdate(): Promise<UpdateCheckResult | null> {
    return getPlatformAPI().checkForUpdate();
  },
  relaunch(): Promise<void> {
    return getPlatformAPI().relaunch();
  },
};
