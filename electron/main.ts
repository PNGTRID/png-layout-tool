import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { writeFile, readFile } from "fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

/** Validate file path security: must be absolute and not contain directory traversal */
function isValidFilePath(filePath: unknown): filePath is string {
  if (!filePath || typeof filePath !== "string") return false;
  // Prevent directory traversal attacks
  if (filePath.includes("..")) return false;
  return path.isAbsolute(filePath);
}

/** Validate buffer data: must be an array of byte values */
function isValidBufferData(data: unknown): data is number[] {
  return (
    Array.isArray(data) &&
    data.every((n) => typeof n === "number" && n >= 0 && n <= 255)
  );
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    title: "PNG \u900f\u660e\u56fe\u7247\u81ea\u52a8\u6392\u7248\u5de5\u5177",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(
      path.join(__dirname, "../../dist/renderer/index.html")
    );
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Security: intercept will-navigate, only allow local URLs
  mainWindow.webContents.on("will-navigate", (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (isDev) {
      // Dev mode: only allow localhost:5173
      if (parsedUrl.hostname !== "localhost" || parsedUrl.port !== "5173") {
        event.preventDefault();
      }
    } else {
      // Production mode: only allow file:// protocol
      if (parsedUrl.protocol !== "file:") {
        event.preventDefault();
      }
    }
  });

  // Security: deny all new window creation
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });
}

// IPC Handlers
ipcMain.handle("show-save-dialog", async (_, options) => {
  if (!mainWindow) return null;
  const result = await dialog.showSaveDialog(mainWindow, options);
  if (result.canceled || !result.filePath) return null;
  return result.filePath;
});

ipcMain.handle(
  "write-file",
  async (_, filePath: unknown, data: unknown) => {
    if (!isValidFilePath(filePath)) {
      throw new Error(
        "Invalid file path: path must be absolute and not contain traversal sequences"
      );
    }
    if (!isValidBufferData(data)) {
      throw new Error("Invalid buffer data: expected number array");
    }
    const buffer = Buffer.from(data);
    await writeFile(filePath, buffer);
  }
);

ipcMain.handle("read-file", async (_, filePath: unknown) => {
  if (!isValidFilePath(filePath)) {
    throw new Error(
      "Invalid file path: path must be absolute and not contain traversal sequences"
    );
  }
  const buffer = await readFile(filePath);
  // Return as number[] for IPC serialization
  return Array.from(buffer);
});

// App lifecycle
app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Security: global fallback for any web contents
app.on("web-contents-created", (_, webContents) => {
  // Block all new window attempts globally
  webContents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });
});
