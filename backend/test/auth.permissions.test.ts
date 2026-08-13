import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

/**
 * /auth/me returns the caller's effective permissions, not just their Role
 * names (Phase 10).
 *
 * This is what makes a Super-Admin-created custom Role usable. Branching the
 * Admin panel on role names would mean a "Content Moderator" sees the Business
 * Owner UI or nothing — an admin panel contradicting its own Roles &
 * Permissions screen.
 *
 * The list is advisory, for rendering only: every endpoint keeps its own
 * requirePermission guard. Hiding a button is a courtesy, not a control.
 */

async function me(ctx: TestContext, cookie: string) {
  const res = await ctx.app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
  return res.json();
}

function has(body: { permissions: { module: string; action: string }[] }, module: string, action: string): boolean {
  return body.permissions.some((p) => p.module === module && p.action === action);
}

describe("/auth/me — effective permissions", () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });
  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("gives a Super Admin every permission", async () => {
    const { cookie, userId } = await registerAndGetCookie(ctx, "admin@example.com");
    await grantRole(ctx.db, userId, "Super Admin");
    const body = await me(ctx, cookie);

    const { rows } = await ctx.db.query<{ count: string }>(`SELECT COUNT(*) FROM permissions`);
    expect(body.permissions).toHaveLength(Number(rows[0].count));
    expect(has(body, "Listings", "approve")).toBe(true);
  });

  it("gives a Business Owner only their starter set", async () => {
    const { cookie, userId } = await registerAndGetCookie(ctx, "owner@example.com");
    await grantRole(ctx.db, userId, "Business Owner");
    const body = await me(ctx, cookie);

    expect(has(body, "Listings", "edit")).toBe(true);
    expect(has(body, "Enquiries", "view")).toBe(true);
    // Not theirs: approving their own Listing would defeat the approval gate.
    expect(has(body, "Listings", "approve")).toBe(false);
    expect(has(body, "Users", "edit")).toBe(false);
  });

  it("gives a User with no Roles an empty list, not an error", async () => {
    const { cookie } = await registerAndGetCookie(ctx, "visitor@example.com");
    const body = await me(ctx, cookie);
    // A plain public visitor is a real, roleless account (CONTEXT.md).
    expect(body.permissions).toEqual([]);
    expect(body.roles).toEqual([]);
  });

  it("describes a custom Role by what it can do — the point of the RBAC module", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");

    const role = await ctx.app.inject({
      method: "POST",
      url: "/roles",
      headers: { cookie: adminCookie },
      payload: { name: "Content Moderator" },
    });
    const roleId = role.json().id;
    await ctx.app.inject({
      method: "PUT",
      url: `/roles/${roleId}/permissions`,
      headers: { cookie: adminCookie },
      payload: [
        { module: "Reviews", action: "approve" },
        { module: "Content", action: "edit" },
      ],
    });

    const { cookie: modCookie, userId: modId } = await registerAndGetCookie(ctx, "mod@example.com");
    await ctx.app.inject({
      method: "PUT",
      url: `/users/${modId}/roles`,
      headers: { cookie: adminCookie },
      payload: { roleIds: [roleId] },
    });

    const body = await me(ctx, modCookie);
    expect(body.roles).toEqual(["Content Moderator"]);
    expect(has(body, "Reviews", "approve")).toBe(true);
    expect(has(body, "Content", "edit")).toBe(true);
    expect(has(body, "Listings", "delete")).toBe(false);
  });

  it("reflects a Role's permissions changing on the next call", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const role = await ctx.app.inject({
      method: "POST",
      url: "/roles",
      headers: { cookie: adminCookie },
      payload: { name: "Helper" },
    });
    const roleId = role.json().id;
    const { cookie: helperCookie, userId: helperId } = await registerAndGetCookie(ctx, "helper@example.com");
    await ctx.app.inject({
      method: "PUT",
      url: `/users/${helperId}/roles`,
      headers: { cookie: adminCookie },
      payload: { roleIds: [roleId] },
    });

    expect((await me(ctx, helperCookie)).permissions).toEqual([]);

    await ctx.app.inject({
      method: "PUT",
      url: `/roles/${roleId}/permissions`,
      headers: { cookie: adminCookie },
      payload: [{ module: "Enquiries", action: "view" }],
    });

    // No re-login: the session carries identity, not a permission snapshot.
    expect(has(await me(ctx, helperCookie), "Enquiries", "view")).toBe(true);
  });

  it("unions the permissions of a User holding several Roles", async () => {
    const { cookie, userId } = await registerAndGetCookie(ctx, "both@example.com");
    // CONTEXT.md: a User can hold more than one Role.
    await grantRole(ctx.db, userId, "Business Owner");
    await grantRole(ctx.db, userId, "Super Admin");
    const body = await me(ctx, cookie);

    expect(has(body, "Listings", "approve")).toBe(true);
    // Held via both Roles — must appear once, not twice.
    expect(body.permissions.filter((p: { module: string; action: string }) => p.module === "Listings" && p.action === "edit")).toHaveLength(1);
  });

  it("still requires a session", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/auth/me" });
    expect(res.statusCode).toBe(401);
  });
});
