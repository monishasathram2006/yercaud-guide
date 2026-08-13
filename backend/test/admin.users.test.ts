import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

describe("GET /users (list/search)", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("blocks a non-admin with 403", async () => {
    const { cookie } = await registerAndGetCookie(ctx, "plain@example.com");
    const response = await ctx.app.inject({ method: "GET", url: "/users", headers: { cookie } });
    expect(response.statusCode).toBe(403);
  });

  it("lists all registered Users with their roles, for a Super Admin", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { userId: ownerId } = await registerAndGetCookie(ctx, "owner@example.com");
    await grantRole(ctx.db, ownerId, "Business Owner");

    const response = await ctx.app.inject({ method: "GET", url: "/users", headers: { cookie: adminCookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(2);
    const owner = response.json().find((u: { id: string }) => u.id === ownerId);
    expect(owner.roles).toEqual(["Business Owner"]);
  });

  it("filters by q against name/email", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin2@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    await registerAndGetCookie(ctx, "findme@example.com");
    await registerAndGetCookie(ctx, "someoneelse@example.com");

    const response = await ctx.app.inject({ method: "GET", url: "/users?q=findme", headers: { cookie: adminCookie } });
    expect(response.json()).toHaveLength(1);
    expect(response.json()[0].email).toBe("findme@example.com");
  });

  it("filters by status", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin3@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { userId: toSuspendId } = await registerAndGetCookie(ctx, "suspended3@example.com");
    await ctx.db.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [toSuspendId]);

    const response = await ctx.app.inject({ method: "GET", url: "/users?status=suspended", headers: { cookie: adminCookie } });
    expect(response.json()).toHaveLength(1);
    expect(response.json()[0].id).toBe(toSuspendId);
  });
});

describe("PATCH /users/:userId (suspend/reactivate)", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("blocks a non-admin with 403, even against their own account", async () => {
    const { cookie, userId } = await registerAndGetCookie(ctx, "plain4@example.com");
    const response = await ctx.app.inject({
      method: "PATCH",
      url: `/users/${userId}`,
      headers: { cookie },
      payload: { status: "suspended" },
    });
    expect(response.statusCode).toBe(403);
  });

  it("suspends and reactivates a User, returning the updated record", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin4@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { userId: targetId } = await registerAndGetCookie(ctx, "target4@example.com");

    const suspend = await ctx.app.inject({
      method: "PATCH",
      url: `/users/${targetId}`,
      headers: { cookie: adminCookie },
      payload: { status: "suspended" },
    });
    expect(suspend.statusCode).toBe(200);
    expect(suspend.json().status).toBe("suspended");

    const reactivate = await ctx.app.inject({
      method: "PATCH",
      url: `/users/${targetId}`,
      headers: { cookie: adminCookie },
      payload: { status: "active" },
    });
    expect(reactivate.json().status).toBe("active");
  });

  it("rejects 'deleted' as an assignable status with 400 — deletion has its own endpoint", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin5@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { userId: targetId } = await registerAndGetCookie(ctx, "target5@example.com");

    const response = await ctx.app.inject({
      method: "PATCH",
      url: `/users/${targetId}`,
      headers: { cookie: adminCookie },
      payload: { status: "deleted" },
    });
    expect(response.statusCode).toBe(400);
  });
});
