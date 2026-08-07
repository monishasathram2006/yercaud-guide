import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

async function setupOwnerWithApprovedListing(ctx: TestContext, adminCookie: string, ownerEmail: string) {
  const { cookie: ownerCookie } = await registerAndGetCookie(ctx, ownerEmail);
  const biz = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerCookie }, payload: { name: `Biz-${ownerEmail}` } });
  const businessId = biz.json().id;
  await ctx.app.inject({ method: "POST", url: `/businesses/${businessId}/approve`, headers: { cookie: adminCookie } });
  const { rows: catRows } = await ctx.db.query<{ id: string }>(
    `INSERT INTO categories (name, slug, has_detail_table) VALUES ('Hotel', 'hotel', true)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
  );
  const listing = await ctx.app.inject({
    method: "POST",
    url: "/listings",
    headers: { cookie: ownerCookie },
    payload: { businessId, categoryId: catRows[0].id, name: `Listing-${ownerEmail}` },
  });
  const listingId = listing.json().id;
  await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/approve`, headers: { cookie: adminCookie } });
  return { ownerCookie, businessId, listingId };
}

describe("GET /admin/dashboard", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("gives a Super Admin platform-wide totals across all owners", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    await setupOwnerWithApprovedListing(ctx, adminCookie, "ownerA@example.com");
    await setupOwnerWithApprovedListing(ctx, adminCookie, "ownerB@example.com");

    const response = await ctx.app.inject({ method: "GET", url: "/admin/dashboard", headers: { cookie: adminCookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json().totalBusinesses).toBe(2);
    expect(response.json().totalListings).toBe(2);
    expect(response.json().totalUsers).toBeGreaterThanOrEqual(3); // admin + 2 owners
    expect(response.json().totalViews).toBe(0);
  });

  it("scopes a Business Owner's dashboard to their own Businesses/Listings only, with totalUsers always 0", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin2@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { ownerCookie: ownerACookie } = await setupOwnerWithApprovedListing(ctx, adminCookie, "ownerA2@example.com");
    await setupOwnerWithApprovedListing(ctx, adminCookie, "ownerB2@example.com");

    const response = await ctx.app.inject({ method: "GET", url: "/admin/dashboard", headers: { cookie: ownerACookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json().totalBusinesses).toBe(1);
    expect(response.json().totalListings).toBe(1);
    expect(response.json().totalUsers).toBe(0);
  });

  it("computes averageRating from approved Reviews within scope", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin3@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { listingId } = await setupOwnerWithApprovedListing(ctx, adminCookie, "owner3@example.com");
    const { cookie: reviewerCookie } = await registerAndGetCookie(ctx, "reviewer3@example.com");
    const submit = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/reviews`,
      headers: { cookie: reviewerCookie },
      payload: { rating: 5, text: "Great" },
    });
    await ctx.app.inject({ method: "POST", url: `/reviews/${submit.json().id}/approve`, headers: { cookie: adminCookie } });

    const response = await ctx.app.inject({ method: "GET", url: "/admin/dashboard", headers: { cookie: adminCookie } });
    expect(response.json().averageRating).toBe(5);
  });

  it("excludes rows outside the from/to date range", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin4@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    await setupOwnerWithApprovedListing(ctx, adminCookie, "owner4@example.com");

    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const response = await ctx.app.inject({
      method: "GET",
      url: `/admin/dashboard?from=${encodeURIComponent(future)}`,
      headers: { cookie: adminCookie },
    });
    expect(response.json().totalBusinesses).toBe(0);
  });

  it("blocks an anonymous caller with 401", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/admin/dashboard" });
    expect(response.statusCode).toBe(401);
  });
});
