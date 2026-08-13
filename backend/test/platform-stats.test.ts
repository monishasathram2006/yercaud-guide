import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

describe("GET /platform-stats — the home page's real stat tiles", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("is public — no auth required — and returns zeroed counts on an empty platform", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/platform-stats" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ businesses: 0, activities: 0, enquiries: 0, averageRating: 0 });
  });

  it("counts only approved Businesses", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner@example.com");
    const approved = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerCookie }, payload: { name: "Approved Biz" } });
    await ctx.app.inject({ method: "POST", url: `/businesses/${approved.json().id}/approve`, headers: { cookie: adminCookie } });
    await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerCookie }, payload: { name: "Pending Biz" } });

    const response = await ctx.app.inject({ method: "GET", url: "/platform-stats" });
    expect(response.json().businesses).toBe(1);
  });

  it("counts approved Activity-category Listings, not other categories", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner@example.com");
    const biz = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerCookie }, payload: { name: "Biz" } });
    await ctx.app.inject({ method: "POST", url: `/businesses/${biz.json().id}/approve`, headers: { cookie: adminCookie } });
    const { rows } = await ctx.db.query<{ id: string }>(
      `INSERT INTO categories (name, slug, has_detail_table) VALUES ('Activity', 'activity', true), ('Hotel', 'hotel', true) RETURNING id`,
    );
    const [activityCategoryId, hotelCategoryId] = rows.map((r) => r.id);

    const activity = await ctx.app.inject({ method: "POST", url: "/listings", headers: { cookie: ownerCookie }, payload: { businessId: biz.json().id, categoryId: activityCategoryId, name: "Trekking" } });
    await ctx.app.inject({ method: "POST", url: `/listings/${activity.json().id}/approve`, headers: { cookie: adminCookie } });
    const hotel = await ctx.app.inject({ method: "POST", url: "/listings", headers: { cookie: ownerCookie }, payload: { businessId: biz.json().id, categoryId: hotelCategoryId, name: "Suite" } });
    await ctx.app.inject({ method: "POST", url: `/listings/${hotel.json().id}/approve`, headers: { cookie: adminCookie } });

    const response = await ctx.app.inject({ method: "GET", url: "/platform-stats" });
    expect(response.json().activities).toBe(1);
  });

  it("counts every Enquiry, and averages only approved Reviews", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner@example.com");
    const biz = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerCookie }, payload: { name: "Biz" } });
    await ctx.app.inject({ method: "POST", url: `/businesses/${biz.json().id}/approve`, headers: { cookie: adminCookie } });
    const { rows } = await ctx.db.query<{ id: string }>(
      `INSERT INTO categories (name, slug, has_detail_table) VALUES ('Hotel', 'hotel', true) RETURNING id`,
    );
    const listing = await ctx.app.inject({ method: "POST", url: "/listings", headers: { cookie: ownerCookie }, payload: { businessId: biz.json().id, categoryId: rows[0].id, name: "Suite" } });
    const listingId = listing.json().id;
    await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/approve`, headers: { cookie: adminCookie } });

    await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/enquiries`, payload: { name: "V", email: "v@example.com", message: "Hi" } });
    await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/enquiries`, payload: { name: "V2", email: "v2@example.com", message: "Hi" } });

    const { userId: reviewerId } = await registerAndGetCookie(ctx, "reviewer@example.com");
    await ctx.db.query(`INSERT INTO reviews (listing_id, user_id, rating, text, status) VALUES ($1, $2, 4, 'Nice.', 'approved')`, [listingId, reviewerId]);
    const { userId: reviewer2Id } = await registerAndGetCookie(ctx, "reviewer2@example.com");
    await ctx.db.query(`INSERT INTO reviews (listing_id, user_id, rating, text, status) VALUES ($1, $2, 1, 'Meh.', 'pending')`, [listingId, reviewer2Id]);

    const response = await ctx.app.inject({ method: "GET", url: "/platform-stats" });
    expect(response.json()).toMatchObject({ enquiries: 2, averageRating: 4 });
  });
});
