import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

async function setup(ctx: TestContext, categorySlug = "hotel") {
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

describe("Hotel details module", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("returns all-null/empty details for a Hotel Listing with nothing filled in yet", async () => {
    const { listingId } = await setup(ctx);
    const response = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}/hotel-details` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ starRating: null, rooms: [], availabilityBlocks: [], languageIds: [] });
  });

  it("404s for a Listing whose category is not Hotel", async () => {
    const { listingId } = await setup(ctx, "restaurant");
    const response = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}/hotel-details` });
    expect(response.statusCode).toBe(404);
  });

  it("lets the owner set scalar details and languages, then reads them back", async () => {
    const { ownerCookie, listingId } = await setup(ctx);
    const { rows: langRows } = await ctx.db.query<{ id: string }>(`INSERT INTO languages (name) VALUES ('Tamil'), ('English') RETURNING id`);
    const languageIds = langRows.map((r) => r.id);

    const put = await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/hotel-details`,
      headers: { cookie: ownerCookie },
      payload: { starRating: 4, checkInTime: "14:00", checkOutTime: "11:00", languageIds },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().starRating).toBe(4);
    expect(put.json().languageIds.sort()).toEqual([...languageIds].sort());

    const get = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}/hotel-details` });
    expect(get.json().checkInTime).toBe("14:00");
  });

  it("leaves languageIds untouched when omitted from a later PUT", async () => {
    const { ownerCookie, listingId } = await setup(ctx);
    const { rows: langRows } = await ctx.db.query<{ id: string }>(`INSERT INTO languages (name) VALUES ('Tamil') RETURNING id`);
    await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/hotel-details`,
      headers: { cookie: ownerCookie },
      payload: { starRating: 3, languageIds: [langRows[0].id] },
    });

    const secondPut = await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/hotel-details`,
      headers: { cookie: ownerCookie },
      payload: { starRating: 5 },
    });
    expect(secondPut.json().starRating).toBe(5);
    expect(secondPut.json().languageIds).toEqual([langRows[0].id]);
  });

  it("400s a PUT against a Listing whose category is not Hotel", async () => {
    const { ownerCookie, listingId } = await setup(ctx, "restaurant");
    const response = await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/hotel-details`,
      headers: { cookie: ownerCookie },
      payload: { starRating: 3 },
    });
    expect(response.statusCode).toBe(400);
  });

  it("blocks a non-owner, non-admin from setting Hotel details with 403", async () => {
    const { listingId } = await setup(ctx);
    const { cookie: strangerCookie } = await registerAndGetCookie(ctx, "stranger@example.com");
    const response = await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/hotel-details`,
      headers: { cookie: strangerCookie },
      payload: { starRating: 3 },
    });
    expect(response.statusCode).toBe(403);
  });

  it("refuses to add a room until Hotel details exist, then creates/updates/deletes rooms", async () => {
    const { ownerCookie, listingId } = await setup(ctx);

    const tooEarly = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/hotel-details/rooms`,
      headers: { cookie: ownerCookie },
      payload: { name: "Deluxe", ratePerNight: 2000 },
    });
    expect(tooEarly.statusCode).toBe(409);

    await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/hotel-details`,
      headers: { cookie: ownerCookie },
      payload: { starRating: 4 },
    });

    const create = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/hotel-details/rooms`,
      headers: { cookie: ownerCookie },
      payload: { name: "Deluxe", ratePerNight: 2000, quantityAvailable: 3 },
    });
    expect(create.statusCode).toBe(201);
    const roomId = create.json().id;

    const update = await ctx.app.inject({
      method: "PATCH",
      url: `/listings/${listingId}/hotel-details/rooms/${roomId}`,
      headers: { cookie: ownerCookie },
      payload: { quantityAvailable: 1 },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().quantityAvailable).toBe(1);
    expect(update.json().name).toBe("Deluxe");

    const get = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}/hotel-details` });
    expect(get.json().rooms).toHaveLength(1);

    const del = await ctx.app.inject({
      method: "DELETE",
      url: `/listings/${listingId}/hotel-details/rooms/${roomId}`,
      headers: { cookie: ownerCookie },
    });
    expect(del.statusCode).toBe(204);

    const getAfter = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}/hotel-details` });
    expect(getAfter.json().rooms).toHaveLength(0);
  });

  it("creates and lists availability blocks", async () => {
    const { ownerCookie, listingId } = await setup(ctx);
    await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/hotel-details`,
      headers: { cookie: ownerCookie },
      payload: { starRating: 4 },
    });

    const create = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/hotel-details/availability-blocks`,
      headers: { cookie: ownerCookie },
      payload: { startDate: "2026-08-01", endDate: "2026-08-05", note: "Fully booked" },
    });
    expect(create.statusCode).toBe(201);

    const get = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}/hotel-details` });
    expect(get.json().availabilityBlocks).toHaveLength(1);
    expect(get.json().availabilityBlocks[0].note).toBe("Fully booked");
  });
});
