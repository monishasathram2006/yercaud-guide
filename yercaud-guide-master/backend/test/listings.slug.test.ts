import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

/**
 * Public Listings are addressed by slug (Phase 10) — readable, keyword-bearing,
 * and the conventional choice for a directory betting on search.
 *
 * The slug freezes at first publish. Before it, a pending Listing has no public
 * URL, so the slug tracks the name and a typo can be fixed. After it, ADR 0005
 * lets edits apply immediately with no staging — so a rename would silently
 * rewrite a live URL and break every link to it.
 */

interface Fixture {
  adminCookie: string;
  ownerCookie: string;
  businessId: string;
  categoryId: string;
}

async function fixture(ctx: TestContext): Promise<Fixture> {
  const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
  await grantRole(ctx.db, adminId, "Super Admin");
  const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner@example.com");
  const biz = await ctx.app.inject({
    method: "POST",
    url: "/businesses",
    headers: { cookie: ownerCookie },
    payload: { name: "Biz" },
  });
  const businessId = biz.json().id;
  await ctx.app.inject({ method: "POST", url: `/businesses/${businessId}/approve`, headers: { cookie: adminCookie } });
  const { rows } = await ctx.db.query<{ id: string }>(
    `INSERT INTO categories (name, slug, has_detail_table) VALUES ('Hotels', 'hotel', true) RETURNING id`,
  );
  return { adminCookie, ownerCookie, businessId, categoryId: rows[0].id };
}

async function create(ctx: TestContext, f: Fixture, name: string): Promise<{ id: string; slug: string }> {
  const res = await ctx.app.inject({
    method: "POST",
    url: "/listings",
    headers: { cookie: f.ownerCookie },
    payload: { businessId: f.businessId, categoryId: f.categoryId, name },
  });
  return { id: res.json().id, slug: res.json().slug };
}

async function rename(ctx: TestContext, f: Fixture, id: string, name: string) {
  return ctx.app.inject({
    method: "PATCH",
    url: `/listings/${id}`,
    headers: { cookie: f.ownerCookie },
    payload: { businessId: f.businessId, categoryId: f.categoryId, name },
  });
}

async function approve(ctx: TestContext, f: Fixture, id: string) {
  return ctx.app.inject({ method: "POST", url: `/listings/${id}/approve`, headers: { cookie: f.adminCookie } });
}

describe("Listing slugs", () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });
  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("fetches an approved Listing by slug — the public site's URL shape", async () => {
    const f = await fixture(ctx);
    const { id, slug } = await create(ctx, f, "Grand Palace Hotel");
    await approve(ctx, f, id);

    expect(slug).toBe("grand-palace-hotel");
    const res = await ctx.app.inject({ method: "GET", url: `/listings/by-slug/${slug}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id, name: "Grand Palace Hotel" });
  });

  it("404s an unknown slug", async () => {
    await fixture(ctx);
    const res = await ctx.app.inject({ method: "GET", url: "/listings/by-slug/no-such-hotel" });
    expect(res.statusCode).toBe(404);
  });

  it("404s an unapproved Listing by slug to an anonymous visitor", async () => {
    const f = await fixture(ctx);
    const { slug } = await create(ctx, f, "Grand Palace Hotel");
    // Same rule as fetching by id: an unapproved Listing shouldn't confirm its
    // own existence to a caller who isn't its owner or an admin.
    const res = await ctx.app.inject({ method: "GET", url: `/listings/by-slug/${slug}` });
    expect(res.statusCode).toBe(404);
  });

  it("lets the owner fix a typo before first publish — the slug follows", async () => {
    const f = await fixture(ctx);
    const { id, slug } = await create(ctx, f, "Grand Palce Hotel");
    expect(slug).toBe("grand-palce-hotel");

    await rename(ctx, f, id, "Grand Palace Hotel");

    const res = await ctx.app.inject({ method: "GET", url: `/listings/${id}`, headers: { cookie: f.ownerCookie } });
    expect(res.json().slug).toBe("grand-palace-hotel");
  });

  it("freezes the slug once the Listing is live, while the name still changes", async () => {
    const f = await fixture(ctx);
    const { id } = await create(ctx, f, "Grand Palace Hotel");
    await approve(ctx, f, id);

    await rename(ctx, f, id, "Yercaud Grand Resort");

    const res = await ctx.app.inject({ method: "GET", url: `/listings/${id}` });
    // The name is the owner's to change; the URL is not, because links to it exist.
    expect(res.json().name).toBe("Yercaud Grand Resort");
    expect(res.json().slug).toBe("grand-palace-hotel");
    expect((await ctx.app.inject({ method: "GET", url: "/listings/by-slug/grand-palace-hotel" })).statusCode).toBe(200);
  });

  it("keeps the slug frozen after a rejected Listing is later approved and renamed", async () => {
    const f = await fixture(ctx);
    const { id } = await create(ctx, f, "Grand Palace Hotel");
    await ctx.app.inject({
      method: "POST",
      url: `/listings/${id}/reject`,
      headers: { cookie: f.adminCookie },
      payload: { reason: "Photos missing" },
    });

    // Still never published, so the slug can still track the name.
    await rename(ctx, f, id, "Palace Inn");
    expect((await ctx.app.inject({ method: "GET", url: `/listings/${id}`, headers: { cookie: f.ownerCookie } })).json().slug).toBe(
      "palace-inn",
    );

    await approve(ctx, f, id);
    await rename(ctx, f, id, "Something Else Entirely");
    expect((await ctx.app.inject({ method: "GET", url: `/listings/${id}` })).json().slug).toBe("palace-inn");
  });

  it("records when a Listing first went live, and does not move it on re-approval", async () => {
    const f = await fixture(ctx);
    const { id } = await create(ctx, f, "Grand Palace Hotel");
    await approve(ctx, f, id);
    const first = (await ctx.app.inject({ method: "GET", url: `/listings/${id}` })).json().firstPublishedAt;
    expect(first).not.toBeNull();

    // Archive and re-approve: it was already published once, and that's the
    // moment the slug froze at.
    await ctx.app.inject({ method: "POST", url: `/listings/${id}/archive`, headers: { cookie: f.adminCookie } });
    const { rows } = await ctx.db.query<{ first_published_at: Date }>(`SELECT first_published_at FROM listings WHERE id = $1`, [id]);
    expect(rows[0].first_published_at).not.toBeNull();
  });

  it("reports no first-publish date for a Listing that has never been live", async () => {
    const f = await fixture(ctx);
    const { id } = await create(ctx, f, "Grand Palace Hotel");
    const res = await ctx.app.inject({ method: "GET", url: `/listings/${id}`, headers: { cookie: f.ownerCookie } });
    expect(res.json().firstPublishedAt).toBeNull();
  });

  it("suffixes a colliding slug rather than failing", async () => {
    const f = await fixture(ctx);
    const a = await create(ctx, f, "Lake View Inn");
    const b = await create(ctx, f, "Lake View Inn");
    expect(a.slug).toBe("lake-view-inn");
    expect(b.slug).toBe("lake-view-inn-2");
  });

  it("does not collide a pre-publish rename with an existing slug", async () => {
    const f = await fixture(ctx);
    await create(ctx, f, "Lake View Inn");
    const b = await create(ctx, f, "Hill Top Inn");

    await rename(ctx, f, b.id, "Lake View Inn");

    const res = await ctx.app.inject({ method: "GET", url: `/listings/${b.id}`, headers: { cookie: f.ownerCookie } });
    expect(res.json().slug).toBe("lake-view-inn-2");
  });

  it("does not re-slug a Listing renamed to the same name it already had", async () => {
    const f = await fixture(ctx);
    const { id, slug } = await create(ctx, f, "Lake View Inn");
    await rename(ctx, f, id, "Lake View Inn");
    // Must not become lake-view-inn-2 by colliding with itself.
    const res = await ctx.app.inject({ method: "GET", url: `/listings/${id}`, headers: { cookie: f.ownerCookie } });
    expect(res.json().slug).toBe(slug);
  });
});
