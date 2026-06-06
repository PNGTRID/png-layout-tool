export interface SaveDialogOptions {
  filters: { name: string; extensions: string[] }[];
  defaultPath?: string;
}

// Detect if running inside Tauri
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const platformAPI = {
  async showSaveDialog(options: SaveDialogOptions): Promise<string | null> {
    if (isTauri) {
      const { save } = await import('@tauri-apps/plugin-dialog');
      return await save({
        filters: options.filters,
        defaultPath: options.defaultPath,
      });
    }
    return null;
  },

  async writeFile(filePath: string, data: Uint8Array): Promise<void> {
    if (isTauri) {
      const { writeFile } = await import('@tauri-apps/plugin-fs');
      await writeFile(filePath, data);
    }
  },
};
