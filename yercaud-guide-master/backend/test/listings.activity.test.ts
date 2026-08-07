import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

async function setup(ctx: TestContext, categorySlug = "activity") {
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

describe("Activity details module", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("returns all-null/empty details for an Activity Listing with nothing filled in yet", async () => {
    const { listingId } = await setup(ctx);
    const response = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}/activity-details` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ duration: null, itinerarySteps: [], inclusions: [] });
  });

  it("404s for a Listing whose category is not Activity", async () => {
    const { listingId } = await setup(ctx, "hotel");
    const response = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}/activity-details` });
    expect(response.statusCode).toBe(404);
  });

  it("lets the owner set scalar details, itinerary steps, and inclusions", async () => {
    const { ownerCookie, listingId } = await setup(ctx);
    const put = await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/activity-details`,
      headers: { cookie: ownerCookie },
      payload: { duration: "3 hours", difficultyLevel: "Moderate" },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().difficultyLevel).toBe("Moderate");

    const step = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/activity-details/itinerary-steps`,
      headers: { cookie: ownerCookie },
      payload: { stepOrder: 1, title: "Trek to summit" },
    });
    expect(step.statusCode).toBe(201);

    const inclusion = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/activity-details/inclusions`,
      headers: { cookie: ownerCookie },
      payload: { item: "Guide", isIncluded: true },
    });
    expect(inclusion.statusCode).toBe(201);
    expect(inclusion.json().isIncluded).toBe(true);

    const get = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}/activity-details` });
    expect(get.json().itinerarySteps).toHaveLength(1);
    expect(get.json().inclusions).toHaveLength(1);
  });

  it("refuses to add an itinerary step until Activity details exist", async () => {
    const { ownerCookie, listingId } = await setup(ctx);
    const response = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/activity-details/itinerary-steps`,
      headers: { cookie: ownerCookie },
      payload: { stepOrder: 1, title: "Too early" },
    });
    expect(response.statusCode).toBe(409);
  });

  it("blocks a non-owner, non-admin from setting Activity details with 403", async () => {
    const { listingId } = await setup(ctx);
    const { cookie: strangerCookie } = await registerAndGetCookie(ctx, "stranger@example.com");
    const response = await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/activity-details`,
      headers: { cookie: strangerCookie },
      payload: { duration: "1 hour" },
    });
    expect(response.statusCode).toBe(403);
  });
});
