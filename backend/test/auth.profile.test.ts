import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

/**
 * A User editing their own profile (Phase 10).
 *
 * Nothing let them: PATCH /users/{userId} is the Super Admin's
 * suspend/reactivate, and /me/* was read-only. "View and edit my profile" had no
 * backend at all.
 */
describe("PATCH /me — a User's own profile", () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });
  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("updates the caller's own profile", async () => {
    const { cookie } = await registerAndGetCookie(ctx, "asha@example.com");
    const res = await ctx.app.inject({
      method: "PATCH",
      url: "/me",
      headers: { cookie },
      payload: { name: "Asha R", phone: "+91 98765 43210", bio: "Weekend hiker." },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: "Asha R", phone: "+91 98765 43210", bio: "Weekend hiker." });
  });

  it("leaves absent fields untouched", async () => {
    const { cookie } = await registerAndGetCookie(ctx, "asha@example.com");
    await ctx.app.inject({ method: "PATCH", url: "/me", headers: { cookie }, payload: { phone: "+91 1", bio: "Original" } });
    await ctx.app.inject({ method: "PATCH", url: "/me", headers: { cookie }, payload: { name: "Only The Name" } });

    const me = await ctx.app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    expect(me.json()).toMatchObject({ name: "Only The Name", phone: "+91 1", bio: "Original" });
  });

  it("clears a field set explicitly to null", async () => {
    const { cookie } = await registerAndGetCookie(ctx, "asha@example.com");
    await ctx.app.inject({ method: "PATCH", url: "/me", headers: { cookie }, payload: { bio: "Something" } });
    await ctx.app.inject({ method: "PATCH", url: "/me", headers: { cookie }, payload: { bio: null } });
    // null means clear; absent means leave alone. They must not be the same.
    expect((await ctx.app.inject({ method: "GET", url: "/auth/me", headers: { cookie } })).json().bio).toBeNull();
  });

  it("refuses an anonymous caller", async () => {
    const res = await ctx.app.inject({ method: "PATCH", url: "/me", payload: { name: "Nobody" } });
    expect(res.statusCode).toBe(401);
  });

  it("cannot be used to change a User's own email, roles or status", async () => {
    const { cookie, userId } = await registerAndGetCookie(ctx, "asha@example.com");
    const res = await ctx.app.inject({
      method: "PATCH",
      url: "/me",
      headers: { cookie },
      payload: { name: "Asha", email: "admin@example.com", status: "active", roles: ["Super Admin"] },
    });

    // 200, not 400: `additionalProperties: false` plus Fastify's ajv
    // removeAdditional means the extras are stripped before the handler ever
    // sees them, rather than rejected. What matters is that they cannot reach
    // the UPDATE — self-promotion is not a profile edit, and the email is the
    // login identity, not a display field.
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("Asha");
    expect(res.json().roles).toEqual([]);

    const { rows } = await ctx.db.query<{ email: string; status: string }>(
      `SELECT email, status FROM users WHERE id = $1`,
      [userId],
    );
    expect(rows[0].email).toBe("asha@example.com");
  });

  it("rejects an empty name", async () => {
    const { cookie } = await registerAndGetCookie(ctx, "asha@example.com");
    expect((await ctx.app.inject({ method: "PATCH", url: "/me", headers: { cookie }, payload: { name: "" } })).statusCode).toBe(400);
  });

  it("returns the caller's permissions alongside the updated profile", async () => {
    const { cookie } = await registerAndGetCookie(ctx, "asha@example.com");
    const res = await ctx.app.inject({ method: "PATCH", url: "/me", headers: { cookie }, payload: { name: "Asha" } });
    // Same shape as /auth/me, so the client can swap it straight into its cache.
    expect(res.json().permissions).toEqual([]);
    expect(res.json().roles).toEqual([]);
  });

  it("auto-generates a valid, unique username at registration (issue #14)", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "gen@example.com", password: "password123", name: "Test User" },
    });
    expect(res.json().username).toMatch(/^[a-z][a-z0-9_]{2,19}$/);
  });

  it("resolves a username collision at registration with a distinct suffix, not a sequential counter", async () => {
    const first = await ctx.app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "collide1@example.com", password: "password123", name: "Same Name" },
    });
    const second = await ctx.app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "collide2@example.com", password: "password123", name: "Same Name" },
    });
    expect(first.json().username).not.toBe(second.json().username);
  });

  it("accepts and persists username, dateOfBirth and gender", async () => {
    const { cookie } = await registerAndGetCookie(ctx, "fields@example.com");
    const res = await ctx.app.inject({
      method: "PATCH",
      url: "/me",
      headers: { cookie },
      payload: { username: "ravi_kumar1", dateOfBirth: "1990-05-15", gender: "Male" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ username: "ravi_kumar1", dateOfBirth: "1990-05-15", gender: "Male" });
  });

  it("rejects a malformed username with 400", async () => {
    const { cookie } = await registerAndGetCookie(ctx, "badusername@example.com");
    const res = await ctx.app.inject({ method: "PATCH", url: "/me", headers: { cookie }, payload: { username: "1abc" } });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a duplicate username with 409", async () => {
    const { cookie: cookieA } = await registerAndGetCookie(ctx, "userA@example.com");
    const { cookie: cookieB, userId: userBId } = await registerAndGetCookie(ctx, "userB@example.com");
    await ctx.app.inject({ method: "PATCH", url: "/me", headers: { cookie: cookieA }, payload: { username: "takenname" } });

    const res = await ctx.app.inject({ method: "PATCH", url: "/me", headers: { cookie: cookieB }, payload: { username: "takenname" } });
    expect(res.statusCode).toBe(409);

    const { rows } = await ctx.db.query<{ username: string }>(`SELECT username FROM users WHERE id = $1`, [userBId]);
    expect(rows[0].username).not.toBe("takenname");
  });

  it("clearing dateOfBirth/gender with null works the same as phone/bio; leaving them absent leaves them untouched", async () => {
    const { cookie } = await registerAndGetCookie(ctx, "dobgender@example.com");
    await ctx.app.inject({ method: "PATCH", url: "/me", headers: { cookie }, payload: { dateOfBirth: "1990-01-01", gender: "Female" } });
    await ctx.app.inject({ method: "PATCH", url: "/me", headers: { cookie }, payload: { name: "Only Name" } });

    const me = await ctx.app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    expect(me.json()).toMatchObject({ dateOfBirth: "1990-01-01", gender: "Female" });

    await ctx.app.inject({ method: "PATCH", url: "/me", headers: { cookie }, payload: { dateOfBirth: null, gender: null } });
    const cleared = await ctx.app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    expect(cleared.json()).toMatchObject({ dateOfBirth: null, gender: null });
  });
});

describe("GET /me/username-available", () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });
  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("reports a free username as available and a taken one as not", async () => {
    const { cookie: cookieA } = await registerAndGetCookie(ctx, "avail-a@example.com");
    const { cookie: cookieB } = await registerAndGetCookie(ctx, "avail-b@example.com");
    await ctx.app.inject({ method: "PATCH", url: "/me", headers: { cookie: cookieA }, payload: { username: "existingname" } });

    const free = await ctx.app.inject({ method: "GET", url: "/me/username-available?username=freshname", headers: { cookie: cookieB } });
    expect(free.json()).toEqual({ available: true });

    const taken = await ctx.app.inject({ method: "GET", url: "/me/username-available?username=existingname", headers: { cookie: cookieB } });
    expect(taken.json()).toEqual({ available: false });
  });

  it("reports the caller's own current username as available (not taken by themselves)", async () => {
    const { cookie } = await registerAndGetCookie(ctx, "self-check@example.com");
    const me = await ctx.app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    const ownUsername = me.json().username;

    const res = await ctx.app.inject({ method: "GET", url: `/me/username-available?username=${ownUsername}`, headers: { cookie } });
    expect(res.json()).toEqual({ available: true });
  });

  it("rejects an anonymous caller with 401", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/me/username-available?username=whoever" });
    expect(res.statusCode).toBe(401);
  });
});

describe("POST /me/avatar", () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });
  afterEach(async () => {
    await closeTestApp(ctx);
  });

  function buildMultipart(file: { filename: string; content: Buffer; contentType: string }): { body: Buffer; contentType: string } {
    const boundary = `----testboundary${Date.now()}${Math.random().toString(16).slice(2)}`;
    const parts: Buffer[] = [
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
      ),
      file.content,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ];
    return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
  }

  it("accepts a valid PNG under the size cap, storing it and returning a fetchable, persisted avatarUrl", async () => {
    const { cookie } = await registerAndGetCookie(ctx, "avatar1@example.com");
    const { body, contentType } = buildMultipart({ filename: "me.png", content: Buffer.from("fake-png-bytes"), contentType: "image/png" });

    const res = await ctx.app.inject({
      method: "POST",
      url: "/me/avatar",
      headers: { cookie, "content-type": contentType },
      payload: body,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().avatarUrl).toMatch(/^\/uploads\/avatars\//);

    const me = await ctx.app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    expect(me.json().avatarUrl).toBe(res.json().avatarUrl);
  });

  it("rejects a non-image content type with 400", async () => {
    const { cookie } = await registerAndGetCookie(ctx, "avatar2@example.com");
    const { body, contentType } = buildMultipart({ filename: "me.gif", content: Buffer.from("gif-bytes"), contentType: "image/gif" });

    const res = await ctx.app.inject({
      method: "POST",
      url: "/me/avatar",
      headers: { cookie, "content-type": contentType },
      payload: body,
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a file over the size cap with 400", async () => {
    const { cookie } = await registerAndGetCookie(ctx, "avatar3@example.com");
    const oversized = Buffer.alloc(2 * 1024 * 1024 + 1, 1);
    const { body, contentType } = buildMultipart({ filename: "big.png", content: oversized, contentType: "image/png" });

    const res = await ctx.app.inject({
      method: "POST",
      url: "/me/avatar",
      headers: { cookie, "content-type": contentType },
      payload: body,
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an anonymous caller with 401", async () => {
    const { body, contentType } = buildMultipart({ filename: "me.png", content: Buffer.from("x"), contentType: "image/png" });
    const res = await ctx.app.inject({ method: "POST", url: "/me/avatar", headers: { "content-type": contentType }, payload: body });
    expect(res.statusCode).toBe(401);
  });
});
