import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

const YESTERDAY = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const TOMORROW = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const NEXT_WEEK = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const LAST_WEEK = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
const LAST_MONTH = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

async function setup(ctx: TestContext) {
  const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
  await grantRole(ctx.db, adminId, "Super Admin");
  const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner@example.com");
  const biz = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerCookie }, payload: { name: "Biz" } });
  const businessId = biz.json().id;
  await ctx.app.inject({ method: "POST", url: `/businesses/${businessId}/approve`, headers: { cookie: adminCookie } });
  const { rows: catRows } = await ctx.db.query<{ id: string }>(
    `INSERT INTO categories (name, slug, has_detail_table) VALUES ('Hotel', 'hotel', true) RETURNING id`,
  );
  const categoryId = catRows[0].id;

  async function createListing(name: string, approve = true): Promise<string> {
    const create = await ctx.app.inject({
      method: "POST",
      url: "/listings",
      headers: { cookie: ownerCookie },
      payload: { businessId, categoryId, name },
    });
    const listingId = create.json().id;
    if (approve) {
      await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/approve`, headers: { cookie: adminCookie } });
    }
    return listingId;
  }

  return { adminCookie, ownerCookie, createListing };
}

describe("Featured Listings", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("404s featuring a Listing that isn't approved yet", async () => {
    const { adminCookie, createListing } = await setup(ctx);
    const listingId = await createListing("Pending Listing", false);
    const response = await ctx.app.inject({
      method: "POST",
      url: "/featured-listings",
      headers: { cookie: adminCookie },
      payload: { listingId, startDate: YESTERDAY },
    });
    expect(response.statusCode).toBe(404);
  });

  it("blocks a Business Owner from featuring their own Listing with 403 (editorial decision only)", async () => {
    const { ownerCookie, createListing } = await setup(ctx);
    const listingId = await createListing("My Listing");
    const response = await ctx.app.inject({
      method: "POST",
      url: "/featured-listings",
      headers: { cookie: ownerCookie },
      payload: { listingId, startDate: YESTERDAY },
    });
    expect(response.statusCode).toBe(403);
  });

  it("lets a Super Admin feature an approved Listing, visible publicly", async () => {
    const { adminCookie, createListing } = await setup(ctx);
    const listingId = await createListing("Listing");

    const create = await ctx.app.inject({
      method: "POST",
      url: "/featured-listings",
      headers: { cookie: adminCookie },
      payload: { listingId, startDate: YESTERDAY, endDate: TOMORROW, sortOrder: 1 },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().startDate).toBe(YESTERDAY);
    expect(create.json().endDate).toBe(TOMORROW);

    const publicList = await ctx.app.inject({ method: "GET", url: "/featured-listings" });
    expect(publicList.json()).toHaveLength(1);
    expect(publicList.json()[0].listingId).toBe(listingId);
  });

  it("treats a null endDate as open-ended, staying visible indefinitely", async () => {
    const { adminCookie, createListing } = await setup(ctx);
    const listingId = await createListing("Listing");
    const create = await ctx.app.inject({
      method: "POST",
      url: "/featured-listings",
      headers: { cookie: adminCookie },
      payload: { listingId, startDate: YESTERDAY },
    });
    expect(create.json().endDate).toBeNull();

    const publicList = await ctx.app.inject({ method: "GET", url: "/featured-listings" });
    expect(publicList.json()).toHaveLength(1);
  });

  it("hides a feature scheduled to start in the future, and one that already ended", async () => {
    const { adminCookie, createListing } = await setup(ctx);
    const futureListing = await createListing("Future Listing");
    const pastListing = await createListing("Past Listing");
    await ctx.app.inject({
      method: "POST",
      url: "/featured-listings",
      headers: { cookie: adminCookie },
      payload: { listingId: futureListing, startDate: TOMORROW, endDate: NEXT_WEEK },
    });
    await ctx.app.inject({
      method: "POST",
      url: "/featured-listings",
      headers: { cookie: adminCookie },
      payload: { listingId: pastListing, startDate: LAST_MONTH, endDate: LAST_WEEK },
    });

    const publicList = await ctx.app.inject({ method: "GET", url: "/featured-listings" });
    expect(publicList.json()).toHaveLength(0);
  });

  it("returns currently-live features in sort order", async () => {
    const { adminCookie, ownerCookie, createListing } = await setup(ctx);
    const listingA = await createListing("Listing A");
    // A different category — issue #22's per-category Sponsored cap means two
    // Listings in the *same* category can't both be active at once, but the
    // public list still spans every category, in sort order across all of them.
    const { rows: catRows } = await ctx.db.query<{ id: string }>(
      `INSERT INTO categories (name, slug, has_detail_table) VALUES ('Restaurant', 'restaurant', true) RETURNING id`,
    );
    const bizRes = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerCookie }, payload: { name: "Biz 2" } });
    await ctx.app.inject({ method: "POST", url: `/businesses/${bizRes.json().id}/approve`, headers: { cookie: adminCookie } });
    const createB = await ctx.app.inject({
      method: "POST",
      url: "/listings",
      headers: { cookie: ownerCookie },
      payload: { businessId: bizRes.json().id, categoryId: catRows[0].id, name: "Listing B" },
    });
    const listingB = createB.json().id;
    await ctx.app.inject({ method: "POST", url: `/listings/${listingB}/approve`, headers: { cookie: adminCookie } });

    await ctx.app.inject({
      method: "POST",
      url: "/featured-listings",
      headers: { cookie: adminCookie },
      payload: { listingId: listingA, startDate: YESTERDAY, sortOrder: 2 },
    });
    await ctx.app.inject({
      method: "POST",
      url: "/featured-listings",
      headers: { cookie: adminCookie },
      payload: { listingId: listingB, startDate: YESTERDAY, sortOrder: 1 },
    });

    const publicList = await ctx.app.inject({ method: "GET", url: "/featured-listings" });
    expect(publicList.json().map((f: { listingId: string }) => f.listingId)).toEqual([listingB, listingA]);
  });

  it("lets a Super Admin edit and remove a feature; blocks a non-admin from both", async () => {
    const { adminCookie, ownerCookie, createListing } = await setup(ctx);
    const listingId = await createListing("Listing");
    const create = await ctx.app.inject({
      method: "POST",
      url: "/featured-listings",
      headers: { cookie: adminCookie },
      payload: { listingId, startDate: YESTERDAY, sortOrder: 1 },
    });
    const featuredId = create.json().id;

    const ownerEdit = await ctx.app.inject({
      method: "PATCH",
      url: `/featured-listings/${featuredId}`,
      headers: { cookie: ownerCookie },
      payload: { sortOrder: 99 },
    });
    expect(ownerEdit.statusCode).toBe(403);

    const ownerDelete = await ctx.app.inject({ method: "DELETE", url: `/featured-listings/${featuredId}`, headers: { cookie: ownerCookie } });
    expect(ownerDelete.statusCode).toBe(403);

    const edit = await ctx.app.inject({
      method: "PATCH",
      url: `/featured-listings/${featuredId}`,
      headers: { cookie: adminCookie },
      payload: { sortOrder: 5 },
    });
    expect(edit.json().sortOrder).toBe(5);
    expect(edit.json().startDate).toBe(YESTERDAY); // untouched

    const del = await ctx.app.inject({ method: "DELETE", url: `/featured-listings/${featuredId}`, headers: { cookie: adminCookie } });
    expect(del.statusCode).toBe(204);

    const publicList = await ctx.app.inject({ method: "GET", url: "/featured-listings" });
    expect(publicList.json()).toHaveLength(0);
  });

  it("ends a feature by setting an endDate in the past", async () => {
    const { adminCookie, createListing } = await setup(ctx);
    const listingId = await createListing("Listing");
    const create = await ctx.app.inject({
      method: "POST",
      url: "/featured-listings",
      headers: { cookie: adminCookie },
      payload: { listingId, startDate: LAST_MONTH },
    });

    await ctx.app.inject({
      method: "PATCH",
      url: `/featured-listings/${create.json().id}`,
      headers: { cookie: adminCookie },
      payload: { endDate: LAST_WEEK },
    });

    const publicList = await ctx.app.inject({ method: "GET", url: "/featured-listings" });
    expect(publicList.json()).toHaveLength(0);
  });
});

describe("Sponsored placements — per-category cap (issue #22)", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("does not require the Listing to have any approved Reviews", async () => {
    const { adminCookie, createListing } = await setup(ctx);
    const listingId = await createListing("Zero-Review Listing");

    const response = await ctx.app.inject({
      method: "POST",
      url: "/featured-listings",
      headers: { cookie: adminCookie },
      payload: { listingId, startDate: YESTERDAY },
    });

    expect(response.statusCode).toBe(201);
  });

  it("rejects a second Sponsored placement in the same category with an overlapping date range", async () => {
    const { adminCookie, createListing } = await setup(ctx);
    const first = await createListing("First");
    const second = await createListing("Second");
    await ctx.app.inject({
      method: "POST",
      url: "/featured-listings",
      headers: { cookie: adminCookie },
      payload: { listingId: first, startDate: YESTERDAY },
    });

    const response = await ctx.app.inject({
      method: "POST",
      url: "/featured-listings",
      headers: { cookie: adminCookie },
      payload: { listingId: second, startDate: YESTERDAY },
    });

    expect(response.statusCode).toBe(409);
  });

  it("allows a second Sponsored placement in the same category once the first's range has ended", async () => {
    const { adminCookie, createListing } = await setup(ctx);
    const first = await createListing("First");
    const second = await createListing("Second");
    await ctx.app.inject({
      method: "POST",
      url: "/featured-listings",
      headers: { cookie: adminCookie },
      payload: { listingId: first, startDate: LAST_MONTH, endDate: LAST_WEEK },
    });

    const response = await ctx.app.inject({
      method: "POST",
      url: "/featured-listings",
      headers: { cookie: adminCookie },
      payload: { listingId: second, startDate: YESTERDAY },
    });

    expect(response.statusCode).toBe(201);
  });

  it("rejects an edit that would newly overlap another placement in the same category", async () => {
    const { adminCookie, createListing } = await setup(ctx);
    const first = await createListing("First");
    const second = await createListing("Second");
    await ctx.app.inject({
      method: "POST",
      url: "/featured-listings",
      headers: { cookie: adminCookie },
      payload: { listingId: first, startDate: LAST_MONTH, endDate: LAST_WEEK },
    });
    const secondPlacement = await ctx.app.inject({
      method: "POST",
      url: "/featured-listings",
      headers: { cookie: adminCookie },
      payload: { listingId: second, startDate: YESTERDAY },
    });

    // Extending the second placement's start date back to overlap the (already-ended) first is fine,
    // but pulling it to overlap a *third*, still-live placement should be rejected.
    const third = await createListing("Third");
    await ctx.app.inject({
      method: "POST",
      url: "/featured-listings",
      headers: { cookie: adminCookie },
      payload: { listingId: third, startDate: LAST_WEEK, endDate: YESTERDAY },
    });
    const edit = await ctx.app.inject({
      method: "PATCH",
      url: `/featured-listings/${secondPlacement.json().id}`,
      headers: { cookie: adminCookie },
      payload: { startDate: LAST_WEEK },
    });

    expect(edit.statusCode).toBe(409);
  });

  it("allows editing a placement's own dates without it colliding with itself", async () => {
    const { adminCookie, createListing } = await setup(ctx);
    const listingId = await createListing("Listing");
    const create = await ctx.app.inject({
      method: "POST",
      url: "/featured-listings",
      headers: { cookie: adminCookie },
      payload: { listingId, startDate: YESTERDAY },
    });

    const edit = await ctx.app.inject({
      method: "PATCH",
      url: `/featured-listings/${create.json().id}`,
      headers: { cookie: adminCookie },
      payload: { startDate: LAST_WEEK },
    });

    expect(edit.statusCode).toBe(200);
  });

  it("allows a second Sponsored placement in a different category with an overlapping date range", async () => {
    const { adminCookie, ownerCookie, createListing } = await setup(ctx);
    const first = await createListing("Hotel Listing");
    await ctx.app.inject({
      method: "POST",
      url: "/featured-listings",
      headers: { cookie: adminCookie },
      payload: { listingId: first, startDate: YESTERDAY },
    });

    const { rows: catRows } = await ctx.db.query<{ id: string }>(
      `INSERT INTO categories (name, slug, has_detail_table) VALUES ('Activity', 'activity', true) RETURNING id`,
    );
    const bizRes = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerCookie }, payload: { name: "Biz 2" } });
    await ctx.app.inject({ method: "POST", url: `/businesses/${bizRes.json().id}/approve`, headers: { cookie: adminCookie } });
    const createSecond = await ctx.app.inject({
      method: "POST",
      url: "/listings",
      headers: { cookie: ownerCookie },
      payload: { businessId: bizRes.json().id, categoryId: catRows[0].id, name: "Activity Listing" },
    });
    await ctx.app.inject({ method: "POST", url: `/listings/${createSecond.json().id}/approve`, headers: { cookie: adminCookie } });

    const response = await ctx.app.inject({
      method: "POST",
      url: "/featured-listings",
      headers: { cookie: adminCookie },
      payload: { listingId: createSecond.json().id, startDate: YESTERDAY },
    });

    expect(response.statusCode).toBe(201);
  });

  it("records create/update/delete in the audit log under the sponsored_placements action namespace", async () => {
    const { adminCookie, createListing } = await setup(ctx);
    const listingId = await createListing("Listing");

    const create = await ctx.app.inject({
      method: "POST",
      url: "/featured-listings",
      headers: { cookie: adminCookie },
      payload: { listingId, startDate: YESTERDAY },
    });
    const placementId = create.json().id;
    await ctx.app.inject({
      method: "PATCH",
      url: `/featured-listings/${placementId}`,
      headers: { cookie: adminCookie },
      payload: { sortOrder: 3 },
    });
    await ctx.app.inject({ method: "DELETE", url: `/featured-listings/${placementId}`, headers: { cookie: adminCookie } });

    const auditResponse = await ctx.app.inject({
      method: "GET",
      url: "/audit-logs?tableName=featured_listings",
      headers: { cookie: adminCookie },
    });
    const actions = auditResponse.json().map((log: { action: string }) => log.action);
    expect(actions).toEqual(
      expect.arrayContaining(["sponsored_placements.create", "sponsored_placements.update", "sponsored_placements.delete"]),
    );
  });
});
