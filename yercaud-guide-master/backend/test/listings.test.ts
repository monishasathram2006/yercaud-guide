import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

async function seedCategory(ctx: TestContext, slug = "hotel", hasDetailTable = true): Promise<string> {
  const { rows } = await ctx.db.query<{ id: string }>(
    `INSERT INTO categories (name, slug, has_detail_table) VALUES ($1, $2, $3) RETURNING id`,
    [slug, slug, hasDetailTable],
  );
  return rows[0].id;
}

async function seedLocation(ctx: TestContext, name = "Near Lake"): Promise<string> {
  const { rows } = await ctx.db.query<{ id: string }>(
    `INSERT INTO locations (name, slug) VALUES ($1, $2) RETURNING id`,
    [name, name.toLowerCase().replace(/\s+/g, "-")],
  );
  return rows[0].id;
}

async function createApprovedBusiness(
  ctx: TestContext,
  ownerCookie: string,
  adminCookie: string,
  name = "Lake View Inn",
): Promise<string> {
  const create = await ctx.app.inject({
    method: "POST",
    url: "/businesses",
    headers: { cookie: ownerCookie },
    payload: { name },
  });
  const businessId = create.json().id;
  await ctx.app.inject({
    method: "POST",
    url: `/businesses/${businessId}/approve`,
    headers: { cookie: adminCookie },
  });
  return businessId;
}

describe("Listings (base CRUD, lifecycle, search)", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("rejects a create from an anonymous caller with 401", async () => {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/listings",
      payload: {
        businessId: "00000000-0000-0000-0000-000000000000",
        categoryId: "00000000-0000-0000-0000-000000000000",
        name: "x",
      },
    });
    expect(response.statusCode).toBe(401);
  });

  it("blocks a signed-in user with no roles from creating a Listing with 403", async () => {
    const { cookie } = await registerAndGetCookie(ctx, "plain@example.com");
    const categoryId = await seedCategory(ctx);
    const response = await ctx.app.inject({
      method: "POST",
      url: "/listings",
      headers: { cookie },
      payload: { businessId: "00000000-0000-0000-0000-000000000000", categoryId, name: "x" },
    });
    expect(response.statusCode).toBe(403);
  });

  it("lets a Business Owner create a Listing under their own Business, starting pending", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner@example.com");
    const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
    const categoryId = await seedCategory(ctx);

    const response = await ctx.app.inject({
      method: "POST",
      url: "/listings",
      headers: { cookie: ownerCookie },
      payload: { businessId, categoryId, name: "Lakeside Suite" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.status).toBe("pending");
    expect(body.businessId).toBe(businessId);
    expect(body.slug).toBe("lakeside-suite");
  });

  it("blocks a Business Owner from creating a Listing under someone else's Business with 403", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin2@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerACookie } = await registerAndGetCookie(ctx, "ownerA@example.com");
    const { cookie: ownerBCookie } = await registerAndGetCookie(ctx, "ownerB@example.com");
    const businessAId = await createApprovedBusiness(ctx, ownerACookie, adminCookie, "A's Business");
    const categoryId = await seedCategory(ctx);

    const response = await ctx.app.inject({
      method: "POST",
      url: "/listings",
      headers: { cookie: ownerBCookie },
      payload: { businessId: businessAId, categoryId, name: "Sneaky Listing" },
    });
    expect(response.statusCode).toBe(403);
  });

  it("lets a Super Admin create a Listing under any Business", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin3@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner3@example.com");
    const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
    const categoryId = await seedCategory(ctx);

    const response = await ctx.app.inject({
      method: "POST",
      url: "/listings",
      headers: { cookie: adminCookie },
      payload: { businessId, categoryId, name: "Admin Created" },
    });
    expect(response.statusCode).toBe(201);
  });

  it("hides a pending Listing from an anonymous caller with 404", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin4@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner4@example.com");
    const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
    const categoryId = await seedCategory(ctx);
    const create = await ctx.app.inject({
      method: "POST",
      url: "/listings",
      headers: { cookie: ownerCookie },
      payload: { businessId, categoryId, name: "Hidden Listing" },
    });
    const listingId = create.json().id;

    const anon = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}` });
    expect(anon.statusCode).toBe(404);

    const owner = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}`, headers: { cookie: ownerCookie } });
    expect(owner.statusCode).toBe(200);

    const admin = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}`, headers: { cookie: adminCookie } });
    expect(admin.statusCode).toBe(200);
  });

  it("shows an approved Listing to anonymous callers", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin5@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner5@example.com");
    const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
    const categoryId = await seedCategory(ctx);
    const create = await ctx.app.inject({
      method: "POST",
      url: "/listings",
      headers: { cookie: ownerCookie },
      payload: { businessId, categoryId, name: "Public Listing" },
    });
    const listingId = create.json().id;
    await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/approve`, headers: { cookie: adminCookie } });

    const anon = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}` });
    expect(anon.statusCode).toBe(200);
    expect(anon.json().status).toBe("approved");
  });

  it("lets the owner edit an approved Listing immediately, with no status change (ADR 0005)", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin6@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner6@example.com");
    const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
    const categoryId = await seedCategory(ctx);
    const create = await ctx.app.inject({
      method: "POST",
      url: "/listings",
      headers: { cookie: ownerCookie },
      payload: { businessId, categoryId, name: "Editable Listing" },
    });
    const listingId = create.json().id;
    await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/approve`, headers: { cookie: adminCookie } });

    const edit = await ctx.app.inject({
      method: "PATCH",
      url: `/listings/${listingId}`,
      headers: { cookie: ownerCookie },
      payload: { businessId, categoryId, name: "Renamed Listing", description: "Now with a description" },
    });
    expect(edit.statusCode).toBe(200);
    expect(edit.json().name).toBe("Renamed Listing");
    expect(edit.json().status).toBe("approved");
  });

  it("blocks a non-owner, non-admin from editing a Listing with 403", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin7@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner7@example.com");
    const { cookie: strangerCookie } = await registerAndGetCookie(ctx, "stranger7@example.com");
    const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
    const categoryId = await seedCategory(ctx);
    const create = await ctx.app.inject({
      method: "POST",
      url: "/listings",
      headers: { cookie: ownerCookie },
      payload: { businessId, categoryId, name: "Protected Listing" },
    });
    const listingId = create.json().id;

    const response = await ctx.app.inject({
      method: "PATCH",
      url: `/listings/${listingId}`,
      headers: { cookie: strangerCookie },
      payload: { businessId, categoryId, name: "Hijacked" },
    });
    expect(response.statusCode).toBe(403);
  });

  it("blocks reassigning categoryId on an existing Listing with 400", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin17@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner17@example.com");
    const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
    const categoryId = await seedCategory(ctx, "hotel");
    const otherCategoryId = await seedCategory(ctx, "restaurant");
    const create = await ctx.app.inject({
      method: "POST",
      url: "/listings",
      headers: { cookie: ownerCookie },
      payload: { businessId, categoryId, name: "Immutable Category" },
    });
    const listingId = create.json().id;

    const response = await ctx.app.inject({
      method: "PATCH",
      url: `/listings/${listingId}`,
      headers: { cookie: ownerCookie },
      payload: { businessId, categoryId: otherCategoryId, name: "Immutable Category" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("blocks moving a Listing onto a Business the caller doesn't own with 403", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin18@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner18@example.com");
    const { cookie: otherOwnerCookie } = await registerAndGetCookie(ctx, "otherOwner18@example.com");
    const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie, "Owner's Business");
    const otherBusinessId = await createApprovedBusiness(ctx, otherOwnerCookie, adminCookie, "Other's Business");
    const categoryId = await seedCategory(ctx);
    const create = await ctx.app.inject({
      method: "POST",
      url: "/listings",
      headers: { cookie: ownerCookie },
      payload: { businessId, categoryId, name: "Immovable Listing" },
    });
    const listingId = create.json().id;

    const response = await ctx.app.inject({
      method: "PATCH",
      url: `/listings/${listingId}`,
      headers: { cookie: ownerCookie },
      payload: { businessId: otherBusinessId, categoryId, name: "Immovable Listing" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.statusCode).toBe(403);
  });

  it("rejects a pending Listing with a reason, then allows re-approval which clears it", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin8@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner8@example.com");
    const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
    const categoryId = await seedCategory(ctx);
    const create = await ctx.app.inject({
      method: "POST",
      url: "/listings",
      headers: { cookie: ownerCookie },
      payload: { businessId, categoryId, name: "Rejected Listing" },
    });
    const listingId = create.json().id;

    const reject = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/reject`,
      headers: { cookie: adminCookie },
      payload: { reason: "Missing photos" },
    });
    expect(reject.statusCode).toBe(200);
    expect(reject.json().rejectionReason).toBe("Missing photos");

    const approve = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/approve`,
      headers: { cookie: adminCookie },
    });
    expect(approve.json().status).toBe("approved");
    expect(approve.json().rejectionReason).toBeNull();
  });

  it("keeps the rejection reason when a rejected Listing is archived, not cleared (ADR 0010)", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin9@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner9@example.com");
    const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
    const categoryId = await seedCategory(ctx);
    const create = await ctx.app.inject({
      method: "POST",
      url: "/listings",
      headers: { cookie: ownerCookie },
      payload: { businessId, categoryId, name: "Rejected Then Archived" },
    });
    const listingId = create.json().id;
    await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/reject`,
      headers: { cookie: adminCookie },
      payload: { reason: "Duplicate listing" },
    });

    const archive = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/archive`,
      headers: { cookie: adminCookie },
    });
    expect(archive.statusCode).toBe(200);
    expect(archive.json().status).toBe("archived");
    expect(archive.json().rejectionReason).toBe("Duplicate listing");
  });

  it("rejects an invalid status transition with 409", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin10@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner10@example.com");
    const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
    const categoryId = await seedCategory(ctx);
    const create = await ctx.app.inject({
      method: "POST",
      url: "/listings",
      headers: { cookie: ownerCookie },
      payload: { businessId, categoryId, name: "Bad Transition" },
    });
    const listingId = create.json().id;
    await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/archive`, headers: { cookie: adminCookie } });

    const approve = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/approve`,
      headers: { cookie: adminCookie },
    });
    expect(approve.statusCode).toBe(409);
  });

  describe("search", () => {
    async function seedApprovedListing(
      ctx: TestContext,
      ownerCookie: string,
      adminCookie: string,
      businessId: string,
      categoryId: string,
      name: string,
      locationId?: string,
    ): Promise<string> {
      const create = await ctx.app.inject({
        method: "POST",
        url: "/listings",
        headers: { cookie: ownerCookie },
        payload: { businessId, categoryId, name, locationId, description: `${name} description` },
      });
      const listingId = create.json().id;
      await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/approve`, headers: { cookie: adminCookie } });
      return listingId;
    }

    it("only shows approved Listings to anonymous callers, and full-text-searches name/description", async () => {
      const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin11@example.com");
      await grantRole(ctx.db, adminId, "Super Admin");
      const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner11@example.com");
      const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
      const categoryId = await seedCategory(ctx);
      await seedApprovedListing(ctx, ownerCookie, adminCookie, businessId, categoryId, "Sunset Villa");
      await ctx.app.inject({
        method: "POST",
        url: "/listings",
        headers: { cookie: ownerCookie },
        payload: { businessId, categoryId, name: "Still Pending Villa" },
      });

      const list = await ctx.app.inject({ method: "GET", url: "/listings" });
      expect(list.json().total).toBe(1);
      expect(list.json().items[0].name).toBe("Sunset Villa");

      const search = await ctx.app.inject({ method: "GET", url: "/listings?q=Sunset" });
      expect(search.json().total).toBe(1);

      const miss = await ctx.app.inject({ method: "GET", url: "/listings?q=Nonexistent" });
      expect(miss.json().total).toBe(0);
    });

    it("lets an owner see their own pending Listings in search results, but not another owner's", async () => {
      const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin12@example.com");
      await grantRole(ctx.db, adminId, "Super Admin");
      const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner12@example.com");
      const { cookie: strangerCookie } = await registerAndGetCookie(ctx, "stranger12@example.com");
      const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
      const categoryId = await seedCategory(ctx);
      await ctx.app.inject({
        method: "POST",
        url: "/listings",
        headers: { cookie: ownerCookie },
        payload: { businessId, categoryId, name: "Owner's Pending" },
      });

      const ownList = await ctx.app.inject({ method: "GET", url: "/listings", headers: { cookie: ownerCookie } });
      expect(ownList.json().total).toBe(1);

      const strangerList = await ctx.app.inject({ method: "GET", url: "/listings", headers: { cookie: strangerCookie } });
      expect(strangerList.json().total).toBe(0);
    });

    it("does not let one Business Owner see another Business Owner's pending Listing (both hold Listings:view)", async () => {
      const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin19@example.com");
      await grantRole(ctx.db, adminId, "Super Admin");
      const { cookie: ownerACookie } = await registerAndGetCookie(ctx, "ownerA19@example.com");
      const { cookie: ownerBCookie } = await registerAndGetCookie(ctx, "ownerB19@example.com");
      const businessAId = await createApprovedBusiness(ctx, ownerACookie, adminCookie, "A's Business");
      // Owner B must also actually hold the Business Owner role (and thus Listings:view)
      // for this regression test to mean anything — a roleless stranger wouldn't
      // have exposed the bug this guards against.
      await createApprovedBusiness(ctx, ownerBCookie, adminCookie, "B's Business");
      const categoryId = await seedCategory(ctx);
      const create = await ctx.app.inject({
        method: "POST",
        url: "/listings",
        headers: { cookie: ownerACookie },
        payload: { businessId: businessAId, categoryId, name: "A's Pending Listing" },
      });
      const listingId = create.json().id;

      const searchAsB = await ctx.app.inject({ method: "GET", url: "/listings", headers: { cookie: ownerBCookie } });
      expect(searchAsB.json().total).toBe(0);

      const getAsB = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}`, headers: { cookie: ownerBCookie } });
      expect(getAsB.statusCode).toBe(404);
    });

    it("filters by category slug and location slug", async () => {
      const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin13@example.com");
      await grantRole(ctx.db, adminId, "Super Admin");
      const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner13@example.com");
      const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
      const hotelCategoryId = await seedCategory(ctx, "hotel", true);
      const restaurantCategoryId = await seedCategory(ctx, "restaurant", true);
      const locationId = await seedLocation(ctx, "Near Lake");
      await seedApprovedListing(ctx, ownerCookie, adminCookie, businessId, hotelCategoryId, "Lake Hotel", locationId);
      await seedApprovedListing(ctx, ownerCookie, adminCookie, businessId, restaurantCategoryId, "Hilltop Diner");

      const byCategory = await ctx.app.inject({ method: "GET", url: "/listings?category=hotel" });
      expect(byCategory.json().total).toBe(1);
      expect(byCategory.json().items[0].name).toBe("Lake Hotel");

      const byLocation = await ctx.app.inject({ method: "GET", url: "/listings?location=near-lake" });
      expect(byLocation.json().total).toBe(1);

      const unknownCategory = await ctx.app.inject({ method: "GET", url: "/listings?category=nonexistent" });
      expect(unknownCategory.json().total).toBe(0);
    });

    it("filters by businessId, still applying visibility rules", async () => {
      const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin20@example.com");
      await grantRole(ctx.db, adminId, "Super Admin");
      const { cookie: ownerACookie } = await registerAndGetCookie(ctx, "ownerA20@example.com");
      const { cookie: ownerBCookie } = await registerAndGetCookie(ctx, "ownerB20@example.com");
      const businessAId = await createApprovedBusiness(ctx, ownerACookie, adminCookie, "A's Business");
      const businessBId = await createApprovedBusiness(ctx, ownerBCookie, adminCookie, "B's Business");
      const categoryId = await seedCategory(ctx);
      await seedApprovedListing(ctx, ownerACookie, adminCookie, businessAId, categoryId, "A's Approved");
      await ctx.app.inject({
        method: "POST",
        url: "/listings",
        headers: { cookie: ownerACookie },
        payload: { businessId: businessAId, categoryId, name: "A's Pending" },
      });
      await seedApprovedListing(ctx, ownerBCookie, adminCookie, businessBId, categoryId, "B's Approved");

      // The owner scoping to their own Business sees all of it, and none of B's.
      const ownScoped = await ctx.app.inject({
        method: "GET",
        url: `/listings?businessId=${businessAId}`,
        headers: { cookie: ownerACookie },
      });
      expect(ownScoped.json().total).toBe(2);

      // A stranger scoping to A's Business sees only its approved Listing.
      const strangerScoped = await ctx.app.inject({
        method: "GET",
        url: `/listings?businessId=${businessAId}`,
        headers: { cookie: ownerBCookie },
      });
      expect(strangerScoped.json().total).toBe(1);
      expect(strangerScoped.json().items[0].name).toBe("A's Approved");
    });

    it("filters by minRating using approved Reviews, and computes averageRating", async () => {
      const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin14@example.com");
      await grantRole(ctx.db, adminId, "Super Admin");
      const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner14@example.com");
      const { userId: reviewerId } = await registerAndGetCookie(ctx, "reviewer14@example.com");
      const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
      const categoryId = await seedCategory(ctx);
      const listingId = await seedApprovedListing(ctx, ownerCookie, adminCookie, businessId, categoryId, "Rated Listing");
      await ctx.db.query(
        `INSERT INTO reviews (listing_id, user_id, rating, text, status) VALUES ($1, $2, 5, 'Great!', 'approved')`,
        [listingId, reviewerId],
      );

      const list = await ctx.app.inject({ method: "GET", url: "/listings" });
      expect(list.json().items[0].averageRating).toBe(5);

      const highBar = await ctx.app.inject({ method: "GET", url: "/listings?minRating=4" });
      expect(highBar.json().total).toBe(1);

      const tooHigh = await ctx.app.inject({ method: "GET", url: "/listings?minRating=5.1" });
      expect(tooHigh.json().total).toBe(0);
    });

    // Price filtering (band and min/max range) lives in listings.price.test.ts,
    // alongside the derivation it depends on. This file used to assert that
    // priceBand was "a validated no-op filter" — it created a Listing with no
    // price and expected the Budget band to return it. That test passed for as
    // long as the filter was broken, and this is what replaced it.

    it("paginates results", async () => {
      const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin16@example.com");
      await grantRole(ctx.db, adminId, "Super Admin");
      const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner16@example.com");
      const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
      const categoryId = await seedCategory(ctx);
      for (let i = 0; i < 3; i += 1) {
        await seedApprovedListing(ctx, ownerCookie, adminCookie, businessId, categoryId, `Listing ${i}`);
      }

      const page1 = await ctx.app.inject({ method: "GET", url: "/listings?pageSize=2&page=1" });
      expect(page1.json().items).toHaveLength(2);
      expect(page1.json().total).toBe(3);

      const page2 = await ctx.app.inject({ method: "GET", url: "/listings?pageSize=2&page=2" });
      expect(page2.json().items).toHaveLength(1);
    });
  });

  // FR189. og_image/twitter_card have been columns on `listings` since the
  // initial schema but were read and written by nothing until Phase 9.
  describe("SEO/meta fields", () => {
    async function setup(suffix: string) {
      const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, `admin-seo-${suffix}@example.com`);
      await grantRole(ctx.db, adminId, "Super Admin");
      const { cookie: ownerCookie } = await registerAndGetCookie(ctx, `owner-seo-${suffix}@example.com`);
      const businessId = await createApprovedBusiness(ctx, ownerCookie, adminCookie);
      const categoryId = await seedCategory(ctx);
      return { adminCookie, ownerCookie, businessId, categoryId };
    }

    it("lets a Business Owner set the OG fields on their own Listing and reads them back", async () => {
      const { ownerCookie, businessId, categoryId } = await setup("1");
      const create = await ctx.app.inject({
        method: "POST",
        url: "/listings",
        headers: { cookie: ownerCookie },
        payload: {
          businessId,
          categoryId,
          name: "Lake View Inn",
          seoTitle: "Lake View Inn | Yercaud",
          seoDescription: "A quiet inn by the lake.",
          ogImage: "https://cdn.example.com/lake-view.jpg",
          twitterCard: "summary_large_image",
        },
      });
      expect(create.statusCode).toBe(201);
      expect(create.json()).toMatchObject({
        seoTitle: "Lake View Inn | Yercaud",
        seoDescription: "A quiet inn by the lake.",
        ogImage: "https://cdn.example.com/lake-view.jpg",
        twitterCard: "summary_large_image",
      });

      const read = await ctx.app.inject({
        method: "GET",
        url: `/listings/${create.json().id}`,
        headers: { cookie: ownerCookie },
      });
      expect(read.json()).toMatchObject({
        ogImage: "https://cdn.example.com/lake-view.jpg",
        twitterCard: "summary_large_image",
      });
    });

    it("defaults both OG fields to null when not supplied", async () => {
      const { ownerCookie, businessId, categoryId } = await setup("2");
      const create = await ctx.app.inject({
        method: "POST",
        url: "/listings",
        headers: { cookie: ownerCookie },
        payload: { businessId, categoryId, name: "No Share Card" },
      });
      expect(create.json().ogImage).toBeNull();
      expect(create.json().twitterCard).toBeNull();
    });

    it("updates the OG fields through the existing PATCH", async () => {
      const { ownerCookie, businessId, categoryId } = await setup("3");
      const create = await ctx.app.inject({
        method: "POST",
        url: "/listings",
        headers: { cookie: ownerCookie },
        payload: { businessId, categoryId, name: "Lake View Inn", twitterCard: "summary" },
      });

      const update = await ctx.app.inject({
        method: "PATCH",
        url: `/listings/${create.json().id}`,
        headers: { cookie: ownerCookie },
        payload: {
          businessId,
          categoryId,
          name: "Lake View Inn",
          ogImage: "https://cdn.example.com/new.jpg",
          twitterCard: "summary_large_image",
        },
      });
      expect(update.statusCode).toBe(200);
      expect(update.json()).toMatchObject({
        ogImage: "https://cdn.example.com/new.jpg",
        twitterCard: "summary_large_image",
      });
    });

    it("clears an omitted OG field on update, exactly as it already does for seoTitle", async () => {
      const { ownerCookie, businessId, categoryId } = await setup("4");
      const create = await ctx.app.inject({
        method: "POST",
        url: "/listings",
        headers: { cookie: ownerCookie },
        payload: {
          businessId,
          categoryId,
          name: "Lake View Inn",
          seoTitle: "Lake View Inn | Yercaud",
          ogImage: "https://cdn.example.com/lake-view.jpg",
          twitterCard: "summary",
        },
      });

      // PATCH on a Listing is a whole-record replace despite the verb — every
      // omitted optional field is nulled. The OG fields follow that existing
      // convention rather than inventing a second one.
      const update = await ctx.app.inject({
        method: "PATCH",
        url: `/listings/${create.json().id}`,
        headers: { cookie: ownerCookie },
        payload: { businessId, categoryId, name: "Lake View Inn" },
      });
      expect(update.json().seoTitle).toBeNull();
      expect(update.json().ogImage).toBeNull();
      expect(update.json().twitterCard).toBeNull();
    });

    it("rejects a Twitter Card type no platform would honour", async () => {
      const { ownerCookie, businessId, categoryId } = await setup("5");
      const response = await ctx.app.inject({
        method: "POST",
        url: "/listings",
        headers: { cookie: ownerCookie },
        payload: { businessId, categoryId, name: "Bad Card", twitterCard: "gigantic_banner" },
      });
      expect(response.statusCode).toBe(400);
    });

    it("accepts each of the four supported Twitter Card types", async () => {
      const { ownerCookie, businessId, categoryId } = await setup("6");
      for (const twitterCard of ["summary", "summary_large_image", "app", "player"]) {
        const response = await ctx.app.inject({
          method: "POST",
          url: "/listings",
          headers: { cookie: ownerCookie },
          payload: { businessId, categoryId, name: `Card ${twitterCard}`, twitterCard },
        });
        expect(response.statusCode).toBe(201);
        expect(response.json().twitterCard).toBe(twitterCard);
      }
    });

    it("keeps the OG fields off the summary shape returned by search", async () => {
      const { adminCookie, ownerCookie, businessId, categoryId } = await setup("7");
      const create = await ctx.app.inject({
        method: "POST",
        url: "/listings",
        headers: { cookie: ownerCookie },
        payload: { businessId, categoryId, name: "Lake View Inn", ogImage: "https://cdn.example.com/x.jpg" },
      });
      await ctx.app.inject({
        method: "POST",
        url: `/listings/${create.json().id}/approve`,
        headers: { cookie: adminCookie },
      });

      const search = await ctx.app.inject({ method: "GET", url: "/listings" });
      expect(search.json().items[0]).not.toHaveProperty("ogImage");
      expect(search.json().items[0]).not.toHaveProperty("twitterCard");
    });
  });
});
