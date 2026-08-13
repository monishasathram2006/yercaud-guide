// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Pinned to 5174 (companion to the frontend's 5173): matches backend .env CORS_ORIGINS.
  vite: {
    server: { port: 5174, strictPort: true },
    // Same reasoning as frontend/vite.config.ts: pre-bundle react-markdown at
    // cold start so a mid-session "discovered a new dependency" re-optimize
    // never has a chance to hand out a stale deps hash.
    optimizeDeps: { include: ["react-markdown"] },
  },
});
