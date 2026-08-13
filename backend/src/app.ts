import { mkdirSync } from "node:fs";
import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import type pg from "pg";
import { config } from "./config.js";
import { registerAuthRoutes } from "./modules/auth/routes.js";
import { exchangeGoogleAuthCode as exchangeGoogleAuthCodeReal, type GoogleAuthProfile } from "./modules/auth/google.js";
import { registerBusinessesRoutes } from "./modules/businesses/routes.js";
import { registerListingsRoutes } from "./modules/listings/routes.js";
import { registerFavoritesRoutes } from "./modules/favorites/routes.js";
import { registerReviewsRoutes } from "./modules/reviews/routes.js";
import { registerEnquiriesRoutes } from "./modules/enquiries/routes.js";
import { registerAdminRoutes } from "./modules/admin/routes.js";
import { registerMarketingRoutes } from "./modules/marketing/routes.js";
import { registerFeaturedRoutes } from "./modules/featured/routes.js";
import { registerPlatformStatsRoutes } from "./modules/platform-stats/routes.js";
import { registerBlogRoutes } from "./modules/blog/routes.js";
import { registerFaqRoutes } from "./modules/faq/routes.js";
import { registerContentRoutes } from "./modules/content/routes.js";
import { registerRbacRoutes } from "./modules/rbac/routes.js";
import { registerTaxonomyRoutes } from "./modules/taxonomies/routes.js";
import { registerSearchRoutes } from "./modules/search/routes.js";
import { embeddingProviderFromConfig, type EmbeddingProvider } from "./modules/search/provider.js";
import { registerAuthPlugin } from "./plugins/auth.js";

export interface AppDeps {
  db: pg.Pool;
  /** Stubbed by default (logs only) — real provider wired up later, same pattern as ADR 0008. */
  sendPasswordResetEmail?: (email: string, token: string) => Promise<void>;
  /**
   * The search engine's semantic leg (issue #11). Null → lexical-only search.
   * Defaults to config (Azure when the credentials are set, null otherwise);
   * tests inject a deterministic fake, or omit it for the lexical-only path.
   */
  embeddingProvider?: EmbeddingProvider | null;
  /**
   * Whether a write fires a best-effort background embedding refresh (issue #11).
   * Defaults on; tests default it off (via buildTestApp) so the fire-and-forget
   * reconcile can't race the direct-sync assertions.
   */
  refreshEmbeddingsOnWrite?: boolean;
  /**
   * The one seam for Google sign-in (issue #12): exchanges an OAuth
   * authorization code for a verified Google profile. Defaults to the real
   * call to Google's token/userinfo endpoints; tests inject a fake so no test
   * ever makes a real network call to Google.
   */
  exchangeGoogleAuthCode?: (code: string) => Promise<GoogleAuthProfile>;
}

export async function buildApp(rawDeps: AppDeps): Promise<FastifyInstance> {
  const deps: Required<AppDeps> = {
    sendPasswordResetEmail: async (email, token) => {
      console.log(`[stub email] password reset for ${email}: token=${token}`);
    },
    embeddingProvider: embeddingProviderFromConfig(),
    refreshEmbeddingsOnWrite: true,
    exchangeGoogleAuthCode: exchangeGoogleAuthCodeReal,
    ...rawDeps,
  };
  const app = Fastify({ logger: false });

  // Responses backed by a stubbed dependency carry an X-Mock header so the
  // frontend's mock-audit (and anyone in devtools) can tell "endpoint works"
  // from "endpoint works but the side effect is faked".
  if (!rawDeps.sendPasswordResetEmail) {
    app.addHook("onSend", async (request, reply, payload) => {
      if (request.url === "/auth/password-reset/request") {
        reply.header("x-mock", "email delivery is a console stub - no email is sent");
      }
      return payload;
    });
  }

  await app.register(cors, { origin: config.corsOrigins, credentials: true, exposedHeaders: ["x-mock"] });
  await app.register(cookie);
  // fileSize above every route's own cap (avatar's is 2 MB — see auth/avatar.ts)
  // so a too-big upload reaches that route's clean 400, rather than busboy's
  // truncate-then-413 kicking in first against the framework's 1 MB default.
  await app.register(multipart, { attachFieldsToBody: true, limits: { fileSize: 5 * 1024 * 1024 } });

  const uploadRoot = path.resolve(config.uploadDir);
  mkdirSync(uploadRoot, { recursive: true });
  await app.register(fastifyStatic, { root: uploadRoot, prefix: "/uploads/" });

  app.decorate("db", deps.db);
  await registerAuthPlugin(app, deps.db);

  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    const statusCode = error.statusCode ?? 500;
    reply.status(statusCode).send({
      error: error.name || "Error",
      message: statusCode === 500 ? "Internal server error" : error.message,
    });
  });

  await registerAuthRoutes(app, deps);
  await registerRbacRoutes(app, deps);
  await registerTaxonomyRoutes(app, deps);
  await registerBusinessesRoutes(app, deps);
  await registerListingsRoutes(app, deps);
  registerSearchRoutes(app, deps);
  await registerFavoritesRoutes(app, deps);
  await registerReviewsRoutes(app, deps);
  await registerEnquiriesRoutes(app, deps);
  await registerAdminRoutes(app, deps);
  await registerMarketingRoutes(app, deps);
  registerFeaturedRoutes(app, deps);
  registerPlatformStatsRoutes(app, deps);
  await registerBlogRoutes(app, deps);
  await registerFaqRoutes(app, deps);
  await registerContentRoutes(app, deps);

  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    db: pg.Pool;
  }
}
