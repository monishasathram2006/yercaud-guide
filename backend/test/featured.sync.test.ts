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

  async function category(slug: string, hasDetailTable: boolean): Promise<string> {
    const { rows } = await ctx.db.query<{ id: string }>(
      `INSERT INTO categories (name, slug, has_detail_table) VALUES ($1, $1, $2) RETURNING id`,
      [slug, hasDetailTable],
    );
    return rows[0].id;
  }

  async function listing(categoryId: string, name: string): Promise<string> {
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

  /** Direct SQL, like other test files' fixture setup — not the thing under test. */
  async function approvedReview(listingId: string, rating: number): Promise<void> {
    const { userId } = await registerAndGetCookie(ctx, `reviewer-${crypto.randomUUID()}@example.com`);
    await ctx.db.query(
      `INSERT INTO reviews (listing_id, user_id, rating, text, status) VALUES ($1, $2, $3, 'Great stay.', 'approved')`,
      [listingId, userId, rating],
    );
  }

  return { adminCookie, ownerCookie, businessId, category, listing, approvedReview };
}

describe("runFeaturedRankingSync — the daily Featured ranking job (issue #19)", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("excludes Listings with zero approved Reviews from the ranked pool entirely", async () => {
    const { category, listing, approvedReview } = await setup(ctx);
    const hotelCategoryId = await category("hotel", true);
    const reviewed = await listing(hotelCategoryId, "Reviewed Hotel");
    const unreviewed = await listing(hotelCategoryId, "Unreviewed Hotel");
    await approvedReview(reviewed, 5);

    await runFeaturedRankingSync(ctx.db);

    const { rows } = await ctx.db.query(`SELECT entity_id FROM featured_rankings WHERE section = 'hotels'`);
    const ids = rows.map((r) => r.entity_id);
    expect(ids).toContain(reviewed);
    expect(ids).not.toContain(unreviewed);
  });

  it("orders the pool by rank_position, best-scoring Listing first", async () => {
    const { category, listing, approvedReview } = await setup(ctx);
    const hotelCategoryId = await category("hotel", true);
    const best = await listing(hotelCategoryId, "Best Hotel");
    const worst = await listing(hotelCategoryId, "Worst Hotel");
    await approvedReview(best, 5);
    await approvedReview(worst, 2);

    await runFeaturedRankingSync(ctx.db);

    const { rows } = await ctx.db.query<{ entity_id: string; rank_position: number }>(
      `SELECT entity_id, rank_position FROM featured_rankings WHERE section = 'hotels' ORDER BY rank_position`,
    );
    expect(rows.map((r) => r.entity_id)).toEqual([best, worst]);
    expect(rows[0].rank_position).toBe(1);
    expect(rows[1].rank_position).toBe(2);
  });

  it("marks every candidate displayed when there are fewer candidates than the display size", async () => {
    const { category, listing, approvedReview } = await setup(ctx);
    const hotelCategoryId = await category("hotel", true);
    const a = await listing(hotelCategoryId, "A");
    const b = await listing(hotelCategoryId, "B");
    await approvedReview(a, 4);
    await approvedReview(b, 4);

    await runFeaturedRankingSync(ctx.db);

    const { rows } = await ctx.db.query<{ is_displayed: boolean }>(
      `SELECT is_displayed FROM featured_rankings WHERE section = 'hotels'`,
    );
    expect(rows.every((r) => r.is_displayed)).toBe(true);
  });

  it("keeps categories isolated — a Restaurant never appears in the hotels section", async () => {
    const { category, listing, approvedReview } = await setup(ctx);
    const hotelCategoryId = await category("hotel", true);
    const restaurantCategoryId = await category("restaurant", true);
    const hotel = await listing(hotelCategoryId, "Hotel");
    const restaurant = await listing(restaurantCategoryId, "Restaurant");
    await approvedReview(hotel, 5);
    await approvedReview(restaurant, 5);

    await runFeaturedRankingSync(ctx.db);

    const { rows: hotelRows } = await ctx.db.query(`SELECT entity_id FROM featured_rankings WHERE section = 'hotels'`);
    expect(hotelRows.map((r) => r.entity_id)).toEqual([hotel]);
  });

  it("merges the tour and travel categories into one toursAndTravels section", async () => {
    const { category, listing, approvedReview } = await setup(ctx);
    const tourCategoryId = await category("tour", true);
    const travelCategoryId = await category("travel", false);
    const tour = await listing(tourCategoryId, "Tour");
    const travel = await listing(travelCategoryId, "Travel Service");
    await approvedReview(tour, 5);
    await approvedReview(travel, 5);

    await runFeaturedRankingSync(ctx.db);

    const { rows } = await ctx.db.query(`SELECT entity_id FROM featured_rankings WHERE section = 'toursAndTravels'`);
    expect(rows.map((r) => r.entity_id).sort()).toEqual([tour, travel].sort());
  });

  it("produces a stable display selection when run twice with the same rotation seed", async () => {
    const { category, listing, approvedReview } = await setup(ctx);
    const hotelCategoryId = await category("hotel", true);
    const ids = await Promise.all(
      Array.from({ length: 10 }, (_, i) => listing(hotelCategoryId, `Hotel ${i}`)),
    );
    await Promise.all(ids.map((id) => approvedReview(id, 4)));

    await runFeaturedRankingSync(ctx.db, { rotationSeed: "fixed-seed" });
    const first = await ctx.db.query<{ entity_id: string }>(
      `SELECT entity_id FROM featured_rankings WHERE section = 'hotels' AND is_displayed = true ORDER BY entity_id`,
    );

    await runFeaturedRankingSync(ctx.db, { rotationSeed: "fixed-seed" });
    const second = await ctx.db.query<{ entity_id: string }>(
      `SELECT entity_id FROM featured_rankings WHERE section = 'hotels' AND is_displayed = true ORDER BY entity_id`,
    );

    expect(second.rows.map((r) => r.entity_id)).toEqual(first.rows.map((r) => r.entity_id));
  });

  it("can produce a different display selection for a different rotation seed", async () => {
    const { category, listing, approvedReview } = await setup(ctx);
    const hotelCategoryId = await category("hotel", true);
    const ids = await Promise.all(
      Array.from({ length: 10 }, (_, i) => listing(hotelCategoryId, `Hotel ${i}`)),
    );
    // Identical ratings so every candidate ties — the display set is purely rotation-driven.
    await Promise.all(ids.map((id) => approvedReview(id, 4)));

    await runFeaturedRankingSync(ctx.db, { rotationSeed: "seed-one" });
    const first = await ctx.db.query<{ entity_id: string }>(
      `SELECT entity_id FROM featured_rankings WHERE section = 'hotels' AND is_displayed = true ORDER BY entity_id`,
    );

    await runFeaturedRankingSync(ctx.db, { rotationSeed: "seed-two" });
    const second = await ctx.db.query<{ entity_id: string }>(
      `SELECT entity_id FROM featured_rankings WHERE section = 'hotels' AND is_displayed = true ORDER BY entity_id`,
    );

    expect(second.rows.map((r) => r.entity_id)).not.toEqual(first.rows.map((r) => r.entity_id));
  });

  it("replaces a section's rows on rerun rather than accumulating duplicates", async () => {
    const { category, listing, approvedReview } = await setup(ctx);
    const hotelCategoryId = await category("hotel", true);
    const a = await listing(hotelCategoryId, "A");
    await approvedReview(a, 5);

    await runFeaturedRankingSync(ctx.db);
    await runFeaturedRankingSync(ctx.db);

    const { rows } = await ctx.db.query(`SELECT * FROM featured_rankings WHERE section = 'hotels'`);
    expect(rows).toHaveLength(1);
  });
});
