import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

async function createCategory(ctx: TestContext, cookie: string): Promise<string> {
  const response = await ctx.app.inject({
    method: "POST",
    url: "/categories",
    headers: { cookie },
    payload: { name: "Hotel", slug: "hotel" },
  });
  return response.json().id;
}

describe("Category Attributes", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("lists a category's attribute definitions without requiring auth, in sort order", async () => {
    const { cookie, userId } = await registerAndGetCookie(ctx, "admin@example.com");
    await grantRole(ctx.db, userId, "Super Admin");
    const categoryId = await createCategory(ctx, cookie);

    await ctx.app.inject({
      method: "POST",
      url: `/categories/${categoryId}/attributes`,
      headers: { cookie },
      payload: { name: "Second", fieldType: "text", sortOrder: 2 },
    });
    await ctx.app.inject({
      method: "POST",
      url: `/categories/${categoryId}/attributes`,
      headers: { cookie },
      payload: { name: "First", fieldType: "text", sortOrder: 1 },
    });

    const response = await ctx.app.inject({ method: "GET", url: `/categories/${categoryId}/attributes` });
    expect(response.statusCode).toBe(200);
    expect(response.json().map((a: { name: string }) => a.name)).toEqual(["First", "Second"]);
  });

  it("lets a Super Admin create, update, and delete an attribute definition", async () => {
    const { cookie, userId } = await registerAndGetCookie(ctx, "admin2@example.com");
    await grantRole(ctx.db, userId, "Super Admin");
    const categoryId = await createCategory(ctx, cookie);

    const create = await ctx.app.inject({
      method: "POST",
      url: `/categories/${categoryId}/attributes`,
      headers: { cookie },
      payload: { name: "Pet Friendly", fieldType: "boolean", isRequired: false },
    });
    expect(create.statusCode).toBe(201);
    const attributeId = create.json().id;

    const update = await ctx.app.inject({
      method: "PATCH",
      url: `/categories/${categoryId}/attributes/${attributeId}`,
      headers: { cookie },
      payload: { name: "Pets Allowed", fieldType: "boolean" },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().name).toBe("Pets Allowed");

    const del = await ctx.app.inject({
      method: "DELETE",
      url: `/categories/${categoryId}/attributes/${attributeId}`,
      headers: { cookie },
    });
    expect(del.statusCode).toBe(204);
  });

  it("rejects an invalid fieldType with 400", async () => {
    const { cookie, userId } = await registerAndGetCookie(ctx, "admin3@example.com");
    await grantRole(ctx.db, userId, "Super Admin");
    const categoryId = await createCategory(ctx, cookie);

    const response = await ctx.app.inject({
      method: "POST",
      url: `/categories/${categoryId}/attributes`,
      headers: { cookie },
      payload: { name: "Bad", fieldType: "currency" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("requires a non-empty options array when fieldType is select", async () => {
    const { cookie, userId } = await registerAndGetCookie(ctx, "admin4@example.com");
    await grantRole(ctx.db, userId, "Super Admin");
    const categoryId = await createCategory(ctx, cookie);

    const missingOptions = await ctx.app.inject({
      method: "POST",
      url: `/categories/${categoryId}/attributes`,
      headers: { cookie },
      payload: { name: "Star Rating", fieldType: "select" },
    });
    expect(missingOptions.statusCode).toBe(400);

    const emptyOptions = await ctx.app.inject({
      method: "POST",
      url: `/categories/${categoryId}/attributes`,
      headers: { cookie },
      payload: { name: "Star Rating", fieldType: "select", options: [] },
    });
    expect(emptyOptions.statusCode).toBe(400);

    const withOptions = await ctx.app.inject({
      method: "POST",
      url: `/categories/${categoryId}/attributes`,
      headers: { cookie },
      payload: { name: "Star Rating", fieldType: "select", options: ["1", "2", "3"] },
    });
    expect(withOptions.statusCode).toBe(201);
  });

  it("removes a Listing's stored value when its attribute definition is deleted (cascade)", async () => {
    const { cookie, userId } = await registerAndGetCookie(ctx, "admin5@example.com");
    await grantRole(ctx.db, userId, "Super Admin");
    const categoryId = await createCategory(ctx, cookie);

    const attribute = await ctx.app.inject({
      method: "POST",
      url: `/categories/${categoryId}/attributes`,
      headers: { cookie },
      payload: { name: "Pet Friendly", fieldType: "boolean" },
    });
    const business = await ctx.db.query(`INSERT INTO businesses (owner_id, name) VALUES ($1, 'Biz') RETURNING id`, [
      userId,
    ]);
    const listing = await ctx.db.query(
      `INSERT INTO listings (business_id, category_id, name, slug) VALUES ($1, $2, 'L', 'l') RETURNING id`,
      [business.rows[0].id, categoryId],
    );
    await ctx.db.query(
      `INSERT INTO listing_attribute_values (listing_id, category_attribute_id, value) VALUES ($1, $2, 'true')`,
      [listing.rows[0].id, attribute.json().id],
    );

    await ctx.app.inject({
      method: "DELETE",
      url: `/categories/${categoryId}/attributes/${attribute.json().id}`,
      headers: { cookie },
    });

    const { rows } = await ctx.db.query("SELECT 1 FROM listing_attribute_values WHERE listing_id = $1", [
      listing.rows[0].id,
    ]);
    expect(rows).toHaveLength(0);
  });

  it("returns a clean 409, not a raw DB error, for a duplicate attribute name on the same category", async () => {
    const { cookie, userId } = await registerAndGetCookie(ctx, "admin7@example.com");
    await grantRole(ctx.db, userId, "Super Admin");
    const categoryId = await createCategory(ctx, cookie);

    await ctx.app.inject({
      method: "POST",
      url: `/categories/${categoryId}/attributes`,
      headers: { cookie },
      payload: { name: "Max Height", fieldType: "text" },
    });
    const dupe = await ctx.app.inject({
      method: "POST",
      url: `/categories/${categoryId}/attributes`,
      headers: { cookie },
      payload: { name: "Max Height", fieldType: "number" },
    });

    expect(dupe.statusCode).toBe(409);
  });

  it("rejects create for an unauthenticated caller with 401 and a signed-in caller without permission with 403", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin6@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const categoryId = await createCategory(ctx, adminCookie);

    const anon = await ctx.app.inject({
      method: "POST",
      url: `/categories/${categoryId}/attributes`,
      payload: { name: "X", fieldType: "text" },
    });
    expect(anon.statusCode).toBe(401);

    const { cookie } = await registerAndGetCookie(ctx, "plain@example.com");
    const forbidden = await ctx.app.inject({
      method: "POST",
      url: `/categories/${categoryId}/attributes`,
      headers: { cookie },
      payload: { name: "X", fieldType: "text" },
    });
    expect(forbidden.statusCode).toBe(403);
  });
});
