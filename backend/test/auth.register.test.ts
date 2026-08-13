import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, resetDb, type TestContext } from "./helpers.js";

describe("POST /auth/register", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("creates an account and starts a session", async () => {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "alice@example.com", password: "correct horse battery staple", name: "Alice" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.email).toBe("alice@example.com");
    expect(body.name).toBe("Alice");
    expect(body.status).toBe("active");
    expect(body.passwordHash).toBeUndefined();
    expect(body.password).toBeUndefined();

    const setCookie = response.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    expect(String(setCookie)).toContain("session_id=");
  });

  it("rejects a password shorter than 8 characters with a clean 400, not a raw DB error", async () => {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "short@example.com", password: "short", name: "Short" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("rejects a malformed email with a clean 400", async () => {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "not-an-email", password: "correct horse battery staple", name: "Bad Email" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("rejects a missing name with a clean 400", async () => {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "noname@example.com", password: "correct horse battery staple" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("rejects a duplicate email with a generic conflict, not the other account's details", async () => {
    await ctx.app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "bob@example.com", password: "correct horse battery staple", name: "Bob" },
    });

    const response = await ctx.app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "bob@example.com", password: "another password entirely", name: "Bob Two" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().name).not.toBe("Bob");
  });
});
