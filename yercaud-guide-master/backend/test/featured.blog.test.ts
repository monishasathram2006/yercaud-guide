import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";
import { runFeaturedRankingSync } from "../src/modules/featured/sync.js";

async function setup(ctx: TestContext) {
  const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
  await grantRole(ctx.db, adminId, "Super Admin");
  const { rows } = await ctx.db.query<{ id: string }>(
    `INSERT INTO blog_categories (name, slug) VALUES ('Guides', 'guides') RETURNING id`,
  );
  const categoryId = rows[0].id;

  async function post(title: string, publish = true): Promise<string> {
    const create = await ctx.app.inject({
      method: "POST",
      url: "/blog-posts",
      headers: { cookie: adminCookie },
      payload: { categoryId, title, body: "Body text here." },
    });
    const postId = create.json().id;
    if (publish) {
      await ctx.app.inject({ method: "POST", url: `/blog-posts/${postId}/publish`, headers: { cookie: adminCookie } });
    }
    return postId;
  }

  /** Direct SQL, like other test files' fixture setup — not the thing under test. */
  async function articleRating(postId: string, rating: number): Promise<void> {
    const { userId } = await registerAndGetCookie(ctx, `rater-${crypto.randomUUID()}@example.com`);
    await ctx.db.query(`INSERT INTO article_ratings (post_id, user_id, rating) VALUES ($1, $2, $3)`, [postId, userId, rating]);
  }

  async function approvedComment(postId: string): Promise<void> {
    const { userId } = await registerAndGetCookie(ctx, `commenter-${crypto.randomUUID()}@example.com`);
    await ctx.db.query(`INSERT INTO blog_comments (post_id, user_id, body, status) VALUES ($1, $2, 'Nice piece!', 'approved')`, [
      postId,
      userId,
    ]);
  }

  return { adminCookie, post, articleRating, approvedComment };
}

describe("runFeaturedRankingSync — Featured Blog (issue #21)", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("excludes Blog Posts with zero Article Ratings from the ranked pool", async () => {
    const { post, articleRating } = await setup(ctx);
    const rated = await post("Rated Post");
    const unrated = await post("Unrated Post");
    await articleRating(rated, 5);

    await runFeaturedRankingSync(ctx.db);

    const { rows } = await ctx.db.query(`SELECT entity_id FROM featured_rankings WHERE section = 'blog'`);
    const ids = rows.map((r) => r.entity_id);
    expect(ids).toContain(rated);
    expect(ids).not.toContain(unrated);
  });

  it("excludes unpublished (draft/pending) Blog Posts even if they have Article Ratings", async () => {
    const { post, articleRating } = await setup(ctx);
    const draft = await post("Draft Post", false);
    await articleRating(draft, 5);

    await runFeaturedRankingSync(ctx.db);

    const { rows } = await ctx.db.query(`SELECT entity_id FROM featured_rankings WHERE section = 'blog'`);
    expect(rows.map((r) => r.entity_id)).not.toContain(draft);
  });

  it("ranks by Bayesian-weighted Article Rating, best first", async () => {
    const { post, articleRating } = await setup(ctx);
    const best = await post("Best Post");
    const worst = await post("Worst Post");
    await articleRating(best, 5);
    await articleRating(worst, 2);

    await runFeaturedRankingSync(ctx.db);

    const { rows } = await ctx.db.query<{ entity_id: string }>(
      `SELECT entity_id FROM featured_rankings WHERE section = 'blog' ORDER BY rank_position`,
    );
    expect(rows.map((r) => r.entity_id)).toEqual([best, worst]);
  });

  it("breaks a tie in Article Rating using approved comment count", async () => {
    const { post, articleRating, approvedComment } = await setup(ctx);
    const moreComments = await post("Discussed Post");
    const fewerComments = await post("Quiet Post");
    await articleRating(moreComments, 4);
    await articleRating(fewerComments, 4);
    await approvedComment(moreComments);
    await approvedComment(moreComments);

    await runFeaturedRankingSync(ctx.db);

    const { rows } = await ctx.db.query<{ entity_id: string }>(
      `SELECT entity_id FROM featured_rankings WHERE section = 'blog' ORDER BY rank_position`,
    );
    expect(rows.map((r) => r.entity_id)).toEqual([moreComments, fewerComments]);
  });

  it("never marks a Blog Post row is_sponsored — Sponsored isn't available for Blog Posts", async () => {
    const { post, articleRating } = await setup(ctx);
    const p = await post("A Post");
    await articleRating(p, 5);

    await runFeaturedRankingSync(ctx.db);

    const { rows } = await ctx.db.query<{ is_sponsored: boolean }>(`SELECT is_sponsored FROM featured_rankings WHERE section = 'blog'`);
    expect(rows.every((r) => r.is_sponsored === false)).toBe(true);
  });

  it("keeps the blog section isolated from the Listing sections", async () => {
    const { post, articleRating } = await setup(ctx);
    const p = await post("A Post");
    await articleRating(p, 5);

    await runFeaturedRankingSync(ctx.db);

    const { rows: hotelRows } = await ctx.db.query(`SELECT entity_id FROM featured_rankings WHERE section = 'hotels'`);
    expect(hotelRows.map((r) => r.entity_id)).not.toContain(p);
  });
});

describe("GET /featured-sections — blog key (issue #21)", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("includes a blog array of full BlogPostSummary data with no sponsored field", async () => {
    const { post, articleRating } = await setup(ctx);
    const postId = await post("Best Trails in Yercaud");
    await articleRating(postId, 5);
    await runFeaturedRankingSync(ctx.db);

    const response = await ctx.app.inject({ method: "GET", url: "/featured-sections" });
    const body = response.json();

    expect(body.blog).toHaveLength(1);
    expect(body.blog[0]).toMatchObject({ id: postId, title: "Best Trails in Yercaud" });
    expect(body.blog[0]).not.toHaveProperty("sponsored");
  });

  it("returns an empty blog array before the job has ever run", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/featured-sections" });
    expect(response.json().blog).toEqual([]);
  });
});
