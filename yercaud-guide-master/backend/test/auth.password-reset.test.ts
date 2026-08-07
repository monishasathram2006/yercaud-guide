import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, resetDb, type TestContext } from "./helpers.js";

describe("Password reset", () => {
  let ctx: TestContext;
  let sentEmails: { email: string; token: string }[];

  beforeEach(async () => {
    sentEmails = [];
    ctx = await buildTestApp({
      sendPasswordResetEmail: async (email, token) => {
        sentEmails.push({ email, token });
      },
    });
    await resetDb(ctx.db);
    await ctx.app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "frank@example.com", password: "original password value", name: "Frank" },
    });
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("queues a reset email for a known account", async () => {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/auth/password-reset/request",
      payload: { email: "frank@example.com" },
    });

    expect(response.statusCode).toBe(202);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].email).toBe("frank@example.com");
    expect(sentEmails[0].token).toBeTruthy();
  });

  it("returns the same 202 for an unknown email, without sending anything (no account enumeration)", async () => {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/auth/password-reset/request",
      payload: { email: "nobody@example.com" },
    });

    expect(response.statusCode).toBe(202);
    expect(sentEmails).toHaveLength(0);
  });

  it("lets the user set a new password with a valid token, and log in with it", async () => {
    await ctx.app.inject({
      method: "POST",
      url: "/auth/password-reset/request",
      payload: { email: "frank@example.com" },
    });
    const { token } = sentEmails[0];

    const confirm = await ctx.app.inject({
      method: "POST",
      url: "/auth/password-reset/confirm",
      payload: { token, password: "brand new password value" },
    });
    expect(confirm.statusCode).toBe(204);

    const login = await ctx.app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "frank@example.com", password: "brand new password value" },
    });
    expect(login.statusCode).toBe(200);

    const oldLogin = await ctx.app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "frank@example.com", password: "original password value" },
    });
    expect(oldLogin.statusCode).toBe(401);
  });

  it("rejects reusing an already-used token", async () => {
    await ctx.app.inject({
      method: "POST",
      url: "/auth/password-reset/request",
      payload: { email: "frank@example.com" },
    });
    const { token } = sentEmails[0];

    await ctx.app.inject({
      method: "POST",
      url: "/auth/password-reset/confirm",
      payload: { token, password: "brand new password value" },
    });

    const secondAttempt = await ctx.app.inject({
      method: "POST",
      url: "/auth/password-reset/confirm",
      payload: { token, password: "yet another password value" },
    });

    expect(secondAttempt.statusCode).toBe(400);
  });

  it("rejects a nonexistent token", async () => {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/auth/password-reset/confirm",
      payload: { token: "not-a-real-token", password: "brand new password value" },
    });

    expect(response.statusCode).toBe(400);
  });
});
