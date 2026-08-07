import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildTestApp, closeTestApp, extractCookie, resetDb, type TestContext } from "./helpers.js";
import type { GoogleAuthProfile } from "../src/modules/auth/google.js";

function fakeExchange(profile: GoogleAuthProfile) {
  return vi.fn(async (_code: string) => profile);
}

function extractStateFromLocation(location: string | undefined): string {
  const url = new URL(String(location));
  const state = url.searchParams.get("state");
  if (!state) throw new Error("no state query param on /auth/google redirect");
  return state;
}

describe("Google sign-in", () => {
  let ctx: TestContext;

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  async function startFlow(): Promise<{ cookie: string; state: string }> {
    const response = await ctx.app.inject({ method: "GET", url: "/auth/google" });
    expect(response.statusCode).toBe(302);
    return {
      cookie: extractCookie(response.headers["set-cookie"]),
      state: extractStateFromLocation(response.headers.location as string),
    };
  }

  describe("new visitor", () => {
    const profile: GoogleAuthProfile = {
      googleId: "google-sub-111",
      email: "dana@example.com",
      emailVerified: true,
      name: "Dana",
      avatarUrl: "https://example.com/dana.jpg",
    };

    beforeEach(async () => {
      ctx = await buildTestApp({ exchangeGoogleAuthCode: fakeExchange(profile) });
      await resetDb(ctx.db);
    });

    it("creates a passwordless account and starts a session", async () => {
      const { cookie, state } = await startFlow();

      const callback = await ctx.app.inject({
        method: "GET",
        url: `/auth/google/callback?code=fake-code&state=${state}`,
        headers: { cookie },
      });

      expect(callback.statusCode).toBe(302);
      expect(String(callback.headers["set-cookie"])).toContain("session_id=");

      const { rows } = await ctx.db.query(
        `SELECT google_id, password_hash, email, name, avatar_url FROM users WHERE email = $1`,
        [profile.email],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].google_id).toBe(profile.googleId);
      expect(rows[0].password_hash).toBeNull();
      expect(rows[0].name).toBe("Dana");
      expect(rows[0].avatar_url).toBe(profile.avatarUrl);
    });

    it("reports the new Google account as email-verified with no password, via /auth/me", async () => {
      const { cookie, state } = await startFlow();
      const callback = await ctx.app.inject({
        method: "GET",
        url: `/auth/google/callback?code=fake-code&state=${state}`,
        headers: { cookie },
      });
      const sessionCookie = extractCookie(callback.headers["set-cookie"]);

      const me = await ctx.app.inject({ method: "GET", url: "/auth/me", headers: { cookie: sessionCookie } });
      expect(me.json().hasPassword).toBe(false);
      expect(me.json().emailVerifiedAt).not.toBeNull();
    });

    it("reuses the same account on a second sign-in with the same googleId", async () => {
      const first = await startFlow();
      await ctx.app.inject({
        method: "GET",
        url: `/auth/google/callback?code=fake-code&state=${first.state}`,
        headers: { cookie: first.cookie },
      });

      const second = await startFlow();
      const secondCallback = await ctx.app.inject({
        method: "GET",
        url: `/auth/google/callback?code=fake-code-2&state=${second.state}`,
        headers: { cookie: second.cookie },
      });
      expect(secondCallback.statusCode).toBe(302);

      const { rows } = await ctx.db.query(`SELECT count(*)::int AS count FROM users WHERE email = $1`, [
        profile.email,
      ]);
      expect(rows[0].count).toBe(1);
    });
  });

  describe("visitor with an existing password account", () => {
    const email = "carol@example.com";
    const profile: GoogleAuthProfile = {
      googleId: "google-sub-222",
      email,
      emailVerified: true,
      name: "Carol Google Name",
      avatarUrl: null,
    };

    beforeEach(async () => {
      ctx = await buildTestApp({ exchangeGoogleAuthCode: fakeExchange(profile) });
      await resetDb(ctx.db);
      await ctx.app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email, password: "correct horse battery staple", name: "Carol" },
      });
    });

    it("links Google to the existing account instead of creating a duplicate", async () => {
      const { cookie, state } = await startFlow();
      await ctx.app.inject({
        method: "GET",
        url: `/auth/google/callback?code=fake-code&state=${state}`,
        headers: { cookie },
      });

      const { rows } = await ctx.db.query(
        `SELECT count(*)::int AS count FROM users WHERE email = $1`,
        [email],
      );
      expect(rows[0].count).toBe(1);

      const { rows: linked } = await ctx.db.query(
        `SELECT google_id, password_hash FROM users WHERE email = $1`,
        [email],
      );
      expect(linked[0].google_id).toBe(profile.googleId);
      expect(linked[0].password_hash).not.toBeNull();
    });

    it("leaves the original password usable after linking", async () => {
      const { cookie, state } = await startFlow();
      await ctx.app.inject({
        method: "GET",
        url: `/auth/google/callback?code=fake-code&state=${state}`,
        headers: { cookie },
      });

      const login = await ctx.app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email, password: "correct horse battery staple" },
      });
      expect(login.statusCode).toBe(200);
    });
  });

  describe("failure paths", () => {
    const profile: GoogleAuthProfile = {
      googleId: "google-sub-333",
      email: "eve@example.com",
      emailVerified: false,
      name: "Eve",
      avatarUrl: null,
    };
    let exchange: ReturnType<typeof fakeExchange>;

    beforeEach(async () => {
      exchange = fakeExchange(profile);
      ctx = await buildTestApp({ exchangeGoogleAuthCode: exchange });
      await resetDb(ctx.db);
    });

    it("redirects with an error and creates no account when Google reports an unverified email", async () => {
      const { cookie, state } = await startFlow();
      const callback = await ctx.app.inject({
        method: "GET",
        url: `/auth/google/callback?code=fake-code&state=${state}`,
        headers: { cookie },
      });

      expect(callback.statusCode).toBe(302);
      expect(String(callback.headers.location)).toContain("error=");
      expect(callback.headers["set-cookie"]).not.toContain("session_id=");

      const { rows } = await ctx.db.query(`SELECT count(*)::int AS count FROM users WHERE email = $1`, [
        profile.email,
      ]);
      expect(rows[0].count).toBe(0);
    });

    it("rejects a callback whose state doesn't match the one issued, without calling the exchange", async () => {
      const { cookie } = await startFlow();
      const callback = await ctx.app.inject({
        method: "GET",
        url: `/auth/google/callback?code=fake-code&state=forged-state`,
        headers: { cookie },
      });

      expect(callback.statusCode).toBe(302);
      expect(String(callback.headers.location)).toContain("error=");
      expect(exchange).not.toHaveBeenCalled();
    });

    it("rejects a callback with no state cookie at all", async () => {
      const callback = await ctx.app.inject({
        method: "GET",
        url: `/auth/google/callback?code=fake-code&state=anything`,
      });

      expect(callback.statusCode).toBe(302);
      expect(String(callback.headers.location)).toContain("error=");
      expect(exchange).not.toHaveBeenCalled();
    });
  });

  describe("schema constraint", () => {
    beforeEach(async () => {
      ctx = await buildTestApp();
      await resetDb(ctx.db);
    });

    it("rejects a user row with neither a password nor a google_id", async () => {
      await expect(
        ctx.db.query(`INSERT INTO users (email, name) VALUES ('nouser@example.com', 'No Auth')`),
      ).rejects.toThrow();
    });
  });
});
