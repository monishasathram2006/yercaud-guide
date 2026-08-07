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

  const { userId: reviewerId } = await registerAndGetCookie(ctx, "reviewer@example.com");
  await ctx.db.query(
    `INSERT INTO reviews (listing_id, user_id, rating, text, status) VALUES ($1, $2, 5, 'Lovely.', 'approved')`,
    [listingId, reviewerId],
  );

  return { listingId };
}

describe("GET /featured-sections — the home page's precomputed Featured shelves (issue #19)", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("is public — no auth required — and returns 200", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/featured-sections" });
    expect(response.statusCode).toBe(200);
  });

  it("returns all five section keys (four Listing sections plus blog), empty before the job has ever run", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/featured-sections" });
    const body = response.json();
    expect(Object.keys(body).sort()).toEqual(["activities", "blog", "hotels", "restaurants", "toursAndTravels"].sort());
    expect(body.hotels).toEqual([]);
    expect(body.blog).toEqual([]);
  });

  it("returns full Listing summary data for a displayed item, not just its id, flagged sponsored: false", async () => {
    const { listingId } = await setup(ctx);
    await runFeaturedRankingSync(ctx.db);

    const response = await ctx.app.inject({ method: "GET", url: "/featured-sections" });
    const body = response.json();

    expect(body.hotels).toHaveLength(1);
    expect(body.hotels[0]).toMatchObject({ id: listingId, name: "Lakeside Suite", sponsored: false });
    expect(body.hotels[0]).toHaveProperty("slug");
    expect(body.hotels[0]).toHaveProperty("averageRating");
  });

  it("only reflects the precomputed table — never a Listing that hasn't been through the job yet", async () => {
    await setup(ctx);
    // Deliberately not running the job.
    const response = await ctx.app.inject({ method: "GET", url: "/featured-sections" });
    expect(response.json().hotels).toEqual([]);
  });
});
