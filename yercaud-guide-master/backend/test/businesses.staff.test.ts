import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

async function createBusiness(ctx: TestContext, ownerCookie: string, name: string): Promise<string> {
  const response = await ctx.app.inject({
    method: "POST",
    url: "/businesses",
    headers: { cookie: ownerCookie },
    payload: { name },
  });
  return response.json().id;
}

describe("Business staff (FR163)", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("lets the owner invite an existing registered user by email", async () => {
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner@example.com");
    const { userId: staffUserId } = await registerAndGetCookie(ctx, "staff@example.com");
    const businessId = await createBusiness(ctx, ownerCookie, "Biz");

    const invite = await ctx.app.inject({
      method: "POST",
      url: `/businesses/${businessId}/staff`,
      headers: { cookie: ownerCookie },
      payload: { email: "staff@example.com", permissions: { Listings: true } },
    });

    expect(invite.statusCode).toBe(201);
    expect(invite.json().userId).toBe(staffUserId);
    expect(invite.json().status).toBe("pending");
    expect(invite.json().email).toBe("staff@example.com");
  });

  it("rejects inviting an email with no registered user, with a clean 400", async () => {
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner2@example.com");
    const businessId = await createBusiness(ctx, ownerCookie, "Biz2");

    const invite = await ctx.app.inject({
      method: "POST",
      url: `/businesses/${businessId}/staff`,
      headers: { cookie: ownerCookie },
      payload: { email: "nobody@example.com" },
    });

    expect(invite.statusCode).toBe(400);
  });

  it("returns a clean 409 when inviting the same user twice", async () => {
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner3@example.com");
    await registerAndGetCookie(ctx, "staff2@example.com");
    const businessId = await createBusiness(ctx, ownerCookie, "Biz3");

    await ctx.app.inject({
      method: "POST",
      url: `/businesses/${businessId}/staff`,
      headers: { cookie: ownerCookie },
      payload: { email: "staff2@example.com" },
    });
    const dupe = await ctx.app.inject({
      method: "POST",
      url: `/businesses/${businessId}/staff`,
      headers: { cookie: ownerCookie },
      payload: { email: "staff2@example.com" },
    });

    expect(dupe.statusCode).toBe(409);
  });

  it("blocks a non-owner, non-admin from inviting staff with 403", async () => {
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner4@example.com");
    const { cookie: strangerCookie } = await registerAndGetCookie(ctx, "stranger@example.com");
    await registerAndGetCookie(ctx, "staff3@example.com");
    const businessId = await createBusiness(ctx, ownerCookie, "Biz4");

    const invite = await ctx.app.inject({
      method: "POST",
      url: `/businesses/${businessId}/staff`,
      headers: { cookie: strangerCookie },
      payload: { email: "staff3@example.com" },
    });

    expect(invite.statusCode).toBe(403);
  });

  it("lets the invited staff member accept their own pending invite", async () => {
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner5@example.com");
    const { cookie: staffCookie } = await registerAndGetCookie(ctx, "staff4@example.com");
    const businessId = await createBusiness(ctx, ownerCookie, "Biz5");
    const invite = await ctx.app.inject({
      method: "POST",
      url: `/businesses/${businessId}/staff`,
      headers: { cookie: ownerCookie },
      payload: { email: "staff4@example.com" },
    });
    const staffId = invite.json().id;

    const accept = await ctx.app.inject({
      method: "PATCH",
      url: `/businesses/${businessId}/staff/${staffId}`,
      headers: { cookie: staffCookie },
      payload: { status: "accepted" },
    });

    expect(accept.statusCode).toBe(200);
    expect(accept.json().status).toBe("accepted");
  });

  it("blocks the invited staff member from granting themselves permissions or any status other than accepted", async () => {
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner6@example.com");
    const { cookie: staffCookie } = await registerAndGetCookie(ctx, "staff5@example.com");
    const businessId = await createBusiness(ctx, ownerCookie, "Biz6");
    const invite = await ctx.app.inject({
      method: "POST",
      url: `/businesses/${businessId}/staff`,
      headers: { cookie: ownerCookie },
      payload: { email: "staff5@example.com" },
    });
    const staffId = invite.json().id;

    const selfGrant = await ctx.app.inject({
      method: "PATCH",
      url: `/businesses/${businessId}/staff/${staffId}`,
      headers: { cookie: staffCookie },
      payload: { permissions: { Listings: true } },
    });
    expect(selfGrant.statusCode).toBe(403);

    const selfRevive = await ctx.app.inject({
      method: "PATCH",
      url: `/businesses/${businessId}/staff/${staffId}`,
      headers: { cookie: staffCookie },
      payload: { status: "pending" },
    });
    expect(selfRevive.statusCode).toBe(403);
  });

  it("lets the owner update a staff member's permissions and status", async () => {
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner7@example.com");
    await registerAndGetCookie(ctx, "staff6@example.com");
    const businessId = await createBusiness(ctx, ownerCookie, "Biz7");
    const invite = await ctx.app.inject({
      method: "POST",
      url: `/businesses/${businessId}/staff`,
      headers: { cookie: ownerCookie },
      payload: { email: "staff6@example.com" },
    });
    const staffId = invite.json().id;

    const update = await ctx.app.inject({
      method: "PATCH",
      url: `/businesses/${businessId}/staff/${staffId}`,
      headers: { cookie: ownerCookie },
      payload: { permissions: { Enquiries: true }, status: "accepted" },
    });

    expect(update.statusCode).toBe(200);
    expect(update.json().permissions).toEqual({ Enquiries: true });
    expect(update.json().status).toBe("accepted");
  });

  it("lets the owner revoke (hard-delete) a staff member", async () => {
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner8@example.com");
    await registerAndGetCookie(ctx, "staff7@example.com");
    const businessId = await createBusiness(ctx, ownerCookie, "Biz8");
    const invite = await ctx.app.inject({
      method: "POST",
      url: `/businesses/${businessId}/staff`,
      headers: { cookie: ownerCookie },
      payload: { email: "staff7@example.com" },
    });
    const staffId = invite.json().id;

    const revoke = await ctx.app.inject({
      method: "DELETE",
      url: `/businesses/${businessId}/staff/${staffId}`,
      headers: { cookie: ownerCookie },
    });
    expect(revoke.statusCode).toBe(204);

    const list = await ctx.app.inject({
      method: "GET",
      url: `/businesses/${businessId}/staff`,
      headers: { cookie: ownerCookie },
    });
    expect(list.json()).toHaveLength(0);
  });

  it("blocks a non-owner from revoking staff with 403", async () => {
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner9@example.com");
    const { cookie: strangerCookie } = await registerAndGetCookie(ctx, "stranger2@example.com");
    await registerAndGetCookie(ctx, "staff8@example.com");
    const businessId = await createBusiness(ctx, ownerCookie, "Biz9");
    const invite = await ctx.app.inject({
      method: "POST",
      url: `/businesses/${businessId}/staff`,
      headers: { cookie: ownerCookie },
      payload: { email: "staff8@example.com" },
    });
    const staffId = invite.json().id;

    const revoke = await ctx.app.inject({
      method: "DELETE",
      url: `/businesses/${businessId}/staff/${staffId}`,
      headers: { cookie: strangerCookie },
    });
    expect(revoke.statusCode).toBe(403);
  });

  it("lets a Super Admin manage staff on any business without being the owner", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner10@example.com");
    await registerAndGetCookie(ctx, "staff9@example.com");
    const businessId = await createBusiness(ctx, ownerCookie, "Biz10");

    const invite = await ctx.app.inject({
      method: "POST",
      url: `/businesses/${businessId}/staff`,
      headers: { cookie: adminCookie },
      payload: { email: "staff9@example.com" },
    });
    expect(invite.statusCode).toBe(201);

    const list = await ctx.app.inject({
      method: "GET",
      url: `/businesses/${businessId}/staff`,
      headers: { cookie: adminCookie },
    });
    expect(list.json()).toHaveLength(1);
  });
});
