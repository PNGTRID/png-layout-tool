import { contextBridge, ipcRenderer } from "electron";
import type { ElectronAPI, SaveDialogOptions } from "../src/shared/ipc";
import { IPC_CHANNELS } from "../src/shared/ipc";

const electronAPI: ElectronAPI = {
  showSaveDialog: async (options: SaveDialogOptions): Promise<string | null> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SHOW_SAVE_DIALOG, options);
  },
  writeFile: async (filePath: string, buffer: Uint8Array): Promise<void> => {
    // Uint8Array -> number[] conversion (IPC does not directly support TypedArray)
    const arrayData = Array.from(buffer);
    return ipcRenderer.invoke(IPC_CHANNELS.WRITE_FILE, filePath, arrayData);
  },
  readFile: async (filePath: string): Promise<Uint8Array> => {
    const data: number[] = await ipcRenderer.invoke(
      IPC_CHANNELS.READ_FILE,
      filePath
    );
    // number[] -> Uint8Array conversion
    return new Uint8Array(data);
  },
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

// Global type declaration is in src/shared/ipc.ts
