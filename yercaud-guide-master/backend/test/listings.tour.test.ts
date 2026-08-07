import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

async function setup(ctx: TestContext, categorySlug = "tour") {
  const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
  await grantRole(ctx.db, adminId, "Super Admin");
  const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner@example.com");
  const bizRes = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerCookie }, payload: { name: "Biz" } });
  const businessId = bizRes.json().id;
  await ctx.app.inject({ method: "POST", url: `/businesses/${businessId}/approve`, headers: { cookie: adminCookie } });
  const { rows: catRows } = await ctx.db.query<{ id: string }>(
    `INSERT INTO categories (name, slug, has_detail_table) VALUES ($1, $1, true) RETURNING id`,
    [categorySlug],
  );
  const categoryId = catRows[0].id;
  const create = await ctx.app.inject({
    method: "POST",
    url: "/listings",
    headers: { cookie: ownerCookie },
    payload: { businessId, categoryId, name: "Test Listing" },
  });
  const listingId = create.json().id;
  return { adminCookie, ownerCookie, listingId, categoryId };
}

describe("Tour & Travel details module", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("returns all-null/empty details for a Tour Listing with nothing filled in yet", async () => {
    const { listingId } = await setup(ctx);
    const response = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}/tour-details` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ tourType: null, itinerarySteps: [], inclusions: [], attractions: [], languageIds: [] });
  });

  it("404s for a Listing whose category is not Tour", async () => {
    const { listingId } = await setup(ctx, "hotel");
    const response = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}/tour-details` });
    expect(response.statusCode).toBe(404);
  });

  it("lets the owner set scalar details, languages, itinerary steps, inclusions, and attractions", async () => {
    const { ownerCookie, listingId } = await setup(ctx);
    const { rows: langRows } = await ctx.db.query<{ id: string }>(`INSERT INTO languages (name) VALUES ('Tamil') RETURNING id`);

    const put = await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/tour-details`,
      headers: { cookie: ownerCookie },
      payload: { tourType: "Day trip", duration: "8 hours", languageIds: [langRows[0].id] },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().languageIds).toEqual([langRows[0].id]);

    const step = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/tour-details/itinerary-steps`,
      headers: { cookie: ownerCookie },
      payload: { stepOrder: 1, title: "Hotel pickup", stepType: "pickup" },
    });
    expect(step.statusCode).toBe(201);
    expect(step.json().stepType).toBe("pickup");

    const inclusion = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/tour-details/inclusions`,
      headers: { cookie: ownerCookie },
      payload: { item: "Lunch" },
    });
    expect(inclusion.statusCode).toBe(201);
    expect(inclusion.json().isIncluded).toBe(true); // DB default

    const attraction = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/tour-details/attractions`,
      headers: { cookie: ownerCookie },
      payload: { name: "Bear Shola Falls" },
    });
    expect(attraction.statusCode).toBe(201);

    const get = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}/tour-details` });
    expect(get.json().itinerarySteps).toHaveLength(1);
    expect(get.json().inclusions).toHaveLength(1);
    expect(get.json().attractions).toHaveLength(1);
    expect(get.json().attractions[0].name).toBe("Bear Shola Falls");
  });

  it("refuses to add an attraction until Tour details exist", async () => {
    const { ownerCookie, listingId } = await setup(ctx);
    const response = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/tour-details/attractions`,
      headers: { cookie: ownerCookie },
      payload: { name: "Too early" },
    });
    expect(response.statusCode).toBe(409);
  });

  it("blocks a non-owner, non-admin from setting Tour details with 403", async () => {
    const { listingId } = await setup(ctx);
    const { cookie: strangerCookie } = await registerAndGetCookie(ctx, "stranger@example.com");
    const response = await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/tour-details`,
      headers: { cookie: strangerCookie },
      payload: { tourType: "x" },
    });
    expect(response.statusCode).toBe(403);
  });
});
