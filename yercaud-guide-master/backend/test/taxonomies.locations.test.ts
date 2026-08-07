import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

describe("Locations", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("lists locations without requiring auth", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/locations" });
    expect(response.statusCode).toBe(200);
  });

  it("generates a URL-safe slug from the name", async () => {
    const { cookie, userId } = await registerAndGetCookie(ctx, "admin@example.com");
    await grantRole(ctx.db, userId, "Super Admin");

    const response = await ctx.app.inject({
      method: "POST",
      url: "/locations",
      headers: { cookie },
      payload: { name: "Near Lake, Yercaud" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().slug).toBe("near-lake-yercaud");
  });

  it("de-duplicates the slug when two names collide once slugified", async () => {
    const { cookie, userId } = await registerAndGetCookie(ctx, "admin2@example.com");
    await grantRole(ctx.db, userId, "Super Admin");

    const first = await ctx.app.inject({
      method: "POST",
      url: "/locations",
      headers: { cookie },
      payload: { name: "Lady's Seat" },
    });
    const second = await ctx.app.inject({
      method: "POST",
      url: "/locations",
      headers: { cookie },
      payload: { name: "Lady's Seat!" },
    });

    expect(first.json().slug).toBe("ladys-seat");
    expect(second.json().slug).not.toBe(first.json().slug);
    expect(second.json().slug).toMatch(/^ladys-seat-/);
  });

  it("lets a Super Admin update and delete a location", async () => {
    const { cookie, userId } = await registerAndGetCookie(ctx, "admin3@example.com");
    await grantRole(ctx.db, userId, "Super Admin");

    const create = await ctx.app.inject({
      method: "POST",
      url: "/locations",
      headers: { cookie },
      payload: { name: "Kottachedu" },
    });
    const locationId = create.json().id;

    const update = await ctx.app.inject({
      method: "PATCH",
      url: `/locations/${locationId}`,
      headers: { cookie },
      payload: { name: "Kottachedu Village" },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().slug).toBe("kottachedu-village");

    const del = await ctx.app.inject({ method: "DELETE", url: `/locations/${locationId}`, headers: { cookie } });
    expect(del.statusCode).toBe(204);
  });

  it("detaches a deleted location from Listings rather than blocking the delete", async () => {
    const { cookie, userId } = await registerAndGetCookie(ctx, "admin4@example.com");
    await grantRole(ctx.db, userId, "Super Admin");

    const category = await ctx.db.query(
      `INSERT INTO categories (name, slug, has_detail_table) VALUES ('Hotel', 'hotel', true) RETURNING id`,
    );
    const business = await ctx.db.query(`INSERT INTO businesses (owner_id, name) VALUES ($1, 'Biz') RETURNING id`, [
      userId,
    ]);
    const location = await ctx.app.inject({
      method: "POST",
      url: "/locations",
      headers: { cookie },
      payload: { name: "Yercaud Hills" },
    });
    const listing = await ctx.db.query(
      `INSERT INTO listings (business_id, category_id, location_id, name, slug) VALUES ($1, $2, $3, 'L', 'l') RETURNING id`,
      [business.rows[0].id, category.rows[0].id, location.json().id],
    );

    const del = await ctx.app.inject({
      method: "DELETE",
      url: `/locations/${location.json().id}`,
      headers: { cookie },
    });
    expect(del.statusCode).toBe(204);

    const { rows } = await ctx.db.query("SELECT location_id FROM listings WHERE id = $1", [listing.rows[0].id]);
    expect(rows[0].location_id).toBeNull();
  });

  it("rejects create for an unauthenticated caller with 401 and a signed-in caller without permission with 403", async () => {
    const anon = await ctx.app.inject({ method: "POST", url: "/locations", payload: { name: "Somewhere" } });
    expect(anon.statusCode).toBe(401);

    const { cookie } = await registerAndGetCookie(ctx, "plain@example.com");
    const forbidden = await ctx.app.inject({
      method: "POST",
      url: "/locations",
      headers: { cookie },
      payload: { name: "Somewhere" },
    });
    expect(forbidden.statusCode).toBe(403);
  });
});
