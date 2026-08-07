import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./test/global-setup.ts"],
    fileParallelism: false,
    env: {
      // Dummy, non-secret values: enough for the /auth/google route to build
      // a redirect URL. No test ever needs real Google credentials — the one
      // seam that would call Google for real (exchangeGoogleAuthCode) is
      // always faked in test/auth.google.test.ts.
      GOOGLE_CLIENT_ID: "test-client-id",
      GOOGLE_CLIENT_SECRET: "test-client-secret",
      GOOGLE_REDIRECT_URI: "http://localhost:4000/auth/google/callback",
    },
  },
});
