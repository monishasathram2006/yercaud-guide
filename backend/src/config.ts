function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL", "postgres://yercaud:yercaud@localhost:5432/yercaud_directory"),
  sessionCookieName: "session_id",
  sessionTtlDays: 30,
  /**
   * `secure` on the session cookie — off locally (dev is plain HTTP, and a
   * Secure cookie would never be sent, silently logging everyone out), on
   * everywhere else.
   *
   * Defaults to on: a missing NODE_ENV in production must not quietly downgrade
   * the session cookie to something interceptable on the wire.
   *
   * sameSite stays 'lax' rather than 'none'. The apps and the API share a
   * registrable domain — Lax keys off that, not the host — so cookies flow
   * between the public site, the Admin subdomain and the API without
   * third-party-cookie exemptions. This only breaks if Admin moves to a
   * different domain entirely.
   */
  secureCookies: process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test",
  // Defaults match the dev servers (public site :8080, Admin :8081); deploys set
  // CORS_ORIGINS explicitly. Wrong entries here fail as the browser's opaque
  // "Failed to fetch" — SSR keeps working, since server-to-server skips CORS.
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:8080,http://localhost:8081").split(","),
  // Local disk storage for uploaded images (build plan's Phase 0 storage decision) —
  // served statically under /uploads.
  uploadDir: required("UPLOAD_DIR", "uploads"),

  /**
   * Azure OpenAI embeddings for the hybrid search engine (issue #11).
   *
   * All four are optional and read from a gitignored .env (loaded by dotenv at
   * the entry points). With any of the first three absent, the semantic leg is
   * disabled and search degrades to lexical-only — which is exactly the state
   * the test suite and CI run in, so no credentials are ever required to build
   * or test. `endpoint`/`apiKey`/`deployment` are the required trio; the API
   * version has a sane default.
   */
  azureEmbeddings: {
    endpoint: process.env.AZURE_OPENAI_EMBEDDING_ENDPOINT,
    apiKey: process.env.AZURE_OPENAI_EMBEDDING_API_KEY,
    deployment: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
    apiVersion: process.env.AZURE_OPENAI_EMBEDDING_API_VERSION ?? "2024-10-21",
  },

  /**
   * Google OAuth (issue #12). All three optional and read from a gitignored
   * .env, same posture as the Azure embedding config — absent in tests (which
   * always inject a fake exchangeGoogleAuthCode) and in any environment that
   * doesn't offer Google sign-in. Only the real, non-injected code path in
   * google.ts reads these and throws if they're missing.
   */
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
  },
};
