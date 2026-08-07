import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";
import { runFeaturedRankingSync } from "../src/modules/featured/sync.js";

const YESTERDAY = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const LAST_WEEK = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
const LAST_MONTH = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

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

  async function listing(name: string): Promise<string> {
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

  async function sponsor(listingId: string, startDate: string, endDate?: string): Promise<void> {
    await ctx.app.inject({
      method: "POST",
      url: "/featured-listings",
      headers: { cookie: adminCookie },
      payload: { listingId, startDate, endDate: endDate ?? null },
    });
  }

  async function approvedReview(listingId: string, rating: number): Promise<void> {
    const { userId } = await registerAndGetCookie(ctx, `reviewer-${crypto.randomUUID()}@example.com`);
    await ctx.db.query(
      `INSERT INTO reviews (listing_id, user_id, rating, text, status) VALUES ($1, $2, $3, 'Great.', 'approved')`,
      [listingId, userId, rating],
    );
  }

  return { listing, sponsor, approvedReview };
}

describe("runFeaturedRankingSync — real Sponsored wiring (issue #22)", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("flags a currently-active Sponsored Listing's row as sponsored and displayed, even with zero Reviews", async () => {
    const { listing, sponsor } = await setup(ctx);
    const sponsored = await listing("Sponsored, No Reviews");
    await sponsor(sponsored, YESTERDAY);

    await runFeaturedRankingSync(ctx.db);

    const { rows } = await ctx.db.query<{ is_displayed: boolean; is_sponsored: boolean; rank_position: number | null }>(
      `SELECT is_displayed, is_sponsored, rank_position FROM featured_rankings WHERE section = 'hotels' AND entity_id = $1`,
      [sponsored],
    );
    expect(rows).toEqual([{ is_displayed: true, is_sponsored: true, rank_position: null }]);
  });

  it("does not flag a Sponsored placement whose date range has already ended", async () => {
    const { listing, sponsor, approvedReview } = await setup(ctx);
    const expired = await listing("Expired Sponsorship");
    await approvedReview(expired, 4);
    await sponsor(expired, LAST_MONTH, LAST_WEEK);

    await runFeaturedRankingSync(ctx.db);

    const { rows } = await ctx.db.query<{ is_sponsored: boolean }>(
      `SELECT is_sponsored FROM featured_rankings WHERE section = 'hotels' AND entity_id = $1`,
      [expired],
    );
    expect(rows[0]?.is_sponsored).toBe(false);
  });

  it("reflects Sponsored status through GET /featured-sections", async () => {
    const { listing, sponsor } = await setup(ctx);
    const sponsored = await listing("Sponsored Listing");
    await sponsor(sponsored, YESTERDAY);

    await runFeaturedRankingSync(ctx.db);

    const response = await ctx.app.inject({ method: "GET", url: "/featured-sections" });
    const hotels = response.json().hotels as Array<{ id: string; sponsored: boolean }>;
    expect(hotels.find((h) => h.id === sponsored)).toMatchObject({ sponsored: true });
  });
});
