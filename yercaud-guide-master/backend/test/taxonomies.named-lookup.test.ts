import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

describe("Named-lookup taxonomies (Amenities as the representative case)", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("lists entries without requiring auth", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/amenities" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it("rejects create for an anonymous caller with 401", async () => {
    const response = await ctx.app.inject({ method: "POST", url: "/amenities", payload: { name: "Free Wi-Fi" } });
    expect(response.statusCode).toBe(401);
  });

  it("rejects create for a signed-in caller without the Categories:create permission with 403", async () => {
    const { cookie } = await registerAndGetCookie(ctx, "plain@example.com");
    const response = await ctx.app.inject({
      method: "POST",
      url: "/amenities",
      headers: { cookie },
      payload: { name: "Free Wi-Fi" },
    });
    expect(response.statusCode).toBe(403);
  });

  it("lets a Super Admin create, update, and delete an amenity", async () => {
    const { cookie, userId } = await registerAndGetCookie(ctx, "admin@example.com");
    await grantRole(ctx.db, userId, "Super Admin");

    const create = await ctx.app.inject({
      method: "POST",
      url: "/amenities",
      headers: { cookie },
      payload: { name: "Free Wi-Fi", icon: "wifi" },
    });
    expect(create.statusCode).toBe(201);
    const amenityId = create.json().id;
    expect(create.json().name).toBe("Free Wi-Fi");

    const list = await ctx.app.inject({ method: "GET", url: "/amenities" });
    expect(list.json()).toHaveLength(1);

    const update = await ctx.app.inject({
      method: "PATCH",
      url: `/amenities/${amenityId}`,
      headers: { cookie },
      payload: { name: "Free High-Speed Wi-Fi", icon: "wifi" },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().name).toBe("Free High-Speed Wi-Fi");

    const del = await ctx.app.inject({ method: "DELETE", url: `/amenities/${amenityId}`, headers: { cookie } });
    expect(del.statusCode).toBe(204);

    const listAfter = await ctx.app.inject({ method: "GET", url: "/amenities" });
    expect(listAfter.json()).toHaveLength(0);
  });

  it("returns a clean 409, not a raw DB error, for a duplicate name", async () => {
    const { cookie, userId } = await registerAndGetCookie(ctx, "admin2@example.com");
    await grantRole(ctx.db, userId, "Super Admin");

    await ctx.app.inject({ method: "POST", url: "/amenities", headers: { cookie }, payload: { name: "Parking" } });
    const dupe = await ctx.app.inject({
      method: "POST",
      url: "/amenities",
      headers: { cookie },
      payload: { name: "Parking" },
    });

    expect(dupe.statusCode).toBe(409);
  });

  it("detaches a deleted amenity from Listings that had it, rather than blocking the delete", async () => {
    const { cookie, userId } = await registerAndGetCookie(ctx, "admin3@example.com");
    await grantRole(ctx.db, userId, "Super Admin");

    const category = await ctx.db.query(
      `INSERT INTO categories (name, slug, has_detail_table) VALUES ('Hotel', 'hotel', true) RETURNING id`,
    );
    const business = await ctx.db.query(`INSERT INTO businesses (owner_id, name) VALUES ($1, 'Biz') RETURNING id`, [
      userId,
    ]);
    const listing = await ctx.db.query(
      `INSERT INTO listings (business_id, category_id, name, slug) VALUES ($1, $2, 'L', 'l') RETURNING id`,
      [business.rows[0].id, category.rows[0].id],
    );
    const amenity = await ctx.app.inject({
      method: "POST",
      url: "/amenities",
      headers: { cookie },
      payload: { name: "Pool" },
    });
    await ctx.db.query(`INSERT INTO listing_amenities (listing_id, amenity_id) VALUES ($1, $2)`, [
      listing.rows[0].id,
      amenity.json().id,
    ]);

    const del = await ctx.app.inject({
      method: "DELETE",
      url: `/amenities/${amenity.json().id}`,
      headers: { cookie },
    });
    expect(del.statusCode).toBe(204);
  });
});

describe("Named-lookup taxonomies: the other three resources reuse the same factory", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  const resources: [string, string, string][] = [
    ["/attribute-tags", "Family Friendly", "Pure Veg"],
    ["/property-types", "Homestay", "Villa"],
    ["/languages", "Tamil", "Telugu"],
  ];

  it.each(resources)("supports full CRUD on %s", async (path, name, renamedTo) => {
    const { cookie, userId } = await registerAndGetCookie(ctx, `admin-${path.replace(/\W/g, "")}@example.com`);
    await grantRole(ctx.db, userId, "Super Admin");

    const create = await ctx.app.inject({ method: "POST", url: path, headers: { cookie }, payload: { name } });
    expect(create.statusCode).toBe(201);
    expect(create.json().name).toBe(name);
    const id = create.json().id;

    const list = await ctx.app.inject({ method: "GET", url: path });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(1);

    const update = await ctx.app.inject({
      method: "PATCH",
      url: `${path}/${id}`,
      headers: { cookie },
      payload: { name: renamedTo },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().name).toBe(renamedTo);

    const del = await ctx.app.inject({ method: "DELETE", url: `${path}/${id}`, headers: { cookie } });
    expect(del.statusCode).toBe(204);

    const listAfter = await ctx.app.inject({ method: "GET", url: path });
    expect(listAfter.json()).toHaveLength(0);
  });

  it.each(resources)("returns a clean 409 for a duplicate name on %s", async (path, name) => {
    const { cookie, userId } = await registerAndGetCookie(ctx, `dupe-${path.replace(/\W/g, "")}@example.com`);
    await grantRole(ctx.db, userId, "Super Admin");

    await ctx.app.inject({ method: "POST", url: path, headers: { cookie }, payload: { name } });
    const dupe = await ctx.app.inject({ method: "POST", url: path, headers: { cookie }, payload: { name } });

    expect(dupe.statusCode).toBe(409);
  });

  it.each(resources)(
    "rejects create on %s for an unauthenticated caller with 401 and a signed-in caller without permission with 403",
    async (path, name) => {
      const anon = await ctx.app.inject({ method: "POST", url: path, payload: { name } });
      expect(anon.statusCode).toBe(401);

      const { cookie } = await registerAndGetCookie(ctx, `plain-${path.replace(/\W/g, "")}@example.com`);
      const forbidden = await ctx.app.inject({ method: "POST", url: path, headers: { cookie }, payload: { name } });
      expect(forbidden.statusCode).toBe(403);
    },
  );
});
