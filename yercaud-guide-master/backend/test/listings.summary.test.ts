import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

/**
 * What a directory card needs, in one request (Phase 10).
 *
 * ListingSummary used to be nine fields of mostly UUIDs: rendering one grid
 * meant /listings plus a Business fetch per card plus /categories plus
 * /locations plus /attribute-tags — and a review count and price that existed
 * nowhere. This is what makes a grid one request, and it is the SSR path a
 * crawler sees.
 */

interface Fixture {
  adminCookie: string;
  ownerCookie: string;
  businessId: string;
  categoryId: string;
  locationId: string;
}

async function fixture(ctx: TestContext): Promise<Fixture> {
  const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
  await grantRole(ctx.db, adminId, "Super Admin");
  const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner@example.com");

  const biz = await ctx.app.inject({
    method: "POST",
    url: "/businesses",
    headers: { cookie: ownerCookie },
    payload: { name: "Palace Group", contactPhone: "+91 98765 43210", website: "grandpalaceyercaud.com" },
  });
  const businessId = biz.json().id;
  await ctx.app.inject({ method: "POST", url: `/businesses/${businessId}/approve`, headers: { cookie: adminCookie } });

  const { rows: cat } = await ctx.db.query<{ id: string }>(
    `INSERT INTO categories (name, slug, has_detail_table, icon, color)
     VALUES ('Hotels', 'hotel', true, 'Hotel', '#1E7A46') RETURNING id`,
  );
  const { rows: loc } = await ctx.db.query<{ id: string }>(
    `INSERT INTO locations (name, slug) VALUES ('Near Lake', 'near-lake') RETURNING id`,
  );
  return { adminCookie, ownerCookie, businessId, categoryId: cat[0].id, locationId: loc[0].id };
}

async function approvedListing(ctx: TestContext, f: Fixture, name = "Grand Palace"): Promise<string> {
  const create = await ctx.app.inject({
    method: "POST",
    url: "/listings",
    headers: { cookie: f.ownerCookie },
    payload: { businessId: f.businessId, categoryId: f.categoryId, locationId: f.locationId, name },
  });
  const id = create.json().id;
  await ctx.app.inject({ method: "POST", url: `/listings/${id}/approve`, headers: { cookie: f.adminCookie } });
  return id;
}

async function firstSummary(ctx: TestContext) {
  const res = await ctx.app.inject({ method: "GET", url: "/listings" });
  return res.json().items[0];
}

describe("ListingSummary — everything a directory card renders", () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });
  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("names the category and Location rather than making the client resolve UUIDs", async () => {
    const f = await fixture(ctx);
    await approvedListing(ctx, f);
    const summary = await firstSummary(ctx);
    expect(summary).toMatchObject({
      categoryName: "Hotels",
      categorySlug: "hotel",
      locationName: "Near Lake",
    });
  });

  it("carries the owning Business's phone and website — contacting a Business is the point of the directory", async () => {
    const f = await fixture(ctx);
    await approvedListing(ctx, f);
    const summary = await firstSummary(ctx);
    expect(summary).toMatchObject({ phone: "+91 98765 43210", website: "grandpalaceyercaud.com" });
  });

  it("counts only approved Reviews, so the number matches the Reviews a visitor can read", async () => {
    const f = await fixture(ctx);
    const listingId = await approvedListing(ctx, f);

    const reviewers = ["r1@example.com", "r2@example.com", "r3@example.com"];
    const cookies: string[] = [];
    for (const email of reviewers) {
      const { cookie } = await registerAndGetCookie(ctx, email);
      cookies.push(cookie);
      await ctx.app.inject({
        method: "POST",
        url: `/listings/${listingId}/reviews`,
        headers: { cookie },
        payload: { rating: 4, text: "Lovely" },
      });
    }
    // Approve two, leave one pending (ADR 0006: Reviews are pre-approved).
    const pending = await ctx.app.inject({ method: "GET", url: "/reviews?status=pending", headers: { cookie: f.adminCookie } });
    const ids = pending.json().map((r: { id: string }) => r.id);
    for (const id of ids.slice(0, 2)) {
      await ctx.app.inject({ method: "POST", url: `/reviews/${id}/approve`, headers: { cookie: f.adminCookie } });
    }

    const summary = await firstSummary(ctx);
    expect(summary.reviewCount).toBe(2);
  });

  it("reports zero Reviews as zero, not null", async () => {
    const f = await fixture(ctx);
    await approvedListing(ctx, f);
    const summary = await firstSummary(ctx);
    // A card renders "(0)" — null would make the client guard a count.
    expect(summary.reviewCount).toBe(0);
  });

  it("lists amenity tags by name", async () => {
    const f = await fixture(ctx);
    const listingId = await approvedListing(ctx, f);
    const { rows } = await ctx.db.query<{ id: string }>(
      `INSERT INTO attribute_tags (name) VALUES ('Free Wi-Fi'), ('Parking') RETURNING id`,
    );
    await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/tags`,
      headers: { cookie: f.ownerCookie },
      payload: { tagIds: rows.map((r) => r.id) },
    });
    const summary = await firstSummary(ctx);
    expect(summary.tags.sort()).toEqual(["Free Wi-Fi", "Parking"]);
  });

  it("returns an empty tag list rather than null when a Listing has none", async () => {
    const f = await fixture(ctx);
    await approvedListing(ctx, f);
    expect((await firstSummary(ctx)).tags).toEqual([]);
  });

  it("handles a Listing with no Location", async () => {
    const f = await fixture(ctx);
    const create = await ctx.app.inject({
      method: "POST",
      url: "/listings",
      headers: { cookie: f.ownerCookie },
      payload: { businessId: f.businessId, categoryId: f.categoryId, name: "Nowhere Inn" },
    });
    await ctx.app.inject({ method: "POST", url: `/listings/${create.json().id}/approve`, headers: { cookie: f.adminCookie } });
    const summary = await firstSummary(ctx);
    expect(summary.locationName).toBeNull();
  });

  it("carries price and badge onto the card", async () => {
    const f = await fixture(ctx);
    const listingId = await approvedListing(ctx, f);
    await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/hotel-details`,
      headers: { cookie: f.ownerCookie },
      payload: { starRating: 4 },
    });
    await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/hotel-details/rooms`,
      headers: { cookie: f.ownerCookie },
      payload: { name: "Deluxe", ratePerNight: 3500, quantityAvailable: 1 },
    });
    const badge = await ctx.app.inject({
      method: "POST",
      url: "/badges",
      headers: { cookie: f.adminCookie },
      payload: { label: "Popular", color: "#F97316" },
    });
    await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/badge`,
      headers: { cookie: f.adminCookie },
      payload: { badgeId: badge.json().id },
    });

    const summary = await firstSummary(ctx);
    expect(summary).toMatchObject({
      priceFrom: 3500,
      priceUnit: "per_night",
      badge: { label: "Popular", color: "#F97316" },
    });
  });

  it("renders a whole grid without a follow-up request per card", async () => {
    const f = await fixture(ctx);
    for (const name of ["A Inn", "B Inn", "C Inn"]) await approvedListing(ctx, f, name);

    const res = await ctx.app.inject({ method: "GET", url: "/listings" });
    const items = res.json().items;
    expect(items).toHaveLength(3);
    // Every card is renderable from this one response — that is the whole point.
    for (const item of items) {
      expect(item.categoryName).toBe("Hotels");
      expect(item.locationName).toBe("Near Lake");
      expect(item.phone).toBe("+91 98765 43210");
      expect(item.reviewCount).toBe(0);
      expect(item.tags).toEqual([]);
    }
  });

  it("carries the same fields on a User's favourites", async () => {
    const f = await fixture(ctx);
    const listingId = await approvedListing(ctx, f);
    const { cookie } = await registerAndGetCookie(ctx, "fan@example.com");
    await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/favorite`, headers: { cookie } });

    const res = await ctx.app.inject({ method: "GET", url: "/me/favorites", headers: { cookie } });
    const body = res.json();
    const items = Array.isArray(body) ? body : body.items;
    // FR81's favourite card shows category, location and price like any other.
    expect(items[0]).toMatchObject({ categoryName: "Hotels", locationName: "Near Lake" });
  });
});
