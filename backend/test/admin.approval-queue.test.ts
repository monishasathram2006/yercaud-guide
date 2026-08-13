import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

describe("GET /admin/approval-queue", () => {
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
    const response = await ctx.app.inject({ method: "GET", url: "/admin/approval-queue", headers: { cookie } });
    expect(response.statusCode).toBe(403);
  });

  it("lists pending Businesses, Listings, and Reviews, oldest first", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner@example.com");

    const biz = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerCookie }, payload: { name: "Pending Biz" } });
    const businessId = biz.json().id;
    await ctx.app.inject({ method: "POST", url: `/businesses/${businessId}/approve`, headers: { cookie: adminCookie } });
    const { rows: catRows } = await ctx.db.query<{ id: string }>(
      `INSERT INTO categories (name, slug, has_detail_table) VALUES ('Hotel', 'hotel', true) RETURNING id`,
    );
    const listing = await ctx.app.inject({
      method: "POST",
      url: "/listings",
      headers: { cookie: ownerCookie },
      payload: { businessId, categoryId: catRows[0].id, name: "Pending Listing" },
    });
    const listingId = listing.json().id;
    await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/approve`, headers: { cookie: adminCookie } });
    const { cookie: reviewerCookie } = await registerAndGetCookie(ctx, "reviewer@example.com");
    await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/reviews`,
      headers: { cookie: reviewerCookie },
      payload: { rating: 4, text: "Nice place" },
    });

    // A second Business, still pending, submitted after everything above.
    const { cookie: ownerBCookie } = await registerAndGetCookie(ctx, "ownerB@example.com");
    await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerBCookie }, payload: { name: "Newer Pending Biz" } });

    const response = await ctx.app.inject({ method: "GET", url: "/admin/approval-queue", headers: { cookie: adminCookie } });
    expect(response.statusCode).toBe(200);
    const kinds = response.json().map((item: { kind: string }) => item.kind);
    expect(kinds).toEqual(["review", "business"]);
    expect(response.json()[0].subject).toBe("4★ review on Pending Listing");
    expect(response.json()[1].subject).toBe("Newer Pending Biz");
  });
});
