import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, resetDb, type TestContext } from "./helpers.js";

describe("POST /auth/login", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
    await ctx.app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "carol@example.com", password: "correct horse battery staple", name: "Carol" },
    });
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("starts a session for correct credentials", async () => {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "carol@example.com", password: "correct horse battery staple" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().email).toBe("carol@example.com");
    expect(String(response.headers["set-cookie"])).toContain("session_id=");
  });

  it("rejects a wrong password with a generic 401", async () => {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "carol@example.com", password: "wrong password" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an unknown email with the same generic 401 (no account enumeration)", async () => {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "nobody@example.com", password: "correct horse battery staple" },
    });

    expect(response.statusCode).toBe(401);
  });
});
