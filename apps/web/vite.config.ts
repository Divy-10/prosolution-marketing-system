/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// Read only what the dev server needs from the root .env. Nothing here reaches the browser:
// Vite only exposes VITE_* variables, and this app defines none.
const rootEnv: Record<string, string> = {};
loadEnv({ path: path.resolve(here, "../../.env"), processEnv: rootEnv, quiet: true });
const apiPort = rootEnv.API_PORT ?? "4000";
const apiHost = rootEnv.API_HOST ?? "127.0.0.1";

/** Strict Content-Security-Policy for the production build (dev needs inline HMR scripts). */
function cspMeta(): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    // Radix UI injects a small <style> tag for scroll locking; inline *styles* only, scripts stay strict.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  return {
    name: "prosolution-csp",
    apply: "build",
    transformIndexHtml: (html) =>
      html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cspMeta()],
  envDir: here,
  server: {
    host: "localhost",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: `http://${apiHost}:${apiPort}`, changeOrigin: false },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      "/api": { target: `http://${apiHost}:${apiPort}`, changeOrigin: false },
    },
  },
  build: {
    sourcemap: false,
    target: "es2022",
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
