import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

describe("RBAC", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("lists the seeded system roles", async () => {
    const { cookie, userId } = await registerAndGetCookie(ctx, "admin1@example.com");
    await grantRole(ctx.db, userId, "Super Admin");

    const response = await ctx.app.inject({ method: "GET", url: "/roles", headers: { cookie } });

    expect(response.statusCode).toBe(200);
    const names = response.json().map((r: { name: string }) => r.name);
    expect(names).toContain("Super Admin");
    expect(names).toContain("Business Owner");
  });

  it("embeds each role's permission grants in the list", async () => {
    const { cookie, userId } = await registerAndGetCookie(ctx, "admin6@example.com");
    await grantRole(ctx.db, userId, "Super Admin");

    const response = await ctx.app.inject({ method: "GET", url: "/roles", headers: { cookie } });
    const roles = response.json() as { name: string; permissions: { module: string; action: string }[] }[];
    const superAdmin = roles.find((r) => r.name === "Super Admin")!;
    expect(superAdmin.permissions.length).toBeGreaterThan(0);
    expect(superAdmin.permissions).toContainEqual({ module: "Admins", action: "view" });
  });

  it("returns 401 for an unauthenticated request", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/roles" });
    expect(response.statusCode).toBe(401);
  });

  it("returns 403 for an authenticated user without the Admins:view permission", async () => {
    const { cookie } = await registerAndGetCookie(ctx, "plain@example.com");
    const response = await ctx.app.inject({ method: "GET", url: "/roles", headers: { cookie } });
    expect(response.statusCode).toBe(403);
  });

  it("lets a Super Admin create a custom role, set its permissions, and assign it — taking effect on the next request", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin2@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");

    const { cookie: staffCookie, userId: staffId } = await registerAndGetCookie(ctx, "staff@example.com");

    // Staff has no permissions yet.
    const before = await ctx.app.inject({ method: "GET", url: "/roles", headers: { cookie: staffCookie } });
    expect(before.statusCode).toBe(403);

    const createRole = await ctx.app.inject({
      method: "POST",
      url: "/roles",
      headers: { cookie: adminCookie },
      payload: { name: "Moderator" },
    });
    expect(createRole.statusCode).toBe(201);
    const roleId = createRole.json().id;

    const setPermissions = await ctx.app.inject({
      method: "PUT",
      url: `/roles/${roleId}/permissions`,
      headers: { cookie: adminCookie },
      payload: [{ module: "Admins", action: "view" }],
    });
    expect(setPermissions.statusCode).toBe(200);

    const assign = await ctx.app.inject({
      method: "PUT",
      url: `/users/${staffId}/roles`,
      headers: { cookie: adminCookie },
      payload: { roleIds: [roleId] },
    });
    expect(assign.statusCode).toBe(200);

    const after = await ctx.app.inject({ method: "GET", url: "/roles", headers: { cookie: staffCookie } });
    expect(after.statusCode).toBe(200);
  });
});
