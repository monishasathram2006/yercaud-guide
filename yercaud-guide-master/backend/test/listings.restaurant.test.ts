import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

async function setup(ctx: TestContext, categorySlug = "restaurant") {
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

function sevenDays(overrides: Record<number, Partial<{ openTime: string; closeTime: string; isClosed: boolean }>> = {}) {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    openTime: "09:00",
    closeTime: "22:00",
    isClosed: false,
    ...overrides[dayOfWeek],
  }));
}

describe("Restaurant details module", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("returns all-null/empty details for a Restaurant Listing with nothing filled in yet", async () => {
    const { listingId } = await setup(ctx);
    const response = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}/restaurant-details` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ cuisineType: null, openingHours: [], menuItems: [] });
  });

  it("404s for a Listing whose category is not Restaurant", async () => {
    const { listingId } = await setup(ctx, "hotel");
    const response = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}/restaurant-details` });
    expect(response.statusCode).toBe(404);
  });

  it("lets the owner set scalar details", async () => {
    const { ownerCookie, listingId } = await setup(ctx);
    const put = await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/restaurant-details`,
      headers: { cookie: ownerCookie },
      payload: { cuisineType: "South Indian", avgCostForTwo: 600, bestFor: "Family dinners" },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().cuisineType).toBe("South Indian");
  });

  it("replaces all 7 days of opening hours in one call", async () => {
    const { ownerCookie, listingId } = await setup(ctx);
    await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/restaurant-details`,
      headers: { cookie: ownerCookie },
      payload: { cuisineType: "South Indian" },
    });
    const put = await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/restaurant-details/opening-hours`,
      headers: { cookie: ownerCookie },
      payload: sevenDays({ 0: { isClosed: true, openTime: undefined, closeTime: undefined } }),
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toHaveLength(7);
    expect(put.json().find((h: { dayOfWeek: number }) => h.dayOfWeek === 0).isClosed).toBe(true);

    const get = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}/restaurant-details` });
    expect(get.json().openingHours).toHaveLength(7);

    // Calling again fully replaces the set, not merges it.
    const secondPut = await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/restaurant-details/opening-hours`,
      headers: { cookie: ownerCookie },
      payload: sevenDays(),
    });
    expect(secondPut.json()).toHaveLength(7);
    expect(secondPut.json().every((h: { isClosed: boolean }) => h.isClosed === false)).toBe(true);
  });

  it("rejects an opening-hours payload that isn't exactly 7 days", async () => {
    const { ownerCookie, listingId } = await setup(ctx);
    const response = await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/restaurant-details/opening-hours`,
      headers: { cookie: ownerCookie },
      payload: sevenDays().slice(0, 5),
    });
    expect(response.statusCode).toBe(400);
  });

  it("creates, updates, and deletes menu items", async () => {
    const { ownerCookie, listingId } = await setup(ctx);
    await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/restaurant-details`,
      headers: { cookie: ownerCookie },
      payload: { cuisineType: "Continental" },
    });

    const create = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/restaurant-details/menu-items`,
      headers: { cookie: ownerCookie },
      payload: { name: "Paneer Tikka", price: 220 },
    });
    expect(create.statusCode).toBe(201);
    const itemId = create.json().id;

    const update = await ctx.app.inject({
      method: "PATCH",
      url: `/listings/${listingId}/restaurant-details/menu-items/${itemId}`,
      headers: { cookie: ownerCookie },
      payload: { price: 250 },
    });
    expect(update.json().price).toBe(250);
    expect(update.json().name).toBe("Paneer Tikka");

    const del = await ctx.app.inject({
      method: "DELETE",
      url: `/listings/${listingId}/restaurant-details/menu-items/${itemId}`,
      headers: { cookie: ownerCookie },
    });
    expect(del.statusCode).toBe(204);

    const get = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}/restaurant-details` });
    expect(get.json().menuItems).toHaveLength(0);
  });
});
