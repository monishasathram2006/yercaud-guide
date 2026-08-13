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
  // Pinned to 5173: the Google OAuth callback (backend .env CORS_ORIGINS) redirects here.
  vite: {
    server: { port: 5173, strictPort: true },
    // react-markdown is only imported by the blog routes, so Vite doesn't
    // discover it during the initial crawl (nothing on the eagerly-loaded
    // routes pulls it in) — it only gets found once a browser actually
    // navigates to /blog or /blog/$slug. That "discovered a new dependency
    // mid-session" event forces Vite to re-optimize and hand out a new
    // deps hash, which breaks every module URL the page already loaded
    // under the old hash ("Failed to fetch dynamically imported module").
    // Listing it here makes Vite pre-bundle it at cold start instead.
    optimizeDeps: { include: ["react-markdown"] },
  },
});
