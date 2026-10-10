import { defineConfig } from "vite";
import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf-8"));
const buildTime = new Date().toISOString();

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  base: "./",
  clearScreen: false,
  server: {
    host: host || false,
    port: 5173,
    strictPort: true,
    warmup: {
      clientFiles: [
        "./index.html",
        "./src/main.ts",
        "./src/renderer.ts",
        "./src/editor.ts",
        "./src/styles/base.css",
        "./src/styles/layout.css",
        "./src/styles/reader.css",
        "./src/styles/editor.css",
      ],
    },
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 5183,
        }
      : undefined,
  },
  optimizeDeps: {
    include: [
      "mermaid",
      "katex",
      "highlight.js",
      "dompurify",
      "markdown-it",
      "markdown-it-footnote",
      "markdown-it-task-lists",
      "@tauri-apps/api/core",
      "@tauri-apps/plugin-dialog",
      "@tauri-apps/plugin-fs",
      "@tauri-apps/plugin-opener",
    ],
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  build: {
    target: "es2022",
    assetsInlineLimit: (filePath: string) => filePath.endsWith(".woff2"),
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});


