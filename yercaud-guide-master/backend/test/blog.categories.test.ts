import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

async function setup(ctx: TestContext) {
  const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
  await grantRole(ctx.db, adminId, "Super Admin");
  return { adminCookie };
}

describe("Blog Categories", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("lists categories without requiring auth", async () => {
    await setup(ctx);
    await ctx.db.query(`INSERT INTO blog_categories (name, slug) VALUES ('Guides', 'guides')`);
    const response = await ctx.app.inject({ method: "GET", url: "/blog-categories" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
  });

  it("blocks a non-admin from create, update, and delete with 403", async () => {
    const { adminCookie } = await setup(ctx);
    const { cookie: plainCookie } = await registerAndGetCookie(ctx, "plain@example.com");

    const create = await ctx.app.inject({ method: "POST", url: "/blog-categories", headers: { cookie: plainCookie }, payload: { name: "X" } });
    expect(create.statusCode).toBe(403);

    const seeded = await ctx.app.inject({ method: "POST", url: "/blog-categories", headers: { cookie: adminCookie }, payload: { name: "Guides" } });
    const id = seeded.json().id;

    const edit = await ctx.app.inject({ method: "PATCH", url: `/blog-categories/${id}`, headers: { cookie: plainCookie }, payload: { name: "Y" } });
    expect(edit.statusCode).toBe(403);

    const del = await ctx.app.inject({ method: "DELETE", url: `/blog-categories/${id}`, headers: { cookie: plainCookie } });
    expect(del.statusCode).toBe(403);
  });

  it("generates a URL-safe slug from the name, and re-slugs on rename", async () => {
    const { adminCookie } = await setup(ctx);
    const create = await ctx.app.inject({
      method: "POST",
      url: "/blog-categories",
      headers: { cookie: adminCookie },
      payload: { name: "Travel & Guides!" },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().slug).toBe("travel-guides");

    const edit = await ctx.app.inject({
      method: "PATCH",
      url: `/blog-categories/${create.json().id}`,
      headers: { cookie: adminCookie },
      payload: { name: "Food Stops" },
    });
    expect(edit.json()).toMatchObject({ name: "Food Stops", slug: "food-stops" });
  });

  it("returns a clean 409, not a raw DB error, for a duplicate name", async () => {
    const { adminCookie } = await setup(ctx);
    await ctx.app.inject({ method: "POST", url: "/blog-categories", headers: { cookie: adminCookie }, payload: { name: "Guides" } });
    const dupe = await ctx.app.inject({ method: "POST", url: "/blog-categories", headers: { cookie: adminCookie }, payload: { name: "Guides" } });
    expect(dupe.statusCode).toBe(409);
  });

  it("deletes an unused category", async () => {
    const { adminCookie } = await setup(ctx);
    const create = await ctx.app.inject({ method: "POST", url: "/blog-categories", headers: { cookie: adminCookie }, payload: { name: "Unused" } });
    const del = await ctx.app.inject({ method: "DELETE", url: `/blog-categories/${create.json().id}`, headers: { cookie: adminCookie } });
    expect(del.statusCode).toBe(204);

    const list = await ctx.app.inject({ method: "GET", url: "/blog-categories" });
    expect(list.json()).toHaveLength(0);
  });

  it("blocks deleting a category that still has posts, with a clean 409 (ADR 0009 RESTRICT)", async () => {
    const { adminCookie } = await setup(ctx);
    const create = await ctx.app.inject({ method: "POST", url: "/blog-categories", headers: { cookie: adminCookie }, payload: { name: "In Use" } });
    const categoryId = create.json().id;
    await ctx.app.inject({
      method: "POST",
      url: "/blog-posts",
      headers: { cookie: adminCookie },
      payload: { categoryId, title: "A Post", body: "Body" },
    });

    const del = await ctx.app.inject({ method: "DELETE", url: `/blog-categories/${categoryId}`, headers: { cookie: adminCookie } });
    expect(del.statusCode).toBe(409);
  });
});
