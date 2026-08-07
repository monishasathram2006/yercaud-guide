import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

describe("Businesses (application, approval queue, profile CRUD)", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("rejects an application from an anonymous caller with 401", async () => {
    const response = await ctx.app.inject({ method: "POST", url: "/businesses", payload: { name: "Lake View Inn" } });
    expect(response.statusCode).toBe(401);
  });

  it("lets any signed-in user apply, starting as pending and owned by them", async () => {
    const { cookie, userId } = await registerAndGetCookie(ctx, "applicant@example.com");

    const response = await ctx.app.inject({
      method: "POST",
      url: "/businesses",
      headers: { cookie },
      payload: { name: "Lake View Inn", contactEmail: "hello@lakeview.example" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.status).toBe("pending");
    expect(body.ownerId).toBe(userId);
    expect(body.name).toBe("Lake View Inn");
  });

  it("lets an applicant see their own pending application in the list", async () => {
    const { cookie } = await registerAndGetCookie(ctx, "applicant2@example.com");
    await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie }, payload: { name: "My Cafe" } });

    const list = await ctx.app.inject({ method: "GET", url: "/businesses", headers: { cookie } });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(1);
    expect(list.json()[0].name).toBe("My Cafe");
  });

  it("does not let one applicant see another applicant's business in the list", async () => {
    const { cookie: cookieA } = await registerAndGetCookie(ctx, "ownerA@example.com");
    const { cookie: cookieB } = await registerAndGetCookie(ctx, "ownerB@example.com");
    await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: cookieA }, payload: { name: "A's Business" } });

    const list = await ctx.app.inject({ method: "GET", url: "/businesses", headers: { cookie: cookieB } });
    expect(list.json()).toHaveLength(0);
  });

  it("lets a Super Admin list every business regardless of owner", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner@example.com");
    await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerCookie }, payload: { name: "Owner's Business" } });

    const list = await ctx.app.inject({ method: "GET", url: "/businesses", headers: { cookie: adminCookie } });
    expect(list.json()).toHaveLength(1);
  });

  it("blocks one owner from viewing another owner's business with 403", async () => {
    const { cookie: cookieA } = await registerAndGetCookie(ctx, "ownerA2@example.com");
    const { cookie: cookieB } = await registerAndGetCookie(ctx, "ownerB2@example.com");
    const create = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: cookieA }, payload: { name: "A's Business" } });
    const businessId = create.json().id;

    const response = await ctx.app.inject({ method: "GET", url: `/businesses/${businessId}`, headers: { cookie: cookieB } });
    expect(response.statusCode).toBe(403);
  });

  // Phase 10: the public Listing page shows its Business's address, email and
  // social links. Before this, only phone and website were reachable publicly
  // (they ride along on ListingSummary) — the rest was behind Businesses:view.
  it("lets anyone read an approved Business — a directory nobody can read is not a directory", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin-pub@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner-pub@example.com");
    const create = await ctx.app.inject({
      method: "POST",
      url: "/businesses",
      headers: { cookie: ownerCookie },
      payload: { name: "Palace Group", contactEmail: "hello@palace.test", address: "Anna Salai, Yercaud" },
    });
    const businessId = create.json().id;

    // Still hidden while pending.
    expect((await ctx.app.inject({ method: "GET", url: `/businesses/${businessId}` })).statusCode).toBe(401);

    await ctx.app.inject({ method: "POST", url: `/businesses/${businessId}/approve`, headers: { cookie: adminCookie } });

    const response = await ctx.app.inject({ method: "GET", url: `/businesses/${businessId}` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ name: "Palace Group", contactEmail: "hello@palace.test", address: "Anna Salai, Yercaud" });
  });

  it("keeps 403 for one owner probing another's pending Business", async () => {
    const { cookie: cookieA } = await registerAndGetCookie(ctx, "ownerA-pend@example.com");
    const { cookie: cookieB } = await registerAndGetCookie(ctx, "ownerB-pend@example.com");
    const create = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: cookieA }, payload: { name: "A's Business" } });

    // 403, not 404: Phase 1 chose that distinction deliberately, and opening
    // approved Businesses must not quietly rewrite it.
    const response = await ctx.app.inject({ method: "GET", url: `/businesses/${create.json().id}`, headers: { cookie: cookieB } });
    expect(response.statusCode).toBe(403);
  });

  it("blocks one owner from editing another owner's business with 403", async () => {
    const { cookie: cookieA } = await registerAndGetCookie(ctx, "ownerA3@example.com");
    const { cookie: cookieB } = await registerAndGetCookie(ctx, "ownerB3@example.com");
    const create = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: cookieA }, payload: { name: "A's Business" } });
    const businessId = create.json().id;

    const response = await ctx.app.inject({
      method: "PATCH",
      url: `/businesses/${businessId}`,
      headers: { cookie: cookieB },
      payload: { name: "Hijacked" },
    });
    expect(response.statusCode).toBe(403);
  });

  it("lets the owner update their own business profile immediately, no re-approval (ADR 0005)", async () => {
    const { cookie } = await registerAndGetCookie(ctx, "owner4@example.com");
    const create = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie }, payload: { name: "Old Name" } });
    const businessId = create.json().id;

    const update = await ctx.app.inject({
      method: "PATCH",
      url: `/businesses/${businessId}`,
      headers: { cookie },
      payload: { name: "New Name", contactPhone: "555-1234" },
    });

    expect(update.statusCode).toBe(200);
    expect(update.json().name).toBe("New Name");
    expect(update.json().status).toBe("pending");
  });

  it("approves a pending business and grants the Business Owner role to its owner (FR161)", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin2@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie, userId: ownerId } = await registerAndGetCookie(ctx, "owner5@example.com");
    const create = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerCookie }, payload: { name: "Soon Approved" } });
    const businessId = create.json().id;

    const approve = await ctx.app.inject({ method: "POST", url: `/businesses/${businessId}/approve`, headers: { cookie: adminCookie } });
    expect(approve.statusCode).toBe(200);
    expect(approve.json().status).toBe("approved");

    const roles = await ctx.db.query(
      `SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1`,
      [ownerId],
    );
    expect(roles.rows.map((r) => r.name)).toContain("Business Owner");
  });

  it("rejects a non-Super-Admin's attempt to approve with 403", async () => {
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner6@example.com");
    const create = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerCookie }, payload: { name: "Nope" } });
    const businessId = create.json().id;

    const approve = await ctx.app.inject({ method: "POST", url: `/businesses/${businessId}/approve`, headers: { cookie: ownerCookie } });
    expect(approve.statusCode).toBe(403);
  });

  it("rejects a pending business with a reason, and the reason is persisted", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin3@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner7@example.com");
    const create = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerCookie }, payload: { name: "Bad Application" } });
    const businessId = create.json().id;

    const reject = await ctx.app.inject({
      method: "POST",
      url: `/businesses/${businessId}/reject`,
      headers: { cookie: adminCookie },
      payload: { reason: "Missing contact details" },
    });
    expect(reject.statusCode).toBe(200);
    expect(reject.json().status).toBe("rejected");
    expect(reject.json().rejectionReason).toBe("Missing contact details");
  });

  it("clears the rejection reason when a rejected business is later approved", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin4@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner8@example.com");
    const create = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerCookie }, payload: { name: "Second Try" } });
    const businessId = create.json().id;
    await ctx.app.inject({
      method: "POST",
      url: `/businesses/${businessId}/reject`,
      headers: { cookie: adminCookie },
      payload: { reason: "Not enough info" },
    });

    const approve = await ctx.app.inject({ method: "POST", url: `/businesses/${businessId}/approve`, headers: { cookie: adminCookie } });
    expect(approve.statusCode).toBe(200);
    expect(approve.json().rejectionReason).toBeNull();
  });

  it("returns a clean 409 when approving a business that isn't pending or rejected", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin5@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner9@example.com");
    const create = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerCookie }, payload: { name: "Already Approved" } });
    const businessId = create.json().id;
    await ctx.app.inject({ method: "POST", url: `/businesses/${businessId}/approve`, headers: { cookie: adminCookie } });

    const secondApprove = await ctx.app.inject({ method: "POST", url: `/businesses/${businessId}/approve`, headers: { cookie: adminCookie } });
    expect(secondApprove.statusCode).toBe(409);
  });

  it("suspends an approved business (Super Admin) and returns a 409 if it wasn't approved", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin6@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner10@example.com");
    const create = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerCookie }, payload: { name: "To Suspend" } });
    const businessId = create.json().id;

    const suspendTooEarly = await ctx.app.inject({ method: "POST", url: `/businesses/${businessId}/suspend`, headers: { cookie: adminCookie } });
    expect(suspendTooEarly.statusCode).toBe(409);

    await ctx.app.inject({ method: "POST", url: `/businesses/${businessId}/approve`, headers: { cookie: adminCookie } });
    const suspend = await ctx.app.inject({ method: "POST", url: `/businesses/${businessId}/suspend`, headers: { cookie: adminCookie } });
    expect(suspend.statusCode).toBe(200);
    expect(suspend.json().status).toBe("suspended");
  });

  it("archives a business, hiding it from the public site while its history is kept (ADR 0010)", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin7@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner11@example.com");
    const create = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerCookie }, payload: { name: "To Archive" } });
    const businessId = create.json().id;

    const archive = await ctx.app.inject({ method: "POST", url: `/businesses/${businessId}/archive`, headers: { cookie: adminCookie } });
    expect(archive.statusCode).toBe(200);
    expect(archive.json().status).toBe("archived");

    const stillThere = await ctx.db.query("SELECT 1 FROM businesses WHERE id = $1", [businessId]);
    expect(stillThere.rows).toHaveLength(1);
  });

  it("keeps the rejection reason when a rejected business is archived, not cleared (ADR 0010: history preserved)", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin9@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner12@example.com");
    const create = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerCookie }, payload: { name: "Rejected Then Archived" } });
    const businessId = create.json().id;
    await ctx.app.inject({
      method: "POST",
      url: `/businesses/${businessId}/reject`,
      headers: { cookie: adminCookie },
      payload: { reason: "Duplicate listing" },
    });

    const archive = await ctx.app.inject({ method: "POST", url: `/businesses/${businessId}/archive`, headers: { cookie: adminCookie } });
    expect(archive.statusCode).toBe(200);
    expect(archive.json().status).toBe("archived");
    expect(archive.json().rejectionReason).toBe("Duplicate listing");
  });

  it("returns 404 for approve/reject/suspend/archive on a business that doesn't exist", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin8@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");

    const response = await ctx.app.inject({
      method: "POST",
      url: "/businesses/00000000-0000-0000-0000-000000000000/approve",
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(404);
  });
});
