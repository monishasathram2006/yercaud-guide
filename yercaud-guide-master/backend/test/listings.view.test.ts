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

  const create = await ctx.app.inject({
    method: "POST",
    url: "/listings",
    headers: { cookie: ownerCookie },
    payload: { businessId, categoryId, name: "Lakeside Suite" },
  });
  const listingId = create.json().id;
  await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/approve`, headers: { cookie: adminCookie } });

  return { adminCookie, ownerCookie, ownerId, businessId, listingId };
}

/** Picks the visitor_id cookie specifically (a response may carry more than one Set-Cookie header). */
function extractVisitorCookie(setCookieHeader: string | string[] | undefined): string | undefined {
  const headers = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  const visitorHeader = headers.find((h) => h?.startsWith("visitor_id="));
  return visitorHeader?.split(";")[0];
}

describe("POST /listings/:listingId/view — anonymous-friendly page View tracking (issue #16)", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("records a View for a fully anonymous request (no cookie, no auth) and returns 204", async () => {
    const { listingId } = await setup(ctx);

    const response = await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/view` });
    expect(response.statusCode).toBe(204);

    const { rows } = await ctx.db.query(`SELECT * FROM listing_views WHERE listing_id = $1`, [listingId]);
    expect(rows).toHaveLength(1);
  });

  it("sets a visitor_id cookie on the response to a first-time (cookie-less) visitor", async () => {
    const { listingId } = await setup(ctx);

    const response = await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/view` });
    const visitorCookie = extractVisitorCookie(response.headers["set-cookie"]);
    expect(visitorCookie).toBeDefined();
  });

  it("dedupes repeat views from the same visitor_id cookie on the same day, without creating a second row", async () => {
    const { listingId } = await setup(ctx);

    const first = await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/view` });
    const visitorCookie = extractVisitorCookie(first.headers["set-cookie"])!;

    const second = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/view`,
      headers: { cookie: visitorCookie },
    });
    expect(second.statusCode).toBe(204);

    const { rows } = await ctx.db.query(`SELECT * FROM listing_views WHERE listing_id = $1`, [listingId]);
    expect(rows).toHaveLength(1);
  });

  it("records a new View for the same visitor_id the next calendar day", async () => {
    const { listingId } = await setup(ctx);

    const first = await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/view` });
    const visitorCookie = extractVisitorCookie(first.headers["set-cookie"])!;

    // Simulate the first View having happened yesterday, rather than waiting a real day.
    await ctx.db.query(`UPDATE listing_views SET viewed_on = viewed_on - INTERVAL '1 day' WHERE listing_id = $1`, [
      listingId,
    ]);

    const second = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/view`,
      headers: { cookie: visitorCookie },
    });
    expect(second.statusCode).toBe(204);

    const { rows } = await ctx.db.query(`SELECT * FROM listing_views WHERE listing_id = $1`, [listingId]);
    expect(rows).toHaveLength(2);
  });

  it("skips recording a View when the caller is the Listing's own Business Owner", async () => {
    const { listingId, ownerCookie } = await setup(ctx);

    const response = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/view`,
      headers: { cookie: ownerCookie },
    });
    expect(response.statusCode).toBe(204);

    const { rows } = await ctx.db.query(`SELECT * FROM listing_views WHERE listing_id = $1`, [listingId]);
    expect(rows).toHaveLength(0);
  });

  it("skips recording a View when the caller is accepted staff on the Listing's Business", async () => {
    const { listingId, ownerCookie, businessId } = await setup(ctx);
    const { cookie: staffCookie } = await registerAndGetCookie(ctx, "staff@example.com");

    const invite = await ctx.app.inject({
      method: "POST",
      url: `/businesses/${businessId}/staff`,
      headers: { cookie: ownerCookie },
      payload: { email: "staff@example.com" },
    });
    await ctx.app.inject({
      method: "PATCH",
      url: `/businesses/${businessId}/staff/${invite.json().id}`,
      headers: { cookie: staffCookie },
      payload: { status: "accepted" },
    });

    const response = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/view`,
      headers: { cookie: staffCookie },
    });
    expect(response.statusCode).toBe(204);

    const { rows } = await ctx.db.query(`SELECT * FROM listing_views WHERE listing_id = $1`, [listingId]);
    expect(rows).toHaveLength(0);
  });

  it("records a View for a signed-in visitor who is not the owner, keyed by their visitor_id cookie rather than their user id", async () => {
    const { listingId } = await setup(ctx);
    const { cookie: visitorAuthCookie } = await registerAndGetCookie(ctx, "visitor@example.com");

    const response = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/view`,
      headers: { cookie: visitorAuthCookie },
    });
    expect(response.statusCode).toBe(204);

    const visitorCookie = extractVisitorCookie(response.headers["set-cookie"]);
    expect(visitorCookie).toBeDefined();

    const { rows } = await ctx.db.query<{ session_id: string }>(
      `SELECT session_id FROM listing_views WHERE listing_id = $1`,
      [listingId],
    );
    expect(rows).toHaveLength(1);
    // The dedup key is the visitor_id cookie value, not the signed-in user's id.
    expect(visitorCookie).toContain(rows[0].session_id);
  });
});
