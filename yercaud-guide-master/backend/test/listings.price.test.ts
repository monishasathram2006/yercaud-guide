import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

/**
 * A Listing's price (Phase 10). Two behaviours are under test and they are
 * different: for the four categories with a detail table the price is *derived*
 * from whatever already owns the truth, and for the four without it is written
 * directly. The filter is the third: GET /listings?priceBand shipped in Phase 4
 * accepting the parameter and ignoring it.
 */

interface Fixture {
  adminCookie: string;
  ownerCookie: string;
  businessId: string;
}

async function baseFixture(ctx: TestContext): Promise<Fixture> {
  const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
  await grantRole(ctx.db, adminId, "Super Admin");
  const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner@example.com");
  const bizRes = await ctx.app.inject({
    method: "POST",
    url: "/businesses",
    headers: { cookie: ownerCookie },
    payload: { name: "Biz" },
  });
  const businessId = bizRes.json().id;
  await ctx.app.inject({ method: "POST", url: `/businesses/${businessId}/approve`, headers: { cookie: adminCookie } });
  return { adminCookie, ownerCookie, businessId };
}

async function makeCategory(ctx: TestContext, slug: string, hasDetailTable: boolean): Promise<string> {
  const { rows } = await ctx.db.query<{ id: string }>(
    `INSERT INTO categories (name, slug, has_detail_table) VALUES ($1, $1, $2) RETURNING id`,
    [slug, hasDetailTable],
  );
  return rows[0].id;
}

async function makeListing(ctx: TestContext, f: Fixture, categoryId: string, name: string, extra = {}): Promise<string> {
  const res = await ctx.app.inject({
    method: "POST",
    url: "/listings",
    headers: { cookie: f.ownerCookie },
    payload: { businessId: f.businessId, categoryId, name, ...extra },
  });
  return res.json().id;
}

async function approve(ctx: TestContext, f: Fixture, listingId: string): Promise<void> {
  await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/approve`, headers: { cookie: f.adminCookie } });
}

/**
 * Reads as the owner: these Listings are still `pending`, and GET
 * /listings/{id} rightly 404s an unapproved Listing to anyone who isn't its
 * owner or an admin, which would make every field read `undefined`.
 */
async function priceOf(
  ctx: TestContext,
  f: Fixture,
  listingId: string,
): Promise<{ priceFrom: number | null; priceUnit: string | null }> {
  const res = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}`, headers: { cookie: f.ownerCookie } });
  if (res.statusCode !== 200) throw new Error(`GET /listings/${listingId} returned ${res.statusCode}: ${res.body}`);
  const body = res.json();
  return { priceFrom: body.priceFrom, priceUnit: body.priceUnit };
}

describe("Listing price — derived for the categories with a detail table", () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });
  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("derives a Hotel's price from its cheapest room's nightly rate", async () => {
    const f = await baseFixture(ctx);
    const categoryId = await makeCategory(ctx, "hotel", true);
    const listingId = await makeListing(ctx, f, categoryId, "Grand Palace");
    await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/hotel-details`,
      headers: { cookie: f.ownerCookie },
      payload: { starRating: 4 },
    });

    for (const [name, rate] of [
      ["Suite", 9000],
      ["Deluxe", 3500],
      ["Standard", 5000],
    ] as const) {
      await ctx.app.inject({
        method: "POST",
        url: `/listings/${listingId}/hotel-details/rooms`,
        headers: { cookie: f.ownerCookie },
        payload: { name, ratePerNight: rate, quantityAvailable: 2 },
      });
    }

    expect(await priceOf(ctx, f, listingId)).toEqual({ priceFrom: 3500, priceUnit: "per_night" });
  });

  it("moves a Hotel's price down when the owner adds a cheaper room", async () => {
    const f = await baseFixture(ctx);
    const categoryId = await makeCategory(ctx, "hotel", true);
    const listingId = await makeListing(ctx, f, categoryId, "Grand Palace");
    await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/hotel-details`,
      headers: { cookie: f.ownerCookie },
      payload: { starRating: 4 },
    });
    await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/hotel-details/rooms`,
      headers: { cookie: f.ownerCookie },
      payload: { name: "Deluxe", ratePerNight: 5000, quantityAvailable: 1 },
    });
    expect((await priceOf(ctx, f, listingId)).priceFrom).toBe(5000);

    await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/hotel-details/rooms`,
      headers: { cookie: f.ownerCookie },
      payload: { name: "Budget", ratePerNight: 1200, quantityAvailable: 1 },
    });

    // A card advertising ₹5,000 when a ₹1,200 room exists is a promise the
    // listing can't keep.
    expect((await priceOf(ctx, f, listingId)).priceFrom).toBe(1200);
  });

  it("moves a Hotel's price back up when the cheapest room is deleted", async () => {
    const f = await baseFixture(ctx);
    const categoryId = await makeCategory(ctx, "hotel", true);
    const listingId = await makeListing(ctx, f, categoryId, "Grand Palace");
    await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/hotel-details`,
      headers: { cookie: f.ownerCookie },
      payload: { starRating: 4 },
    });
    const cheap = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/hotel-details/rooms`,
      headers: { cookie: f.ownerCookie },
      payload: { name: "Budget", ratePerNight: 1200, quantityAvailable: 1 },
    });
    await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/hotel-details/rooms`,
      headers: { cookie: f.ownerCookie },
      payload: { name: "Deluxe", ratePerNight: 5000, quantityAvailable: 1 },
    });
    expect((await priceOf(ctx, f, listingId)).priceFrom).toBe(1200);

    await ctx.app.inject({
      method: "DELETE",
      url: `/listings/${listingId}/hotel-details/rooms/${cheap.json().id}`,
      headers: { cookie: f.ownerCookie },
    });
    expect((await priceOf(ctx, f, listingId)).priceFrom).toBe(5000);
  });

  it("moves a Hotel's price when a room's rate is edited", async () => {
    const f = await baseFixture(ctx);
    const categoryId = await makeCategory(ctx, "hotel", true);
    const listingId = await makeListing(ctx, f, categoryId, "Grand Palace");
    await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/hotel-details`,
      headers: { cookie: f.ownerCookie },
      payload: { starRating: 4 },
    });
    const room = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/hotel-details/rooms`,
      headers: { cookie: f.ownerCookie },
      payload: { name: "Deluxe", ratePerNight: 5000, quantityAvailable: 1 },
    });
    await ctx.app.inject({
      method: "PATCH",
      url: `/listings/${listingId}/hotel-details/rooms/${room.json().id}`,
      headers: { cookie: f.ownerCookie },
      payload: { name: "Deluxe", ratePerNight: 2500, quantityAvailable: 1 },
    });
    expect((await priceOf(ctx, f, listingId)).priceFrom).toBe(2500);
  });

  // The unit goes with the amount: a Hotel that never had a room and one whose
  // last room was just deleted must report the same thing.
  it("leaves a Hotel with no rooms priceless, with no dangling unit", async () => {
    const f = await baseFixture(ctx);
    const categoryId = await makeCategory(ctx, "hotel", true);
    const listingId = await makeListing(ctx, f, categoryId, "Grand Palace");
    await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/hotel-details`,
      headers: { cookie: f.ownerCookie },
      payload: { starRating: 4 },
    });
    expect(await priceOf(ctx, f, listingId)).toEqual({ priceFrom: null, priceUnit: null });
  });

  it("clears the unit too when a Hotel's last room is deleted", async () => {
    const f = await baseFixture(ctx);
    const categoryId = await makeCategory(ctx, "hotel", true);
    const listingId = await makeListing(ctx, f, categoryId, "Grand Palace");
    await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/hotel-details`,
      headers: { cookie: f.ownerCookie },
      payload: { starRating: 4 },
    });
    const only = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/hotel-details/rooms`,
      headers: { cookie: f.ownerCookie },
      payload: { name: "Deluxe", ratePerNight: 5000, quantityAvailable: 1 },
    });
    expect(await priceOf(ctx, f, listingId)).toEqual({ priceFrom: 5000, priceUnit: "per_night" });

    await ctx.app.inject({
      method: "DELETE",
      url: `/listings/${listingId}/hotel-details/rooms/${only.json().id}`,
      headers: { cookie: f.ownerCookie },
    });
    // Must match a Hotel that never had a room at all — not 'per_night' against
    // a null price.
    expect(await priceOf(ctx, f, listingId)).toEqual({ priceFrom: null, priceUnit: null });
  });

  it("derives a Restaurant's price from its average cost for two", async () => {
    const f = await baseFixture(ctx);
    const categoryId = await makeCategory(ctx, "restaurant", true);
    const listingId = await makeListing(ctx, f, categoryId, "Sizzle");
    await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/restaurant-details`,
      headers: { cookie: f.ownerCookie },
      payload: { avgCostForTwo: 800 },
    });
    expect(await priceOf(ctx, f, listingId)).toEqual({ priceFrom: 800, priceUnit: "for_two" });
  });

  it("derives an Activity's price per person (FR58)", async () => {
    const f = await baseFixture(ctx);
    const categoryId = await makeCategory(ctx, "activity", true);
    const listingId = await makeListing(ctx, f, categoryId, "Trekking");
    await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/activity-details`,
      headers: { cookie: f.ownerCookie },
      payload: { difficultyLevel: "Moderate", pricePerPerson: 450 },
    });
    expect(await priceOf(ctx, f, listingId)).toEqual({ priceFrom: 450, priceUnit: "per_person" });
  });

  it("derives a Tour's price per person (FR58)", async () => {
    const f = await baseFixture(ctx);
    const categoryId = await makeCategory(ctx, "tour", true);
    const listingId = await makeListing(ctx, f, categoryId, "Hill Circuit");
    await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/tour-details`,
      headers: { cookie: f.ownerCookie },
      payload: { tourType: "Sightseeing", pricePerPerson: 1500 },
    });
    expect(await priceOf(ctx, f, listingId)).toEqual({ priceFrom: 1500, priceUnit: "per_person" });
  });

  it("refuses a price written directly onto a Listing whose category derives one", async () => {
    const f = await baseFixture(ctx);
    const categoryId = await makeCategory(ctx, "hotel", true);
    const res = await ctx.app.inject({
      method: "POST",
      url: "/listings",
      headers: { cookie: f.ownerCookie },
      payload: { businessId: f.businessId, categoryId, name: "Grand Palace", priceFrom: 999 },
    });
    // Silently ignoring it would let an owner believe they'd set a price that
    // the next room edit was always going to overwrite.
    expect(res.statusCode).toBe(400);
  });

  it("recomputes from a direct hotel_rooms write that bypasses the service layer", async () => {
    const f = await baseFixture(ctx);
    const categoryId = await makeCategory(ctx, "hotel", true);
    const listingId = await makeListing(ctx, f, categoryId, "Grand Palace");
    await ctx.app.inject({
      method: "PUT",
      url: `/listings/${listingId}/hotel-details`,
      headers: { cookie: f.ownerCookie },
      payload: { starRating: 4 },
    });
    await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/hotel-details/rooms`,
      headers: { cookie: f.ownerCookie },
      payload: { name: "Deluxe", ratePerNight: 5000, quantityAvailable: 1 },
    });

    // The trigger backstop: the service layer is not the only thing that can
    // write a room, and the cache has to survive something that isn't it.
    await ctx.db.query(`INSERT INTO hotel_rooms (listing_id, name, rate_per_night, quantity_available) VALUES ($1, $2, $3, $4)`, [
      listingId,
      "Smuggled",
      99,
      1,
    ]);
    expect((await priceOf(ctx, f, listingId)).priceFrom).toBe(99);
  });
});

describe("Listing price — written directly for the categories with no detail table", () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });
  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("lets an owner set a price on a Travel Listing (ADR 0003: no detail table)", async () => {
    const f = await baseFixture(ctx);
    const categoryId = await makeCategory(ctx, "travel", false);
    const listingId = await makeListing(ctx, f, categoryId, "Hill Cabs", { priceFrom: 1500, priceUnit: "from" });
    expect(await priceOf(ctx, f, listingId)).toEqual({ priceFrom: 1500, priceUnit: "from" });
  });

  it("lets an owner change a directly-set price", async () => {
    const f = await baseFixture(ctx);
    const categoryId = await makeCategory(ctx, "shopping", false);
    const listingId = await makeListing(ctx, f, categoryId, "Spice Store", { priceFrom: 200, priceUnit: "from" });
    await ctx.app.inject({
      method: "PATCH",
      url: `/listings/${listingId}`,
      headers: { cookie: f.ownerCookie },
      payload: { businessId: f.businessId, categoryId, name: "Spice Store", priceFrom: 350, priceUnit: "from" },
    });
    expect((await priceOf(ctx, f, listingId)).priceFrom).toBe(350);
  });

  it("allows a Listing with no price at all", async () => {
    const f = await baseFixture(ctx);
    const categoryId = await makeCategory(ctx, "other-services", false);
    const listingId = await makeListing(ctx, f, categoryId, "Repairs");
    expect(await priceOf(ctx, f, listingId)).toEqual({ priceFrom: null, priceUnit: null });
  });

  it("rejects a negative price", async () => {
    const f = await baseFixture(ctx);
    const categoryId = await makeCategory(ctx, "travel", false);
    const res = await ctx.app.inject({
      method: "POST",
      url: "/listings",
      headers: { cookie: f.ownerCookie },
      payload: { businessId: f.businessId, categoryId, name: "Hill Cabs", priceFrom: -5, priceUnit: "from" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an unknown price unit", async () => {
    const f = await baseFixture(ctx);
    const categoryId = await makeCategory(ctx, "travel", false);
    const res = await ctx.app.inject({
      method: "POST",
      url: "/listings",
      headers: { cookie: f.ownerCookie },
      payload: { businessId: f.businessId, categoryId, name: "Hill Cabs", priceFrom: 100, priceUnit: "per_fortnight" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("Listing search — price filtering", () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });
  afterEach(async () => {
    await closeTestApp(ctx);
  });

  async function threePricedListings(ctx: TestContext, f: Fixture) {
    const categoryId = await makeCategory(ctx, "travel", false);
    const cheap = await makeListing(ctx, f, categoryId, "Cheap Cabs", { priceFrom: 500, priceUnit: "from" });
    const mid = await makeListing(ctx, f, categoryId, "Mid Cabs", { priceFrom: 2500, priceUnit: "from" });
    const dear = await makeListing(ctx, f, categoryId, "Dear Cabs", { priceFrom: 9000, priceUnit: "from" });
    const priceless = await makeListing(ctx, f, categoryId, "Mystery Cabs");
    for (const id of [cheap, mid, dear, priceless]) await approve(ctx, f, id);
    return { cheap, mid, dear, priceless };
  }

  async function names(ctx: TestContext, query: string): Promise<string[]> {
    const res = await ctx.app.inject({ method: "GET", url: `/listings?${query}` });
    return res
      .json()
      .items.map((i: { name: string }) => i.name)
      .sort();
  }

  it("filters by price band — the Phase 4 regression this phase exists to fix", async () => {
    const f = await baseFixture(ctx);
    await threePricedListings(ctx, f);
    await ctx.db.query(`INSERT INTO price_bands (label, min_amount, max_amount) VALUES ('Budget', 0, 1000), ('Premium', 5000, NULL)`);

    // Before Phase 10 this returned all four: the parameter was validated
    // against the band table and then never used in the query.
    expect(await names(ctx, "priceBand=Budget")).toEqual(["Cheap Cabs"]);
    expect(await names(ctx, "priceBand=Premium")).toEqual(["Dear Cabs"]);
  });

  it("treats a band with no upper bound as open-ended", async () => {
    const f = await baseFixture(ctx);
    await threePricedListings(ctx, f);
    await ctx.db.query(`INSERT INTO price_bands (label, min_amount, max_amount) VALUES ('Anything', 0, NULL)`);
    expect(await names(ctx, "priceBand=Anything")).toEqual(["Cheap Cabs", "Dear Cabs", "Mid Cabs"]);
  });

  it("filters by an explicit min/max range (FR21, FR28's slider)", async () => {
    const f = await baseFixture(ctx);
    await threePricedListings(ctx, f);
    expect(await names(ctx, "minPrice=1000&maxPrice=5000")).toEqual(["Mid Cabs"]);
    expect(await names(ctx, "minPrice=1000")).toEqual(["Dear Cabs", "Mid Cabs"]);
    expect(await names(ctx, "maxPrice=1000")).toEqual(["Cheap Cabs"]);
  });

  it("excludes priceless Listings when filtering by price but keeps them otherwise", async () => {
    const f = await baseFixture(ctx);
    await threePricedListings(ctx, f);
    // A Listing with no price can't honestly satisfy "under ₹2,000"...
    expect(await names(ctx, "maxPrice=2000")).toEqual(["Cheap Cabs"]);
    // ...but it must not vanish from an unfiltered directory.
    expect(await names(ctx, "")).toEqual(["Cheap Cabs", "Dear Cabs", "Mid Cabs", "Mystery Cabs"]);
  });

  it("still returns nothing for a band that does not exist", async () => {
    const f = await baseFixture(ctx);
    await threePricedListings(ctx, f);
    expect(await names(ctx, "priceBand=Nonexistent")).toEqual([]);
  });
});
