import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, extractCookie, resetDb, type TestContext } from "./helpers.js";

describe("GET /auth/me and POST /auth/logout", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("returns the signed-in user when a valid session cookie is sent", async () => {
    const register = await ctx.app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "dave@example.com", password: "correct horse battery staple", name: "Dave" },
    });
    const cookie = extractCookie(register.headers["set-cookie"]);

    const response = await ctx.app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });

    expect(response.statusCode).toBe(200);
    expect(response.json().email).toBe("dave@example.com");
    expect(response.json().roles).toEqual([]);
    expect(response.json().hasPassword).toBe(true);
    expect(response.json().emailVerifiedAt).toBeNull();
  });

  it("reflects newly-granted roles on the next request (no cached session state)", async () => {
    const register = await ctx.app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "ivy@example.com", password: "correct horse battery staple", name: "Ivy" },
    });
    const cookie = extractCookie(register.headers["set-cookie"]);
    const userId = register.json().id;

    await ctx.db.query(
      `INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = 'Business Owner'`,
      [userId],
    );

    const response = await ctx.app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    expect(response.json().roles).toEqual(["Business Owner"]);
  });

  it("extends the session's expiry on use (sliding expiry)", async () => {
    const register = await ctx.app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "jack@example.com", password: "correct horse battery staple", name: "Jack" },
    });
    const cookie = extractCookie(register.headers["set-cookie"]);

    const before = await ctx.db.query<{ expires_at: Date }>(
      `SELECT expires_at FROM sessions ORDER BY created_at DESC LIMIT 1`,
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    await ctx.app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });

    const after = await ctx.db.query<{ expires_at: Date }>(
      `SELECT expires_at FROM sessions ORDER BY created_at DESC LIMIT 1`,
    );

    expect(new Date(after.rows[0].expires_at).getTime()).toBeGreaterThan(
      new Date(before.rows[0].expires_at).getTime(),
    );
  });

  it("returns 401 when no session cookie is sent", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/auth/me" });
    expect(response.statusCode).toBe(401);
  });

  it("invalidates the session so it can't be reused after logout", async () => {
    const register = await ctx.app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "erin@example.com", password: "correct horse battery staple", name: "Erin" },
    });
    const cookie = extractCookie(register.headers["set-cookie"]);

    const logout = await ctx.app.inject({ method: "POST", url: "/auth/logout", headers: { cookie } });
    expect(logout.statusCode).toBe(204);

    const me = await ctx.app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(401);
  });
});
