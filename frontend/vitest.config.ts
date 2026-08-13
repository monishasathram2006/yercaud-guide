import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// A standalone config, separate from vite.config.ts's TanStack Start setup
// (SSR entry, nitro build target, etc.) — none of that applies to a plain
// jsdom component test, and pulling it in would drag the whole server build
// pipeline into `npm test`. The "@" alias is set directly (rather than via
// vite-tsconfig-paths) — that plugin didn't reliably resolve module identity
// for vi.mock() targets under Vitest.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    globals: true,
  },
});
