import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

/**
 * FR30's promotional badge. Two separable things: the badge vocabulary, which
 * is a taxonomy like price bands; and assigning one to a Listing, which is a
 * marketing act and deliberately not part of ListingInput — a Business Owner
 * self-labelling as "Popular" would make the badge meaningless.
 */

async function admin(ctx: TestContext) {
  const { cookie, userId } = await registerAndGetCookie(ctx, "admin@example.com");
  await grantRole(ctx.db, userId, "Super Admin");
  return cookie;
}

async function ownerWithListing(ctx: TestContext, adminCookie: string) {
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
    `INSERT INTO categories (name, slug, has_detail_table) VALUES ('travel', 'travel', false) RETURNING id`,
  );
  const create = await ctx.app.inject({
    method: "POST",
    url: "/listings",
    headers: { cookie: ownerCookie },
    payload: { businessId, categoryId: rows[0].id, name: "Hill Cabs" },
  });
  const listingId = create.json().id;
  await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/approve`, headers: { cookie: adminCookie } });
  return { ownerCookie, listingId, businessId };
}

async function makeBadge(ctx: TestContext, adminCookie: string, label: string, color = "#F97316") {
  const res = await ctx.app.inject({
    method: "POST",
    url: "/badges",
    headers: { cookie: adminCookie },
    payload: { label, color, sortOrder: 0 },
  });
  return res.json().id as string;
}

describe("Badges — the vocabulary", () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });
  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("is readable without signing in — the public site styles badges from it", async () => {
    const adminCookie = await admin(ctx);
    await makeBadge(ctx, adminCookie, "Popular");
    const res = await ctx.app.inject({ method: "GET", url: "/badges" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject([{ label: "Popular", color: "#F97316" }]);
  });

  it("lets a Super Admin add a badge without a developer", async () => {
    const adminCookie = await admin(ctx);
    const res = await ctx.app.inject({
      method: "POST",
      url: "/badges",
      headers: { cookie: adminCookie },
      payload: { label: "New", color: "#10B981", sortOrder: 5 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ label: "New", color: "#10B981", sortOrder: 5 });
  });

  it("orders by sort order, then label", async () => {
    const adminCookie = await admin(ctx);
    await ctx.app.inject({
      method: "POST",
      url: "/badges",
      headers: { cookie: adminCookie },
      payload: { label: "Zebra", sortOrder: 1 },
    });
    await ctx.app.inject({
      method: "POST",
      url: "/badges",
      headers: { cookie: adminCookie },
      payload: { label: "Alpha", sortOrder: 2 },
    });
    const res = await ctx.app.inject({ method: "GET", url: "/badges" });
    expect(res.json().map((b: { label: string }) => b.label)).toEqual(["Zebra", "Alpha"]);
  });

  it("rejects a duplicate label", async () => {
    const adminCookie = await admin(ctx);
    await makeBadge(ctx, adminCookie, "Popular");
    const res = await ctx.app.inject({
      method: "POST",
      url: "/badges",
      headers: { cookie: adminCookie },
      payload: { label: "Popular" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("blocks a non-admin from creating a badge", async () => {
    const { cookie } = await registerAndGetCookie(ctx, "nobody@example.com");
    const res = await ctx.app.inject({
      method: "POST",
      url: "/badges",
      headers: { cookie },
      payload: { label: "Popular" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("lets a Super Admin rename and recolour a badge", async () => {
    const adminCookie = await admin(ctx);
    const id = await makeBadge(ctx, adminCookie, "Popular");
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/badges/${id}`,
      headers: { cookie: adminCookie },
      payload: { label: "Trending", color: "#000000", sortOrder: 3 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ label: "Trending", color: "#000000", sortOrder: 3 });
  });

  it("deletes a badge", async () => {
    const adminCookie = await admin(ctx);
    const id = await makeBadge(ctx, adminCookie, "Popular");
    expect((await ctx.app.inject({ method: "DELETE", url: `/badges/${id}`, headers: { cookie: adminCookie } })).statusCode).toBe(204);
    expect((await ctx.app.inject({ method: "GET", url: "/badges" })).json()).toEqual([]);
  });

  it("404s on deleting a badge that does not exist", async () => {
    const adminCookie = await admin(ctx);
    const res = await ctx.app.inject({
      method: "DELETE",
      url: "/badges/00000000-0000-0000-0000-000000000000",
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("Badges — assigning one to a Listing", () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });
  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("lets a Super Admin badge a Listing, and returns it with the Listing", async () => {
    const adminCookie = await admin(ctx);
    const { listingId } = await ownerWithListing(ctx, adminCookie);
    const badgeId = await makeBadge(ctx, adminCookie, "Popular");

    const put = await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/badge`,
      headers: { cookie: adminCookie },
      payload: { badgeId },
    });
    expect(put.statusCode).toBe(200);

    const listing = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}` });
    // Label and colour travel with the Listing: every card renders the badge,
    // and the colour must not be a hardcoded switch in the frontend.
    expect(listing.json().badge).toMatchObject({ id: badgeId, label: "Popular", color: "#F97316" });
  });

  it("refuses a Business Owner badging their own Listing", async () => {
    const adminCookie = await admin(ctx);
    const { ownerCookie, listingId } = await ownerWithListing(ctx, adminCookie);
    const badgeId = await makeBadge(ctx, adminCookie, "Popular");

    // A self-applied "Popular" is not a signal, it's a self-description.
    const res = await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/badge`,
      headers: { cookie: ownerCookie },
      payload: { badgeId },
    });
    expect(res.statusCode).toBe(403);
  });

  it("ignores a badge smuggled through the Listing input", async () => {
    const adminCookie = await admin(ctx);
    const { ownerCookie, listingId, businessId } = await ownerWithListing(ctx, adminCookie);
    const badgeId = await makeBadge(ctx, adminCookie, "Popular");
    const listing = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}` });
    const categoryId = listing.json().categoryId;

    await ctx.app.inject({
      method: "PATCH",
      url: `/listings/${listingId}`,
      headers: { cookie: ownerCookie },
      payload: { businessId, categoryId, name: "Hill Cabs", badgeId },
    });

    // badgeId is not part of ListingInput, so the owner-writable path can't
    // reach it — the schema strips it rather than the service special-casing it.
    const after = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}` });
    expect(after.json().badge).toBeNull();
  });

  it("clears a Listing's badge when a seasonal highlight ends", async () => {
    const adminCookie = await admin(ctx);
    const { listingId } = await ownerWithListing(ctx, adminCookie);
    const badgeId = await makeBadge(ctx, adminCookie, "Popular");
    await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/badge`,
      headers: { cookie: adminCookie },
      payload: { badgeId },
    });

    const clear = await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/badge`,
      headers: { cookie: adminCookie },
      payload: { badgeId: null },
    });
    expect(clear.statusCode).toBe(200);
    expect((await ctx.app.inject({ method: "GET", url: `/listings/${listingId}` })).json().badge).toBeNull();
  });

  it("rejects a badge that does not exist", async () => {
    const adminCookie = await admin(ctx);
    const { listingId } = await ownerWithListing(ctx, adminCookie);
    const res = await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/badge`,
      headers: { cookie: adminCookie },
      payload: { badgeId: "00000000-0000-0000-0000-000000000000" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("keeps the Listing when its badge is retired, and drops the badge", async () => {
    const adminCookie = await admin(ctx);
    const { listingId } = await ownerWithListing(ctx, adminCookie);
    const badgeId = await makeBadge(ctx, adminCookie, "Popular");
    await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/badge`,
      headers: { cookie: adminCookie },
      payload: { badgeId },
    });

    await ctx.app.inject({ method: "DELETE", url: `/badges/${badgeId}`, headers: { cookie: adminCookie } });

    // ON DELETE SET NULL: retiring a badge must not delete the Listings wearing it.
    const after = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}` });
    expect(after.statusCode).toBe(200);
    expect(after.json().badge).toBeNull();
  });
});
