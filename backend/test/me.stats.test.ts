import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

async function setup(ctx: TestContext) {
  const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
  await grantRole(ctx.db, adminId, "Super Admin");
  const { cookie: ownerCookie, userId: ownerId } = await registerAndGetCookie(ctx, "owner@example.com");
  const bizRes = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerCookie }, payload: { name: "Biz" } });
  const businessId = bizRes.json().id;
  await ctx.app.inject({ method: "POST", url: `/businesses/${businessId}/approve`, headers: { cookie: adminCookie } });
  const { rows: catRows } = await ctx.db.query<{ id: string }>(
    `INSERT INTO categories (name, slug, has_detail_table) VALUES ('Hotel', 'hotel', true) RETURNING id`,
  );
  const categoryId = catRows[0].id;

  async function createListing(name: string): Promise<string> {
    const create = await ctx.app.inject({
      method: "POST",
      url: "/listings",
      headers: { cookie: ownerCookie },
      payload: { businessId, categoryId, name },
    });
    const listingId = create.json().id;
    await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/approve`, headers: { cookie: adminCookie } });
    return listingId;
  }

  return { adminCookie, ownerCookie, ownerId, createListing };
}

describe("GET /me/stats", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("counts my Enquiries, Reviews, Favorites and owned Listings", async () => {
    const { createListing, ownerCookie } = await setup(ctx);
    const listingA = await createListing("Listing A");
    const listingB = await createListing("Listing B");

    const { cookie: visitorCookie } = await registerAndGetCookie(ctx, "visitor@example.com");
    await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingA}/enquiries`,
      headers: { cookie: visitorCookie },
      payload: { name: "V", email: "v@example.com", message: "Hi" },
    });
    await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingA}/reviews`,
      headers: { cookie: visitorCookie },
      payload: { rating: 5, text: "Great" },
    });
    await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingB}/reviews`,
      headers: { cookie: visitorCookie },
      payload: { rating: 4, text: "Good" },
    });
    await ctx.app.inject({ method: "POST", url: `/listings/${listingA}/favorite`, headers: { cookie: visitorCookie } });

    const stats = await ctx.app.inject({ method: "GET", url: "/me/stats", headers: { cookie: visitorCookie } });
    expect(stats.statusCode).toBe(200);
    expect(stats.json()).toEqual({ enquiries: 1, reviews: 2, favorites: 1, listings: 0 });

    const ownerStats = await ctx.app.inject({ method: "GET", url: "/me/stats", headers: { cookie: ownerCookie } });
    expect(ownerStats.json()).toMatchObject({ listings: 2 });
  });

  it("rejects an anonymous request with 401", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/me/stats" });
    expect(response.statusCode).toBe(401);
  });
});
