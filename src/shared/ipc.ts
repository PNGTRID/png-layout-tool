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

/**
 * 更新器下载事件（判别联合）。
 * 与 @tauri-apps/plugin-updater 的 DownloadEvent 结构对齐 ——
 * 不同事件的 data 形状不同，必须按 event 判别后再访问对应字段。
 */
export type UpdateDownloadEvent =
  | { event: 'Started'; data: { contentLength?: number } }
  | { event: 'Progress'; data: { chunkLength: number } }
  | { event: 'Finished' };

/** 更新器检查结果 */
export interface UpdateCheckResult {
  version: string;
  date?: string;
  body?: string;
  downloadAndInstall(onEvent: (e: UpdateDownloadEvent) => void): Promise<void>;
}

/**
 * 可写文件流句柄（中立接口，lib 层不直接依赖 FsFile）。
 * 包装 Tauri 的 FsFile：顺序 write 追加、seek 绝对偏移、close 关闭。
 * 用于流式导出超大文件（分块写盘 + 偏移回填），不持有整文件 Uint8Array。
 */
export interface WritableFileHandle {
  /** 顺序追加字节，返回写入字节数（内部指针前移） */
  write(data: Uint8Array): Promise<number>;
  /** 定位到绝对偏移（文件起始为 0），返回新偏移 */
  seek(offset: number): Promise<number>;
  /** 关闭句柄，刷新并释放资源 */
  close(): Promise<void>;
}

export interface IPlatformAPI {
  showSaveDialog(options: SaveDialogOptions): Promise<string | null>;
  writeFile(filePath: string, data: Uint8Array): Promise<void>;
  /** 打开可写文件流（truncate 创建/覆盖），用于流式导出。非 Tauri 环境抛错 */
  openWritable(filePath: string): Promise<WritableFileHandle>;
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

  async openWritable(filePath: string): Promise<WritableFileHandle> {
    const { open, SeekMode } = await import('@tauri-apps/plugin-fs');
    const file = await open(filePath, { write: true, create: true, truncate: true });
    return {
      write: (data) => file.write(data),
      seek: (offset) => file.seek(offset, SeekMode.Start),
      close: () => file.close(),
    };
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
  async openWritable(): Promise<WritableFileHandle> {
    // 浏览器降级无法流式写盘，抛错让上层回退 downloadBlob
    throw new Error('流式导出仅在桌面端可用');
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
  openWritable(filePath: string): Promise<WritableFileHandle> {
    return getPlatformAPI().openWritable(filePath);
  },
  checkForUpdate(): Promise<UpdateCheckResult | null> {
    return getPlatformAPI().checkForUpdate();
  },
  relaunch(): Promise<void> {
    return getPlatformAPI().relaunch();
  },
};
