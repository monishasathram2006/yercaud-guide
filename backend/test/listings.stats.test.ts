import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";
import { runFeaturedRankingSync } from "../src/modules/featured/sync.js";

async function setup(ctx: TestContext) {
  const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
  await grantRole(ctx.db, adminId, "Super Admin");
  const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner@example.com");
  const bizRes = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerCookie }, payload: { name: "Biz" } });
  const businessId = bizRes.json().id;
  await ctx.app.inject({ method: "POST", url: `/businesses/${businessId}/approve`, headers: { cookie: adminCookie } });
  const { rows } = await ctx.db.query<{ id: string }>(
    `INSERT INTO categories (name, slug, has_detail_table) VALUES ('Hotel', 'hotel', true) RETURNING id`,
  );
  const categoryId = rows[0].id;

  const create = await ctx.app.inject({
    method: "POST",
    url: "/listings",
    headers: { cookie: ownerCookie },
    payload: { businessId, categoryId, name: "Lakeside Suite" },
  });
  const listingId = create.json().id;
  await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/approve`, headers: { cookie: adminCookie } });

  return { adminCookie, ownerCookie, listingId };
}

describe("GET /listings/:listingId/stats — a Business Owner's own interaction/Featured stats (issue #24)", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("rejects an anonymous caller with 401", async () => {
    const { listingId } = await setup(ctx);
    const response = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}/stats` });
    expect(response.statusCode).toBe(401);
  });

  it("blocks a signed-in visitor who neither owns the Listing nor holds Listings:edit, with 403", async () => {
    const { listingId } = await setup(ctx);
    const { cookie } = await registerAndGetCookie(ctx, "stranger@example.com");
    const response = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}/stats`, headers: { cookie } });
    expect(response.statusCode).toBe(403);
  });

  it("lets the owning Business Owner see their own Listing's counts", async () => {
    const { ownerCookie, listingId } = await setup(ctx);
    const { cookie: visitorCookie } = await registerAndGetCookie(ctx, "visitor@example.com");
    await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/view` });
    await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/favorite`, headers: { cookie: visitorCookie } });
    await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/contact-reveal`, headers: { cookie: visitorCookie } });
    await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/enquiries`,
      payload: { name: "Visitor", email: "v@example.com", message: "Hi" },
    });

    const response = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}/stats`, headers: { cookie: ownerCookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ views: 1, favorites: 1, contactReveals: 1, enquiries: 1 });
  });

  it("lets a Super Admin (Listings:edit) see a Listing they don't own", async () => {
    const { adminCookie, listingId } = await setup(ctx);
    const response = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}/stats`, headers: { cookie: adminCookie } });
    expect(response.statusCode).toBe(200);
  });

  it("reports neither featured nor sponsored before the ranking job has ever run", async () => {
    const { ownerCookie, listingId } = await setup(ctx);
    const response = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}/stats`, headers: { cookie: ownerCookie } });
    expect(response.json()).toMatchObject({ featured: false, sponsored: false });
  });

  it("reports featured: true once organically displayed by the ranking job", async () => {
    const { ownerCookie, listingId } = await setup(ctx);
    const { userId: reviewerId } = await registerAndGetCookie(ctx, "reviewer@example.com");
    await ctx.db.query(
      `INSERT INTO reviews (listing_id, user_id, rating, text, status) VALUES ($1, $2, 5, 'Great.', 'approved')`,
      [listingId, reviewerId],
    );
    await runFeaturedRankingSync(ctx.db);

    const response = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}/stats`, headers: { cookie: ownerCookie } });
    expect(response.json()).toMatchObject({ featured: true, sponsored: false });
  });

  it("reports sponsored: true (and featured: false) once Sponsored, regardless of Reviews", async () => {
    const { adminCookie, ownerCookie, listingId } = await setup(ctx);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    await ctx.app.inject({
      method: "POST",
      url: "/featured-listings",
      headers: { cookie: adminCookie },
      payload: { listingId, startDate: yesterday },
    });
    await runFeaturedRankingSync(ctx.db);

    const response = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}/stats`, headers: { cookie: ownerCookie } });
    expect(response.json()).toMatchObject({ featured: false, sponsored: true });
  });
});
