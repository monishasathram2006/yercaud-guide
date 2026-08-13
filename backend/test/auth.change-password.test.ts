import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildTestApp, closeTestApp, extractCookie, resetDb, type TestContext } from "./helpers.js";
import type { GoogleAuthProfile } from "../src/modules/auth/google.js";

describe("POST /me/password", () => {
  let ctx: TestContext;

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  describe("a password-based account", () => {
    beforeEach(async () => {
      ctx = await buildTestApp();
      await resetDb(ctx.db);
    });

    it("changes the password when the current one is correct, and the new one works at /auth/login", async () => {
      const register = await ctx.app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email: "hank@example.com", password: "correct horse battery staple", name: "Hank" },
      });
      const cookie = extractCookie(register.headers["set-cookie"]);

      const change = await ctx.app.inject({
        method: "POST",
        url: "/me/password",
        headers: { cookie },
        payload: { currentPassword: "correct horse battery staple", newPassword: "new secure password" },
      });
      expect(change.statusCode).toBe(204);

      const login = await ctx.app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "hank@example.com", password: "new secure password" },
      });
      expect(login.statusCode).toBe(200);
    });

    it("rejects a wrong current password with 401, leaving the old password usable", async () => {
      const register = await ctx.app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email: "ida@example.com", password: "correct horse battery staple", name: "Ida" },
      });
      const cookie = extractCookie(register.headers["set-cookie"]);

      const change = await ctx.app.inject({
        method: "POST",
        url: "/me/password",
        headers: { cookie },
        payload: { currentPassword: "totally wrong", newPassword: "new secure password" },
      });
      expect(change.statusCode).toBe(401);

      const login = await ctx.app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "ida@example.com", password: "correct horse battery staple" },
      });
      expect(login.statusCode).toBe(200);
    });

    it("rejects a missing current password with 401", async () => {
      const register = await ctx.app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email: "jill@example.com", password: "correct horse battery staple", name: "Jill" },
      });
      const cookie = extractCookie(register.headers["set-cookie"]);

      const change = await ctx.app.inject({
        method: "POST",
        url: "/me/password",
        headers: { cookie },
        payload: { newPassword: "new secure password" },
      });
      expect(change.statusCode).toBe(401);
    });

    it("rejects an anonymous request with 401", async () => {
      const response = await ctx.app.inject({
        method: "POST",
        url: "/me/password",
        payload: { currentPassword: "x", newPassword: "new secure password" },
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe("a Google-only account", () => {
    const profile: GoogleAuthProfile = {
      googleId: "google-sub-999",
      email: "kate@example.com",
      emailVerified: true,
      name: "Kate",
      avatarUrl: null,
    };

    beforeEach(async () => {
      ctx = await buildTestApp({ exchangeGoogleAuthCode: vi.fn(async () => profile) });
      await resetDb(ctx.db);
    });

    async function signInWithGoogle(): Promise<string> {
      const start = await ctx.app.inject({ method: "GET", url: "/auth/google" });
      const stateCookie = extractCookie(start.headers["set-cookie"]);
      const state = new URL(String(start.headers.location)).searchParams.get("state")!;
      const callback = await ctx.app.inject({
        method: "GET",
        url: `/auth/google/callback?code=fake-code&state=${state}`,
        headers: { cookie: stateCookie },
      });
      return extractCookie(callback.headers["set-cookie"]);
    }

    it("sets a first password with no current password required, and it then works at /auth/login", async () => {
      const cookie = await signInWithGoogle();

      const change = await ctx.app.inject({
        method: "POST",
        url: "/me/password",
        headers: { cookie },
        payload: { newPassword: "a brand new password" },
      });
      expect(change.statusCode).toBe(204);

      const login = await ctx.app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: profile.email, password: "a brand new password" },
      });
      expect(login.statusCode).toBe(200);
    });

    it("can still sign in with Google afterward — setting a password doesn't disconnect it", async () => {
      const cookie = await signInWithGoogle();
      await ctx.app.inject({
        method: "POST",
        url: "/me/password",
        headers: { cookie },
        payload: { newPassword: "a brand new password" },
      });

      const secondGoogleCookie = await signInWithGoogle();
      const me = await ctx.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { cookie: secondGoogleCookie },
      });
      expect(me.json().email).toBe(profile.email);
      expect(me.json().hasPassword).toBe(true);
    });
  });
});
