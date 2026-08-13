import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

describe("Categories", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("lists categories without requiring auth, in sort order", async () => {
    const { cookie, userId } = await registerAndGetCookie(ctx, "admin@example.com");
    await grantRole(ctx.db, userId, "Super Admin");

    await ctx.app.inject({
      method: "POST",
      url: "/categories",
      headers: { cookie },
      payload: { name: "Shopping", slug: "shopping", sortOrder: 2 },
    });
    await ctx.app.inject({
      method: "POST",
      url: "/categories",
      headers: { cookie },
      payload: { name: "Hotels", slug: "hotels", sortOrder: 1 },
    });

    const response = await ctx.app.inject({ method: "GET", url: "/categories" });
    expect(response.statusCode).toBe(200);
    expect(response.json().map((c: { name: string }) => c.name)).toEqual(["Hotels", "Shopping"]);
  });

  it("creates a category with hasDetailTable defaulting to false, regardless of what the caller sends", async () => {
    const { cookie, userId } = await registerAndGetCookie(ctx, "admin2@example.com");
    await grantRole(ctx.db, userId, "Super Admin");

    const response = await ctx.app.inject({
      method: "POST",
      url: "/categories",
      headers: { cookie },
      // hasDetailTable is not accepted from the request at all (ADR 0003) —
      // sending it should simply have no effect.
      payload: { name: "Spa", slug: "spa", hasDetailTable: true },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().hasDetailTable).toBe(false);
  });

  it("lets a Super Admin update a category's name, icon, color, and sort order", async () => {
    const { cookie, userId } = await registerAndGetCookie(ctx, "admin3@example.com");
    await grantRole(ctx.db, userId, "Super Admin");

    const create = await ctx.app.inject({
      method: "POST",
      url: "/categories",
      headers: { cookie },
      payload: { name: "Tours", slug: "tours" },
    });
    const id = create.json().id;

    const update = await ctx.app.inject({
      method: "PATCH",
      url: `/categories/${id}`,
      headers: { cookie },
      payload: { name: "Tours & Travels", slug: "tours-travels", icon: "map", color: "#14B8A6", sortOrder: 5 },
    });

    expect(update.statusCode).toBe(200);
    expect(update.json()).toMatchObject({
      name: "Tours & Travels",
      slug: "tours-travels",
      icon: "map",
      color: "#14B8A6",
      sortOrder: 5,
    });
  });

  it("blocks deleting a category still referenced by a Listing, with a clean 409", async () => {
    const { cookie, userId } = await registerAndGetCookie(ctx, "admin4@example.com");
    await grantRole(ctx.db, userId, "Super Admin");

    const category = await ctx.app.inject({
      method: "POST",
      url: "/categories",
      headers: { cookie },
      payload: { name: "Activities", slug: "activities" },
    });
    const business = await ctx.db.query(`INSERT INTO businesses (owner_id, name) VALUES ($1, 'Biz') RETURNING id`, [
      userId,
    ]);
    await ctx.db.query(`INSERT INTO listings (business_id, category_id, name, slug) VALUES ($1, $2, 'L', 'l')`, [
      business.rows[0].id,
      category.json().id,
    ]);

    const del = await ctx.app.inject({
      method: "DELETE",
      url: `/categories/${category.json().id}`,
      headers: { cookie },
    });

    expect(del.statusCode).toBe(409);
  });

  it("deletes a category with no Listings referencing it", async () => {
    const { cookie, userId } = await registerAndGetCookie(ctx, "admin5@example.com");
    await grantRole(ctx.db, userId, "Super Admin");

    const create = await ctx.app.inject({
      method: "POST",
      url: "/categories",
      headers: { cookie },
      payload: { name: "Unused", slug: "unused" },
    });

    const del = await ctx.app.inject({
      method: "DELETE",
      url: `/categories/${create.json().id}`,
      headers: { cookie },
    });

    expect(del.statusCode).toBe(204);
  });

  it("returns a clean 409 for a duplicate slug", async () => {
    const { cookie, userId } = await registerAndGetCookie(ctx, "admin6@example.com");
    await grantRole(ctx.db, userId, "Super Admin");

    await ctx.app.inject({
      method: "POST",
      url: "/categories",
      headers: { cookie },
      payload: { name: "Health", slug: "wellness" },
    });
    const dupe = await ctx.app.inject({
      method: "POST",
      url: "/categories",
      headers: { cookie },
      payload: { name: "Wellness", slug: "wellness" },
    });

    expect(dupe.statusCode).toBe(409);
  });

  it("rejects create for an unauthenticated caller with 401 and a signed-in caller without permission with 403", async () => {
    const anon = await ctx.app.inject({
      method: "POST",
      url: "/categories",
      payload: { name: "X", slug: "x" },
    });
    expect(anon.statusCode).toBe(401);

    const { cookie } = await registerAndGetCookie(ctx, "plain@example.com");
    const forbidden = await ctx.app.inject({
      method: "POST",
      url: "/categories",
      headers: { cookie },
      payload: { name: "X", slug: "x" },
    });
    expect(forbidden.statusCode).toBe(403);
  });
});
