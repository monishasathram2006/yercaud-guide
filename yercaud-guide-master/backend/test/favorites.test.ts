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

  async function createListing(name: string, approve = true): Promise<string> {
    const create = await ctx.app.inject({
      method: "POST",
      url: "/listings",
      headers: { cookie: ownerCookie },
      payload: { businessId, categoryId, name },
    });
    const listingId = create.json().id;
    if (approve) {
      await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/approve`, headers: { cookie: adminCookie } });
    }
    return listingId;
  }

  return { adminCookie, ownerCookie, createListing };
}

describe("Favorites", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("rejects an anonymous favorite attempt with 401", async () => {
    const { createListing } = await setup(ctx);
    const listingId = await createListing("Public Listing");
    const response = await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/favorite` });
    expect(response.statusCode).toBe(401);
  });

  it("404s favoriting a Listing that isn't approved yet", async () => {
    const { createListing } = await setup(ctx);
    const { cookie: visitorCookie } = await registerAndGetCookie(ctx, "visitor@example.com");
    const listingId = await createListing("Still Pending", false);
    const response = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/favorite`,
      headers: { cookie: visitorCookie },
    });
    expect(response.statusCode).toBe(404);
  });

  it("lets a signed-in visitor favorite a Listing, is idempotent on re-favorite, and lists it", async () => {
    const { createListing } = await setup(ctx);
    const { cookie: visitorCookie } = await registerAndGetCookie(ctx, "visitor2@example.com");
    const listingId = await createListing("Public Listing");

    const first = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/favorite`,
      headers: { cookie: visitorCookie },
    });
    expect(first.statusCode).toBe(204);

    const second = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/favorite`,
      headers: { cookie: visitorCookie },
    });
    expect(second.statusCode).toBe(204);

    const list = await ctx.app.inject({ method: "GET", url: "/me/favorites", headers: { cookie: visitorCookie } });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(1);
    expect(list.json()[0].id).toBe(listingId);
  });

  it("removes a favorite, idempotently, including for a Listing already un-favorited or since archived", async () => {
    const { adminCookie, createListing } = await setup(ctx);
    const { cookie: visitorCookie } = await registerAndGetCookie(ctx, "visitor3@example.com");
    const listingId = await createListing("Public Listing");
    await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/favorite`, headers: { cookie: visitorCookie } });

    const remove = await ctx.app.inject({
      method: "DELETE",
      url: `/listings/${listingId}/favorite`,
      headers: { cookie: visitorCookie },
    });
    expect(remove.statusCode).toBe(204);

    const list = await ctx.app.inject({ method: "GET", url: "/me/favorites", headers: { cookie: visitorCookie } });
    expect(list.json()).toHaveLength(0);

    const removeAgain = await ctx.app.inject({
      method: "DELETE",
      url: `/listings/${listingId}/favorite`,
      headers: { cookie: visitorCookie },
    });
    expect(removeAgain.statusCode).toBe(204);

    // Removing a favorite on a Listing that's since been archived must still work
    // (the approved-Listing gate is POST-only).
    const listingId2 = await createListing("Later Archived");
    await ctx.app.inject({ method: "POST", url: `/listings/${listingId2}/favorite`, headers: { cookie: visitorCookie } });
    await ctx.app.inject({ method: "POST", url: `/listings/${listingId2}/archive`, headers: { cookie: adminCookie } });
    const removeArchived = await ctx.app.inject({
      method: "DELETE",
      url: `/listings/${listingId2}/favorite`,
      headers: { cookie: visitorCookie },
    });
    expect(removeArchived.statusCode).toBe(204);
  });

  it("never shows one User's favorites to another", async () => {
    const { createListing } = await setup(ctx);
    const { cookie: visitorACookie } = await registerAndGetCookie(ctx, "visitorA@example.com");
    const { cookie: visitorBCookie } = await registerAndGetCookie(ctx, "visitorB@example.com");
    const listingId = await createListing("Public Listing");
    await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/favorite`, headers: { cookie: visitorACookie } });

    const listB = await ctx.app.inject({ method: "GET", url: "/me/favorites", headers: { cookie: visitorBCookie } });
    expect(listB.json()).toHaveLength(0);
  });
});
