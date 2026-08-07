import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

describe("Impersonation ('view as', FR160)", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("lets a Super Admin impersonate a Business Owner, resolving subsequent requests as that owner", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie, userId: ownerId } = await registerAndGetCookie(ctx, "owner@example.com");
    await grantRole(ctx.db, ownerId, "Business Owner");
    await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerCookie }, payload: { name: "Owner Biz" } });

    const impersonate = await ctx.app.inject({
      method: "POST",
      url: `/users/${ownerId}/impersonate`,
      headers: { cookie: adminCookie },
    });
    expect(impersonate.statusCode).toBe(200);
    expect(impersonate.json().id).toBe(ownerId);
    expect(impersonate.json().impersonatedBy).toBe(adminId);

    const impersonationCookie = impersonate.headers["set-cookie"];
    const me = await ctx.app.inject({ method: "GET", url: "/auth/me", headers: { cookie: impersonationCookie as string } });
    expect(me.json().id).toBe(ownerId);
    expect(me.json().impersonatedBy).toBe(adminId);

    // Requests during the impersonation session resolve as the target Business Owner.
    const list = await ctx.app.inject({ method: "GET", url: "/businesses", headers: { cookie: impersonationCookie as string } });
    expect(list.json()).toHaveLength(1);
  });

  it("blocks impersonating a User who doesn't hold the Business Owner role", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin2@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { userId: plainId } = await registerAndGetCookie(ctx, "plain2@example.com");

    const response = await ctx.app.inject({
      method: "POST",
      url: `/users/${plainId}/impersonate`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(403);
  });

  it("blocks impersonating another Super Admin", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin3@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { userId: otherAdminId } = await registerAndGetCookie(ctx, "otherAdmin3@example.com");
    await grantRole(ctx.db, otherAdminId, "Super Admin");

    const response = await ctx.app.inject({
      method: "POST",
      url: `/users/${otherAdminId}/impersonate`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(403);
  });

  it("blocks a non-admin from starting impersonation with 403", async () => {
    const { cookie: ownerACookie } = await registerAndGetCookie(ctx, "ownerA4@example.com");
    const { userId: ownerBId } = await registerAndGetCookie(ctx, "ownerB4@example.com");

    const response = await ctx.app.inject({
      method: "POST",
      url: `/users/${ownerBId}/impersonate`,
      headers: { cookie: ownerACookie },
    });
    expect(response.statusCode).toBe(403);
  });

  it("restores the admin's own session on exit-impersonation", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin5@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { userId: ownerId } = await registerAndGetCookie(ctx, "owner5@example.com");
    await grantRole(ctx.db, ownerId, "Business Owner");

    const impersonate = await ctx.app.inject({ method: "POST", url: `/users/${ownerId}/impersonate`, headers: { cookie: adminCookie } });
    const impersonationCookie = impersonate.headers["set-cookie"] as string;

    const exit = await ctx.app.inject({ method: "POST", url: "/auth/exit-impersonation", headers: { cookie: impersonationCookie } });
    expect(exit.statusCode).toBe(200);
    expect(exit.json().id).toBe(adminId);
    expect(exit.json().impersonatedBy).toBeNull();

    const restoredCookie = exit.headers["set-cookie"] as string;
    const me = await ctx.app.inject({ method: "GET", url: "/auth/me", headers: { cookie: restoredCookie } });
    expect(me.json().id).toBe(adminId);
    expect(me.json().impersonatedBy).toBeNull();

    // The impersonation session was single-use — it can't be reused after exit.
    const reuse = await ctx.app.inject({ method: "GET", url: "/auth/me", headers: { cookie: impersonationCookie } });
    expect(reuse.statusCode).toBe(401);
  });

  it("rejects exit-impersonation when not currently impersonating anyone", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin6@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");

    const response = await ctx.app.inject({ method: "POST", url: "/auth/exit-impersonation", headers: { cookie: adminCookie } });
    expect(response.statusCode).toBe(403);
  });
});
