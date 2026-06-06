import { defineConfig } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, "electron/main.ts"),
      formats: ["cjs"],
      fileName: () => "main.js",
    },
    outDir: path.resolve(__dirname, "dist/main"),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      external: [
        "electron",
        "node:*",
        "fs",
        "fs/promises",
        "path",
        "os",
        "url",
        "crypto",
        "stream",
        "util",
        "events",
        "http",
        "https",
        "net",
        "buffer",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "src/shared"),
    },
  },
});
