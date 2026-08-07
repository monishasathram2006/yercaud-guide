import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";
import type { EmbeddingProvider } from "../src/modules/search/provider.js";
import { EMBEDDING_DIMENSIONS } from "../src/modules/search/provider.js";
import { syncEmbeddings } from "../src/modules/search/sync.js";

// --- shared seed helpers (same shape as listings.test.ts) -------------------

async function seedCategory(ctx: TestContext, slug = "hotel", hasDetailTable = true): Promise<string> {
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
  name = "Lake View Inn",
): Promise<string> {
  const create = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerCookie }, payload: { name } });
  const businessId = create.json().id;
  await ctx.app.inject({ method: "POST", url: `/businesses/${businessId}/approve`, headers: { cookie: adminCookie } });
  return businessId;
}

async function seedApprovedListing(
  ctx: TestContext,
  ownerCookie: string,
  adminCookie: string,
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
  const listingId = create.json().id;
  await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/approve`, headers: { cookie: adminCookie } });
  return listingId;
}

/**
 * A deterministic fake embedding provider (the one new seam). It encodes a tiny
 * synonym map: two different words map to the same axis, so a query using one
 * word lands nearest to a document using the other — which is a semantic match
 * the lexical leg, matching literal tokens, would miss. `calls` lets a test
 * assert that quick mode never touches it.
 */
function fakeProvider() {
  const SYNONYMS: Record<string, number> = { lakeside: 5, waterfront: 5, spicy: 7, fiery: 7 };
  const state = { calls: 0, embed: async (texts: string[]) => texts.map((t) => vectorFor(t)) };
  function vectorFor(text: string): number[] {
    const lower = text.toLowerCase();
    const v = new Array(EMBEDDING_DIMENSIONS).fill(0);
    let hit = false;
    for (const [word, axis] of Object.entries(SYNONYMS)) {
      if (lower.includes(word)) {
        v[axis] = 1;
        hit = true;
      }
    }
    // A non-zero default axis keeps unrelated docs off the synonym axes (cosine
    // distance is undefined for a zero vector).
    if (!hit) v[0] = 1;
    return v;
  }
  const provider: EmbeddingProvider = {
    embed: (texts) => {
      state.calls += 1;
      return state.embed(texts);
    },
  };
  return { provider, state };
}

describe("Search (hybrid, lexical leg)", () => {
  let ctx: TestContext;
  beforeEach(async () => {
    // No embeddingProvider → lexical-only, the default state of CI.
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });
  afterEach(async () => closeTestApp(ctx));

  it("returns a grouped { listings, businesses } shape", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin1@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner1@example.com");
    const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie, "Sunset Resorts");
    const categoryId = await seedCategory(ctx);
    await seedApprovedListing(ctx, ownerCookie, adminCookie, businessId, categoryId, "Sunset Villa");

    const res = await ctx.app.inject({ method: "GET", url: "/search?q=Sunset" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.listings)).toBe(true);
    expect(Array.isArray(body.businesses)).toBe(true);
    expect(body.listings.map((l: { name: string }) => l.name)).toContain("Sunset Villa");
    expect(body.businesses.map((b: { name: string }) => b.name)).toContain("Sunset Resorts");
    // BusinessSummary carries a caller-visible listing count.
    expect(body.businesses[0].listingCount).toBe(1);
  });

  it("requires q", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/search" });
    expect(res.statusCode).toBe(400);
  });

  it("ranks an exact-name match above a partial one", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin2@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner2@example.com");
    const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
    const categoryId = await seedCategory(ctx, "restaurant");
    // "Garden" appears in both; the exact phrase should win.
    await seedApprovedListing(ctx, ownerCookie, adminCookie, businessId, categoryId, "Garden Cafe");
    await seedApprovedListing(ctx, ownerCookie, adminCookie, businessId, categoryId, "Spice Garden Restaurant");

    const res = await ctx.app.inject({ method: "GET", url: "/search?q=Spice+Garden+Restaurant" });
    expect(res.json().listings[0].name).toBe("Spice Garden Restaurant");
  });

  it("tolerates a typo via the trigram fallback", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin3@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner3@example.com");
    const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
    const categoryId = await seedCategory(ctx);
    await seedApprovedListing(ctx, ownerCookie, adminCookie, businessId, categoryId, "Sunset Villa");

    // "Sonset" has no FTS match but is trigram-close to "Sunset".
    const res = await ctx.app.inject({ method: "GET", url: "/search?q=Sonset" });
    expect(res.json().listings.map((l: { name: string }) => l.name)).toContain("Sunset Villa");
  });

  it("scopes the listings group to a category, leaving businesses unscoped", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin4@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner4@example.com");
    const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie, "Lake Group");
    const hotelId = await seedCategory(ctx, "hotel");
    const restaurantId = await seedCategory(ctx, "restaurant");
    await seedApprovedListing(ctx, ownerCookie, adminCookie, businessId, hotelId, "Lake Hotel");
    await seedApprovedListing(ctx, ownerCookie, adminCookie, businessId, restaurantId, "Lake Diner");

    const res = await ctx.app.inject({ method: "GET", url: "/search?q=Lake&category=hotel" });
    const names = res.json().listings.map((l: { name: string }) => l.name);
    expect(names).toContain("Lake Hotel");
    expect(names).not.toContain("Lake Diner");
  });

  it("shows an owner their own pending Listing but hides it from a stranger", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin5@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner5@example.com");
    const { cookie: strangerCookie } = await registerAndGetCookie(ctx, "stranger5@example.com");
    const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
    const categoryId = await seedCategory(ctx);
    // Created but not approved → pending.
    await ctx.app.inject({
      method: "POST",
      url: "/listings",
      headers: { cookie: ownerCookie },
      payload: { businessId, categoryId, name: "Pending Sunset Lodge" },
    });

    const asOwner = await ctx.app.inject({ method: "GET", url: "/search?q=Sunset", headers: { cookie: ownerCookie } });
    expect(asOwner.json().listings.map((l: { name: string }) => l.name)).toContain("Pending Sunset Lodge");

    const asStranger = await ctx.app.inject({ method: "GET", url: "/search?q=Sunset", headers: { cookie: strangerCookie } });
    expect(asStranger.json().listings.map((l: { name: string }) => l.name)).not.toContain("Pending Sunset Lodge");

    const asAnon = await ctx.app.inject({ method: "GET", url: "/search?q=Sunset" });
    expect(asAnon.json().listings).toHaveLength(0);
  });
});

describe("Search (semantic leg, fake provider)", () => {
  let ctx: TestContext;
  let fake: ReturnType<typeof fakeProvider>;
  beforeEach(async () => {
    fake = fakeProvider();
    ctx = await buildTestApp({ embeddingProvider: fake.provider });
    await resetDb(ctx.db);
  });
  afterEach(async () => closeTestApp(ctx));

  it("finds a Listing by meaning after reconcile — a match the lexical leg misses", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "adminS1@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "ownerS1@example.com");
    const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
    const categoryId = await seedCategory(ctx);
    // Document says "waterfront"; the fake maps it to the same axis as "lakeside".
    await seedApprovedListing(ctx, ownerCookie, adminCookie, businessId, categoryId, "Blue Cove Stay", "A calm waterfront retreat.");

    await syncEmbeddings(ctx.db, fake.provider);

    // Full mode: the semantic leg matches "lakeside" → "waterfront".
    const full = await ctx.app.inject({ method: "GET", url: "/search?q=lakeside" });
    expect(full.json().listings.map((l: { name: string }) => l.name)).toContain("Blue Cove Stay");

    // Quick (lexical-only) mode: "lakeside" has no literal match, so nothing.
    const quick = await ctx.app.inject({ method: "GET", url: "/search?q=lakeside&mode=quick" });
    expect(quick.json().listings).toHaveLength(0);
  });

  it("excludes semantically-distant rows so a nonsense query returns nothing", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "adminS4@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "ownerS4@example.com");
    const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
    const categoryId = await seedCategory(ctx);
    // The only document is on the "waterfront" axis.
    await seedApprovedListing(ctx, ownerCookie, adminCookie, businessId, categoryId, "Blue Cove Stay", "A calm waterfront retreat.");
    await syncEmbeddings(ctx.db, fake.provider);

    // "spicy" is a different axis (orthogonal → max distance) and absent from any
    // lexical field, so neither leg matches. Without the distance cutoff the
    // semantic leg would still return its nearest row.
    const res = await ctx.app.inject({ method: "GET", url: "/search?q=spicy" });
    expect(res.json().listings).toHaveLength(0);
  });

  it("does not call the provider in quick mode", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "adminS2@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "ownerS2@example.com");
    const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
    const categoryId = await seedCategory(ctx);
    await seedApprovedListing(ctx, ownerCookie, adminCookie, businessId, categoryId, "Sunset Villa");
    fake.state.calls = 0;

    await ctx.app.inject({ method: "GET", url: "/search?q=Sunset&mode=quick" });
    expect(fake.state.calls).toBe(0);

    await ctx.app.inject({ method: "GET", url: "/search?q=Sunset" });
    expect(fake.state.calls).toBe(1);
  });

  it("marks an entity stale when its content is edited through the API", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "adminS5@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "ownerS5@example.com");
    const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
    const categoryId = await seedCategory(ctx);
    const listingId = await seedApprovedListing(ctx, ownerCookie, adminCookie, businessId, categoryId, "Sunset Villa", "Original.");

    // Embed it, clearing the stale flag.
    await syncEmbeddings(ctx.db, fake.provider);
    const before = await ctx.db.query<{ embedding_stale: boolean }>("SELECT embedding_stale FROM listings WHERE id = $1", [listingId]);
    expect(before.rows[0].embedding_stale).toBe(false);

    // A content edit through the real endpoint must flip it back (the trigger).
    const edit = await ctx.app.inject({
      method: "PATCH",
      url: `/listings/${listingId}`,
      headers: { cookie: ownerCookie },
      payload: { businessId, categoryId, name: "Sunset Villa", description: "A brand new description." },
    });
    expect(edit.statusCode).toBe(200);
    const after = await ctx.db.query<{ embedding_stale: boolean }>("SELECT embedding_stale FROM listings WHERE id = $1", [listingId]);
    expect(after.rows[0].embedding_stale).toBe(true);
  });

  it("reconcile skips a row whose document is unchanged", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "adminS3@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "ownerS3@example.com");
    const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
    const categoryId = await seedCategory(ctx);
    const listingId = await seedApprovedListing(ctx, ownerCookie, adminCookie, businessId, categoryId, "Sunset Villa");

    const first = await syncEmbeddings(ctx.db, fake.provider);
    expect(first.listings.embedded).toBeGreaterThanOrEqual(1);

    // Re-mark stale without changing any document content.
    await ctx.db.query(`UPDATE listings SET embedding_stale = true WHERE id = $1`, [listingId]);
    const second = await syncEmbeddings(ctx.db, fake.provider);
    // The document is byte-identical, so it's cleared without a re-embed.
    expect(second.listings.embedded).toBe(0);
    expect(second.listings.skipped).toBeGreaterThanOrEqual(1);
  });
});

describe("Search (graceful degradation)", () => {
  let ctx: TestContext;
  beforeEach(async () => {
    // A provider that always fails — search must still return lexical results.
    const failing: EmbeddingProvider = { embed: async () => { throw new Error("azure down"); } };
    ctx = await buildTestApp({ embeddingProvider: failing });
    await resetDb(ctx.db);
  });
  afterEach(async () => closeTestApp(ctx));

  it("returns lexical results when the provider throws", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "adminD1@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "ownerD1@example.com");
    const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
    const categoryId = await seedCategory(ctx);
    await seedApprovedListing(ctx, ownerCookie, adminCookie, businessId, categoryId, "Sunset Villa");

    const res = await ctx.app.inject({ method: "GET", url: "/search?q=Sunset" });
    expect(res.statusCode).toBe(200);
    expect(res.json().listings.map((l: { name: string }) => l.name)).toContain("Sunset Villa");
  });
});
