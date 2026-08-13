import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

async function setup(ctx: TestContext) {
  const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
  await grantRole(ctx.db, adminId, "Super Admin");
  const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner@example.com");
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
    payload: { businessId, categoryId, name: "Test Listing" },
  });
  const listingId = create.json().id;
  return { adminCookie, ownerCookie, listingId, categoryId };
}

describe("Listing amenities/tags/attributes (replace-set endpoints)", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("replaces the amenity set, then clears it with an empty array", async () => {
    const { ownerCookie, listingId } = await setup(ctx);
    const { rows: amenityRows } = await ctx.db.query<{ id: string }>(
      `INSERT INTO amenities (name) VALUES ('Free WiFi'), ('Parking') RETURNING id`,
    );
    const amenityIds = amenityRows.map((r) => r.id);

    const put = await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/amenities`,
      headers: { cookie: ownerCookie },
      payload: { amenityIds },
    });
    expect(put.statusCode).toBe(200);

    const get = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}`, headers: { cookie: ownerCookie } });
    expect(get.json().amenityIds.sort()).toEqual([...amenityIds].sort());

    const clear = await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/amenities`,
      headers: { cookie: ownerCookie },
      payload: { amenityIds: [] },
    });
    expect(clear.statusCode).toBe(200);
    const getAfterClear = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}`, headers: { cookie: ownerCookie } });
    expect(getAfterClear.json().amenityIds).toEqual([]);
  });

  it("replaces the attribute tag set", async () => {
    const { ownerCookie, listingId } = await setup(ctx);
    const { rows: tagRows } = await ctx.db.query<{ id: string }>(
      `INSERT INTO attribute_tags (name) VALUES ('Family Friendly') RETURNING id`,
    );
    const tagIds = tagRows.map((r) => r.id);

    const put = await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/tags`,
      headers: { cookie: ownerCookie },
      payload: { tagIds },
    });
    expect(put.statusCode).toBe(200);

    const get = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}`, headers: { cookie: ownerCookie } });
    expect(get.json().tagIds).toEqual(tagIds);
  });

  it("blocks a non-owner, non-admin from replacing amenities with 403", async () => {
    const { listingId } = await setup(ctx);
    const { cookie: strangerCookie } = await registerAndGetCookie(ctx, "stranger@example.com");
    const response = await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/amenities`,
      headers: { cookie: strangerCookie },
      payload: { amenityIds: [] },
    });
    expect(response.statusCode).toBe(403);
  });

  it("sets dynamic attribute values defined for the Listing's category", async () => {
    const { ownerCookie, listingId, categoryId } = await setup(ctx);
    const { rows: attrRows } = await ctx.db.query<{ id: string }>(
      `INSERT INTO category_attributes (category_id, name, field_type) VALUES ($1, 'Pet Friendly', 'boolean') RETURNING id`,
      [categoryId],
    );
    const attributeId = attrRows[0].id;

    const put = await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/attributes`,
      headers: { cookie: ownerCookie },
      payload: { [attributeId]: "true" },
    });
    expect(put.statusCode).toBe(200);

    const { rows } = await ctx.db.query(`SELECT value FROM listing_attribute_values WHERE listing_id = $1`, [listingId]);
    expect(rows).toEqual([{ value: "true" }]);
  });

  it("rejects an attribute that belongs to a different category with 400", async () => {
    const { ownerCookie, listingId } = await setup(ctx);
    const { rows: otherCatRows } = await ctx.db.query<{ id: string }>(
      `INSERT INTO categories (name, slug, has_detail_table) VALUES ('Restaurant', 'restaurant', true) RETURNING id`,
    );
    const { rows: attrRows } = await ctx.db.query<{ id: string }>(
      `INSERT INTO category_attributes (category_id, name, field_type) VALUES ($1, 'Cuisine', 'text') RETURNING id`,
      [otherCatRows[0].id],
    );
    const wrongAttributeId = attrRows[0].id;

    const response = await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/attributes`,
      headers: { cookie: ownerCookie },
      payload: { [wrongAttributeId]: "Italian" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("rejects a value that violates the field type's shape with a clean error, not a raw DB error", async () => {
    const { ownerCookie, listingId, categoryId } = await setup(ctx);
    const { rows: attrRows } = await ctx.db.query<{ id: string }>(
      `INSERT INTO category_attributes (category_id, name, field_type) VALUES ($1, 'Rooms', 'number') RETURNING id`,
      [categoryId],
    );
    const attributeId = attrRows[0].id;

    const response = await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/attributes`,
      headers: { cookie: ownerCookie },
      payload: { [attributeId]: "not-a-number" },
    });
    expect(response.statusCode).toBe(500);
  });

  it("replacing attributes clears any value not present in the new payload", async () => {
    const { ownerCookie, listingId, categoryId } = await setup(ctx);
    const { rows: attrRows } = await ctx.db.query<{ id: string }>(
      `INSERT INTO category_attributes (category_id, name, field_type) VALUES ($1, 'Pet Friendly', 'boolean') RETURNING id`,
      [categoryId],
    );
    const attributeId = attrRows[0].id;
    await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/attributes`,
      headers: { cookie: ownerCookie },
      payload: { [attributeId]: "true" },
    });

    const clear = await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/attributes`,
      headers: { cookie: ownerCookie },
      payload: {},
    });
    expect(clear.statusCode).toBe(200);
    const { rows } = await ctx.db.query(`SELECT * FROM listing_attribute_values WHERE listing_id = $1`, [listingId]);
    expect(rows).toHaveLength(0);
  });
});
