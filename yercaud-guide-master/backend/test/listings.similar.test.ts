import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";
import type { EmbeddingProvider } from "../src/modules/search/provider.js";
import { EMBEDDING_DIMENSIONS } from "../src/modules/search/provider.js";
import { syncEmbeddings } from "../src/modules/search/sync.js";

/**
 * "Similar Listings" (ADR 0014): the nearest other approved Listings in the
 * same Category, by content embedding distance — not view co-occurrence.
 */

async function seedCategory(ctx: TestContext, slug: string, hasDetailTable = true): Promise<string> {
  const { rows } = await ctx.db.query<{ id: string }>(
    `INSERT INTO categories (name, slug, has_detail_table) VALUES ($1, $2, $3) RETURNING id`,
    [slug, slug, hasDetailTable],
  );
  return rows[0].id;
}

async function createApprovedBusiness(
  ctx: TestContext,
  ownerCookie: string,
  adminCookie: string,
  name = "Lake Group",
): Promise<string> {
  const create = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerCookie }, payload: { name } });
  const businessId = create.json().id;
  await ctx.app.inject({ method: "POST", url: `/businesses/${businessId}/approve`, headers: { cookie: adminCookie } });
  return businessId;
}

async function createListing(
  ctx: TestContext,
  ownerCookie: string,
  businessId: string,
  categoryId: string,
  name: string,
  description?: string,
): Promise<string> {
  const create = await ctx.app.inject({
    method: "POST",
    url: "/listings",
    headers: { cookie: ownerCookie },
    payload: { businessId, categoryId, name, description },
  });
  return create.json().id;
}

async function approve(ctx: TestContext, adminCookie: string, listingId: string) {
  await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/approve`, headers: { cookie: adminCookie } });
}

/**
 * A deterministic fake embedding provider (same technique as search.test.ts):
 * a word maps to a one-hot axis, so two documents sharing a word land at
 * cosine distance 0, and documents on different axes land at distance 1.
 */
function fakeProvider() {
  const AXES: Record<string, number> = { lakeside: 5, hillside: 9 };
  function vectorFor(text: string): number[] {
    const lower = text.toLowerCase();
    const v = new Array(EMBEDDING_DIMENSIONS).fill(0);
    let hit = false;
    for (const [word, axis] of Object.entries(AXES)) {
      if (lower.includes(word)) {
        v[axis] = 1;
        hit = true;
      }
    }
    if (!hit) v[0] = 1;
    return v;
  }
  const provider: EmbeddingProvider = { embed: async (texts) => texts.map(vectorFor) };
  return provider;
}

describe("Similar Listings", () => {
  let ctx: TestContext;
  let provider: EmbeddingProvider;
  beforeEach(async () => {
    provider = fakeProvider();
    ctx = await buildTestApp({ embeddingProvider: provider });
    await resetDb(ctx.db);
  });
  afterEach(async () => closeTestApp(ctx));

  it("ranks same-category matches nearest-first, excluding the Listing itself", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin1@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner1@example.com");
    const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
    const hotelId = await seedCategory(ctx, "hotel");

    const target = await createListing(ctx, ownerCookie, businessId, hotelId, "Lakeside Hotel", "A lakeside retreat");
    const near = await createListing(ctx, ownerCookie, businessId, hotelId, "Lake View Stay", "Another lakeside spot");
    const far = await createListing(ctx, ownerCookie, businessId, hotelId, "Mountain Lodge", "A hillside cabin");
    await approve(ctx, adminCookie, target);
    await approve(ctx, adminCookie, near);
    await approve(ctx, adminCookie, far);
    await syncEmbeddings(ctx.db, provider);

    const res = await ctx.app.inject({ method: "GET", url: `/listings/${target}/similar` });
    expect(res.statusCode).toBe(200);
    const names = res.json().map((l: { name: string }) => l.name);
    expect(names).toEqual(["Lake View Stay", "Mountain Lodge"]);
  });

  it("excludes Listings in a different Category even when the embedding is closer", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin2@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner2@example.com");
    const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
    const hotelId = await seedCategory(ctx, "hotel");
    const restaurantId = await seedCategory(ctx, "restaurant");

    const target = await createListing(ctx, ownerCookie, businessId, hotelId, "Lakeside Hotel", "A lakeside retreat");
    const otherCategory = await createListing(ctx, ownerCookie, businessId, restaurantId, "Lakeside Diner", "A lakeside retreat");
    await approve(ctx, adminCookie, target);
    await approve(ctx, adminCookie, otherCategory);
    await syncEmbeddings(ctx.db, provider);

    const res = await ctx.app.inject({ method: "GET", url: `/listings/${target}/similar` });
    expect(res.json().map((l: { name: string }) => l.name)).not.toContain("Lakeside Diner");
  });

  it("excludes a same-category Listing that isn't approved", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin3@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner3@example.com");
    const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
    const hotelId = await seedCategory(ctx, "hotel");

    const target = await createListing(ctx, ownerCookie, businessId, hotelId, "Lakeside Hotel", "A lakeside retreat");
    await createListing(ctx, ownerCookie, businessId, hotelId, "Lakeside Inn", "A lakeside retreat");
    await approve(ctx, adminCookie, target);
    // "Lakeside Inn" is left unapproved.
    await syncEmbeddings(ctx.db, provider);

    const res = await ctx.app.inject({ method: "GET", url: `/listings/${target}/similar` });
    expect(res.json().map((l: { name: string }) => l.name)).not.toContain("Lakeside Inn");
  });

  it("caps results at 4 even with more same-category matches available", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin4@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner4@example.com");
    const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
    const hotelId = await seedCategory(ctx, "hotel");

    const target = await createListing(ctx, ownerCookie, businessId, hotelId, "Lakeside Hotel", "A lakeside retreat");
    await approve(ctx, adminCookie, target);
    for (let i = 0; i < 5; i++) {
      const id = await createListing(ctx, ownerCookie, businessId, hotelId, `Lakeside Stay ${i}`, "A lakeside retreat");
      await approve(ctx, adminCookie, id);
    }
    await syncEmbeddings(ctx.db, provider);

    const res = await ctx.app.inject({ method: "GET", url: `/listings/${target}/similar` });
    expect(res.json()).toHaveLength(4);
  });

  it("returns an empty array when the target Listing has no embedding yet", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin5@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner5@example.com");
    const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
    const hotelId = await seedCategory(ctx, "hotel");

    const target = await createListing(ctx, ownerCookie, businessId, hotelId, "Lakeside Hotel", "A lakeside retreat");
    const other = await createListing(ctx, ownerCookie, businessId, hotelId, "Lake View Stay", "Another lakeside spot");
    await approve(ctx, adminCookie, target);
    await approve(ctx, adminCookie, other);
    // No syncEmbeddings call: both Listings still have a null embedding.

    const res = await ctx.app.inject({ method: "GET", url: `/listings/${target}/similar` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("404s for an unknown Listing id", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/listings/00000000-0000-0000-0000-000000000000/similar" });
    expect(res.statusCode).toBe(404);
  });

  it("404s an unapproved target Listing to a stranger, but allows its owner", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin6@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner6@example.com");
    const { cookie: strangerCookie } = await registerAndGetCookie(ctx, "stranger6@example.com");
    const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
    const hotelId = await seedCategory(ctx, "hotel");
    const target = await createListing(ctx, ownerCookie, businessId, hotelId, "Lakeside Hotel", "A lakeside retreat");

    const asAnon = await ctx.app.inject({ method: "GET", url: `/listings/${target}/similar` });
    expect(asAnon.statusCode).toBe(404);

    const asStranger = await ctx.app.inject({ method: "GET", url: `/listings/${target}/similar`, headers: { cookie: strangerCookie } });
    expect(asStranger.statusCode).toBe(404);

    const asOwner = await ctx.app.inject({ method: "GET", url: `/listings/${target}/similar`, headers: { cookie: ownerCookie } });
    expect(asOwner.statusCode).toBe(200);
  });
});
