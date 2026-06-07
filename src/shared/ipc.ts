export interface SaveDialogOptions {
  filters: { name: string; extensions: string[] }[];
  defaultPath?: string;
}

/**
 * Platform abstraction layer.
 * Provides a mock-friendly interface for Tauri IPC.
 * Call setPlatformAPI() in tests to inject a mock.
 */

export interface IPlatformAPI {
  showSaveDialog(options: SaveDialogOptions): Promise<string | null>;
  writeFile(filePath: string, data: Uint8Array): Promise<void>;
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
};
