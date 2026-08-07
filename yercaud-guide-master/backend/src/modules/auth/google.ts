import { randomBytes } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { config } from "../../config.js";
import { upsertGoogleUser } from "./service.js";
import { createSession, setSessionCookie } from "./session.js";

export interface GoogleAuthProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name: string;
  avatarUrl: string | null;
}

const STATE_COOKIE_NAME = "google_oauth_state";
const STATE_COOKIE_PATH = "/auth/google";
const STATE_COOKIE_MAX_AGE_SECONDS = 5 * 60;

/**
 * The real implementation of the AppDeps.exchangeGoogleAuthCode seam
 * (issue #12) — the one thing test/auth.google.test.ts always fakes, so no
 * test ever calls Google's servers. Reads config at call time, not at
 * buildApp time, so a deployment with no Google credentials configured can
 * still boot; only hitting /auth/google/callback for real fails.
 */
export async function exchangeGoogleAuthCode(code: string): Promise<GoogleAuthProfile> {
  const { clientId, clientSecret, redirectUri } = config.google;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google sign-in is not configured (GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI)");
  }

  const client = new OAuth2Client(clientId, clientSecret, redirectUri);
  const { tokens } = await client.getToken(code);
  const ticket = await client.verifyIdToken({ idToken: tokens.id_token!, audience: clientId });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new Error("Google did not return a usable identity");
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified ?? false,
    name: payload.name ?? payload.email,
    avatarUrl: payload.picture ?? null,
  };
}

function frontendUrl(path: string): string {
  return `${config.corsOrigins[0]}${path}`;
}

export async function registerGoogleAuthRoutes(app: FastifyInstance, deps: Required<AppDeps>): Promise<void> {
  app.get("/auth/google", async (_request, reply) => {
    if (!config.google.clientId || !config.google.redirectUri) {
      return reply.status(500).send({ error: "InternalServerError", message: "Google sign-in is not configured" });
    }

    const state = randomBytes(24).toString("hex");
    reply.setCookie(STATE_COOKIE_NAME, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.secureCookies,
      path: STATE_COOKIE_PATH,
      maxAge: STATE_COOKIE_MAX_AGE_SECONDS,
    });

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", config.google.clientId);
    authUrl.searchParams.set("redirect_uri", config.google.redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("state", state);

    return reply.redirect(authUrl.toString());
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    "/auth/google/callback",
    async (request, reply) => {
      // Single-use: read then clear the state cookie regardless of outcome.
      const expectedState = request.cookies[STATE_COOKIE_NAME];
      reply.clearCookie(STATE_COOKIE_NAME, { path: STATE_COOKIE_PATH, sameSite: "lax", secure: config.secureCookies });

      const { code, state, error } = request.query;
      if (error || !code || !state || !expectedState || state !== expectedState) {
        return reply.redirect(frontendUrl("/login?error=google_failed"));
      }

      let profile: GoogleAuthProfile;
      try {
        profile = await deps.exchangeGoogleAuthCode(code);
      } catch {
        return reply.redirect(frontendUrl("/login?error=google_failed"));
      }

      // Google itself vouches for the email only when this is set — an
      // unverified email must not silently become this platform's account.
      if (!profile.emailVerified) {
        return reply.redirect(frontendUrl("/login?error=google_failed"));
      }

      const user = await upsertGoogleUser(deps.db, {
        googleId: profile.googleId,
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
      });

      const token = await createSession(deps.db, user.id);
      setSessionCookie(reply, token);

      return reply.redirect(frontendUrl("/"));
    },
  );
}
