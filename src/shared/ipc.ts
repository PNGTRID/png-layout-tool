export interface ElectronAPI {
  showSaveDialog(options: SaveDialogOptions): Promise<string | null>;
  writeFile(filePath: string, buffer: Uint8Array): Promise<void>;
  readFile(filePath: string): Promise<Uint8Array>;
}

export interface SaveDialogOptions {
  filters: { name: string; extensions: string[] }[];
  defaultPath?: string;
}

export const IPC_CHANNELS = {
  SHOW_SAVE_DIALOG: 'show-save-dialog',
  WRITE_FILE: 'write-file',
  READ_FILE: 'read-file',
} as const;

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
