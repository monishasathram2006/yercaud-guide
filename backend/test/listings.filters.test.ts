import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

/**
 * The category-page filter sidebar (issue: "filters are not working") — Price
 * and Guest Rating already had a working GET /listings?minPrice=&minRating=
 * leg (see listings.price.test.ts and listings.test.ts). This covers the
 * three that didn't: Amenities (AND semantics), Star Rating and Property Type
 * (both Hotel-only, via hotel_details).
 */

async function seedCategory(ctx: TestContext, slug = "hotel", hasDetailTable = true): Promise<string> {
  const { rows } = await ctx.db.query<{ id: string }>(
    `INSERT INTO categories (name, slug, has_detail_table) VALUES ($1, $2, $3) RETURNING id`,
    [slug, slug, hasDetailTable],
  );
  return rows[0].id;
}

async function seedAmenity(ctx: TestContext, name: string): Promise<string> {
  const { rows } = await ctx.db.query<{ id: string }>(`INSERT INTO amenities (name) VALUES ($1) RETURNING id`, [name]);
  return rows[0].id;
}

async function seedPropertyType(ctx: TestContext, name: string): Promise<string> {
  const { rows } = await ctx.db.query<{ id: string }>(`INSERT INTO property_types (name) VALUES ($1) RETURNING id`, [name]);
  return rows[0].id;
}

async function createApprovedBusiness(ctx: TestContext, ownerCookie: string, adminCookie: string, name = "Lake Group"): Promise<string> {
  const create = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerCookie }, payload: { name } });
  const businessId = create.json().id;
  await ctx.app.inject({ method: "POST", url: `/businesses/${businessId}/approve`, headers: { cookie: adminCookie } });
  return businessId;
}

async function createListing(
  ctx: TestContext,
  ownerCookie: string,
  adminCookie: string,
  businessId: string,
  categoryId: string,
  name: string,
): Promise<string> {
  const create = await ctx.app.inject({
    method: "POST",
    url: "/listings",
    headers: { cookie: ownerCookie },
    payload: { businessId, categoryId, name },
  });
  const listingId = create.json().id;
  await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/approve`, headers: { cookie: adminCookie } });
  return listingId;
}

async function setAmenities(ctx: TestContext, ownerCookie: string, listingId: string, amenityIds: string[]) {
  await ctx.app.inject({
    method: "PUT",
    url: `/listings/${listingId}/amenities`,
    headers: { cookie: ownerCookie },
    payload: { amenityIds },
  });
}

async function setHotelDetails(
  ctx: TestContext,
  ownerCookie: string,
  listingId: string,
  body: { starRating?: number; propertyTypeId?: string },
) {
  await ctx.app.inject({
    method: "PUT",
    url: `/listings/${listingId}/hotel-details`,
    headers: { cookie: ownerCookie },
    payload: body,
  });
}

describe("Listing filters (amenities, star rating, property type)", () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });
  afterEach(async () => closeTestApp(ctx));

  it("filters by amenities with AND semantics — a Listing must carry every checked amenity", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin1@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner1@example.com");
    const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
    const categoryId = await seedCategory(ctx);
    const wifiId = await seedAmenity(ctx, "Free Wi-Fi");
    const parkingId = await seedAmenity(ctx, "Parking");

    const both = await createListing(ctx, ownerCookie, adminCookie, businessId, categoryId, "Has Both");
    await setAmenities(ctx, ownerCookie, both, [wifiId, parkingId]);
    const wifiOnly = await createListing(ctx, ownerCookie, adminCookie, businessId, categoryId, "Wi-Fi Only");
    await setAmenities(ctx, ownerCookie, wifiOnly, [wifiId]);

    const singleFilter = await ctx.app.inject({ method: "GET", url: "/listings?amenities=Free%20Wi-Fi" });
    expect(singleFilter.json().items.map((l: { name: string }) => l.name).sort()).toEqual(["Has Both", "Wi-Fi Only"]);

    const bothFilter = await ctx.app.inject({ method: "GET", url: "/listings?amenities=Free%20Wi-Fi,Parking" });
    expect(bothFilter.json().items.map((l: { name: string }) => l.name)).toEqual(["Has Both"]);
  });

  it("filters by minStarRating using hotel_details, excluding non-Hotel Listings entirely", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin2@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner2@example.com");
    const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
    const hotelId = await seedCategory(ctx, "hotel");
    const restaurantId = await seedCategory(ctx, "restaurant", false);

    const fiveStar = await createListing(ctx, ownerCookie, adminCookie, businessId, hotelId, "Five Star");
    await setHotelDetails(ctx, ownerCookie, fiveStar, { starRating: 5 });
    const threeStar = await createListing(ctx, ownerCookie, adminCookie, businessId, hotelId, "Three Star");
    await setHotelDetails(ctx, ownerCookie, threeStar, { starRating: 3 });
    // A Restaurant Listing has no hotel_details row at all.
    await createListing(ctx, ownerCookie, adminCookie, businessId, restaurantId, "Some Restaurant");

    const res = await ctx.app.inject({ method: "GET", url: "/listings?minStarRating=4" });
    expect(res.json().items.map((l: { name: string }) => l.name)).toEqual(["Five Star"]);
  });

  it("filters by propertyType, matched by name, Hotel-only", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin3@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner3@example.com");
    const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
    const hotelId = await seedCategory(ctx, "hotel");
    const resortTypeId = await seedPropertyType(ctx, "Resort");
    const villaTypeId = await seedPropertyType(ctx, "Villa");

    const resort = await createListing(ctx, ownerCookie, adminCookie, businessId, hotelId, "A Resort");
    await setHotelDetails(ctx, ownerCookie, resort, { propertyTypeId: resortTypeId });
    const villa = await createListing(ctx, ownerCookie, adminCookie, businessId, hotelId, "A Villa");
    await setHotelDetails(ctx, ownerCookie, villa, { propertyTypeId: villaTypeId });

    const res = await ctx.app.inject({ method: "GET", url: "/listings?propertyType=Resort" });
    expect(res.json().items.map((l: { name: string }) => l.name)).toEqual(["A Resort"]);
  });

  it("combines amenities, minStarRating and propertyType with the existing category filter", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin4@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner4@example.com");
    const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
    const hotelId = await seedCategory(ctx, "hotel");
    const wifiId = await seedAmenity(ctx, "Free Wi-Fi");
    const resortTypeId = await seedPropertyType(ctx, "Resort");

    const match = await createListing(ctx, ownerCookie, adminCookie, businessId, hotelId, "Matches Everything");
    await setAmenities(ctx, ownerCookie, match, [wifiId]);
    await setHotelDetails(ctx, ownerCookie, match, { starRating: 5, propertyTypeId: resortTypeId });

    const missesStarRating = await createListing(ctx, ownerCookie, adminCookie, businessId, hotelId, "Misses Star Rating");
    await setAmenities(ctx, ownerCookie, missesStarRating, [wifiId]);
    await setHotelDetails(ctx, ownerCookie, missesStarRating, { starRating: 2, propertyTypeId: resortTypeId });

    const res = await ctx.app.inject({
      method: "GET",
      url: "/listings?category=hotel&amenities=Free%20Wi-Fi&minStarRating=4&propertyType=Resort",
    });
    expect(res.json().items.map((l: { name: string }) => l.name)).toEqual(["Matches Everything"]);
  });
});
