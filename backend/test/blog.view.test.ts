import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

async function setup(ctx: TestContext) {
  const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
  await grantRole(ctx.db, adminId, "Super Admin");
  const { rows } = await ctx.db.query<{ id: string }>(
    `INSERT INTO blog_categories (name, slug) VALUES ('Guides', 'guides') RETURNING id`,
  );

  const create = await ctx.app.inject({
    method: "POST",
    url: "/blog-posts",
    headers: { cookie: adminCookie },
    payload: { categoryId: rows[0].id, title: "Best Trails in Yercaud", body: "Body text here." },
  });
  const postId = create.json().id;
  await ctx.app.inject({ method: "POST", url: `/blog-posts/${postId}/publish`, headers: { cookie: adminCookie } });

  return { adminCookie, postId };
}

/** Picks the visitor_id cookie specifically (a response may carry more than one Set-Cookie header). */
function extractVisitorCookie(setCookieHeader: string | string[] | undefined): string | undefined {
  const headers = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  const visitorHeader = headers.find((h) => h?.startsWith("visitor_id="));
  return visitorHeader?.split(";")[0];
}

describe("POST /blog-posts/:postId/view — anonymous-friendly page View tracking (issue #18)", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("records a View for a fully anonymous request (no cookie, no auth) and returns 204", async () => {
    const { postId } = await setup(ctx);

    const response = await ctx.app.inject({ method: "POST", url: `/blog-posts/${postId}/view` });
    expect(response.statusCode).toBe(204);

    const { rows } = await ctx.db.query(`SELECT * FROM blog_post_views WHERE post_id = $1`, [postId]);
    expect(rows).toHaveLength(1);
  });

  it("sets a visitor_id cookie on the response to a first-time (cookie-less) visitor", async () => {
    const { postId } = await setup(ctx);

    const response = await ctx.app.inject({ method: "POST", url: `/blog-posts/${postId}/view` });
    expect(extractVisitorCookie(response.headers["set-cookie"])).toBeDefined();
  });

  it("dedupes repeat views from the same visitor_id cookie on the same day, without creating a second row", async () => {
    const { postId } = await setup(ctx);

    const first = await ctx.app.inject({ method: "POST", url: `/blog-posts/${postId}/view` });
    const visitorCookie = extractVisitorCookie(first.headers["set-cookie"])!;

    const second = await ctx.app.inject({
      method: "POST",
      url: `/blog-posts/${postId}/view`,
      headers: { cookie: visitorCookie },
    });
    expect(second.statusCode).toBe(204);

    const { rows } = await ctx.db.query(`SELECT * FROM blog_post_views WHERE post_id = $1`, [postId]);
    expect(rows).toHaveLength(1);
  });

  it("records a new View for the same visitor_id the next calendar day", async () => {
    const { postId } = await setup(ctx);

    const first = await ctx.app.inject({ method: "POST", url: `/blog-posts/${postId}/view` });
    const visitorCookie = extractVisitorCookie(first.headers["set-cookie"])!;

    await ctx.db.query(`UPDATE blog_post_views SET viewed_on = viewed_on - INTERVAL '1 day' WHERE post_id = $1`, [postId]);

    const second = await ctx.app.inject({
      method: "POST",
      url: `/blog-posts/${postId}/view`,
      headers: { cookie: visitorCookie },
    });
    expect(second.statusCode).toBe(204);

    const { rows } = await ctx.db.query(`SELECT * FROM blog_post_views WHERE post_id = $1`, [postId]);
    expect(rows).toHaveLength(2);
  });

  it("reuses the same visitor_id cookie established for Listing views", async () => {
    const { postId } = await setup(ctx);

    const response = await ctx.app.inject({ method: "POST", url: `/blog-posts/${postId}/view` });
    const visitorCookie = extractVisitorCookie(response.headers["set-cookie"])!;

    const { rows } = await ctx.db.query<{ session_id: string }>(`SELECT session_id FROM blog_post_views WHERE post_id = $1`, [
      postId,
    ]);
    expect(visitorCookie).toContain(rows[0].session_id);
  });
});
