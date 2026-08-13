import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

async function setup(ctx: TestContext, ownerEmail = "owner@example.com") {
  const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
  await grantRole(ctx.db, adminId, "Super Admin");
  const { cookie: ownerCookie } = await registerAndGetCookie(ctx, ownerEmail);
  const bizRes = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerCookie }, payload: { name: `Biz-${ownerEmail}` } });
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

describe("Enquiries", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("404s a submit against a Listing that isn't approved yet", async () => {
    const { createListing } = await setup(ctx);
    const listingId = await createListing("Pending Listing", false);
    const response = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/enquiries`,
      payload: { name: "Visitor", email: "v@example.com", message: "Hi" },
    });
    expect(response.statusCode).toBe(404);
  });

  it("lets an anonymous visitor submit an Enquiry (ADR 0001), with no user_id", async () => {
    const { createListing } = await setup(ctx);
    const listingId = await createListing("Listing");
    const response = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/enquiries`,
      payload: { name: "Anon Visitor", email: "anon@example.com", message: "Interested" },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().userId).toBeNull();
    expect(response.json().smsStatus).toBe("not_sent");
  });

  it("links a signed-in visitor's Enquiry to their account", async () => {
    const { createListing } = await setup(ctx);
    const { cookie: visitorCookie, userId: visitorId } = await registerAndGetCookie(ctx, "visitor2@example.com");
    const listingId = await createListing("Listing");
    const response = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/enquiries`,
      headers: { cookie: visitorCookie },
      payload: { name: "Visitor", email: "v2@example.com", message: "Interested" },
    });
    expect(response.json().userId).toBe(visitorId);

    const mine = await ctx.app.inject({ method: "GET", url: "/me/enquiries", headers: { cookie: visitorCookie } });
    expect(mine.json()).toHaveLength(1);
  });

  it("joins each of my Enquiries with its Listing's summary, so a profile card can render without a second fetch", async () => {
    const { createListing } = await setup(ctx);
    const { cookie: visitorCookie } = await registerAndGetCookie(ctx, "visitor3@example.com");
    const listingId = await createListing("The Grand Yercaud");
    await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/enquiries`,
      headers: { cookie: visitorCookie },
      payload: { name: "Visitor", email: "v3@example.com", message: "Interested" },
    });

    const mine = await ctx.app.inject({ method: "GET", url: "/me/enquiries", headers: { cookie: visitorCookie } });
    expect(mine.json()[0].listing.id).toBe(listingId);
    expect(mine.json()[0].listing.name).toBe("The Grand Yercaud");
    expect(mine.json()[0].listing.categoryName).toBe("Hotel");
  });

  it("scopes the inbox: owner sees only their own Listings' Enquiries, Super Admin sees all", async () => {
    const { adminCookie, ownerCookie: ownerACookie, createListing: createListingA } = await setup(ctx, "ownerA@example.com");
    const { cookie: ownerBCookie } = await registerAndGetCookie(ctx, "ownerB@example.com");
    const bizB = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerBCookie }, payload: { name: "B's Biz" } });
    await ctx.app.inject({ method: "POST", url: `/businesses/${bizB.json().id}/approve`, headers: { cookie: adminCookie } });
    const { rows: catRows } = await ctx.db.query<{ id: string }>(`SELECT id FROM categories LIMIT 1`);
    const listingB = await ctx.app.inject({
      method: "POST",
      url: "/listings",
      headers: { cookie: ownerBCookie },
      payload: { businessId: bizB.json().id, categoryId: catRows[0].id, name: "B's Listing" },
    });
    await ctx.app.inject({ method: "POST", url: `/listings/${listingB.json().id}/approve`, headers: { cookie: adminCookie } });

    const listingA = await createListingA("A's Listing");
    await ctx.app.inject({ method: "POST", url: `/listings/${listingA}/enquiries`, payload: { name: "X", email: "x@example.com", message: "Hi A" } });
    await ctx.app.inject({ method: "POST", url: `/listings/${listingB.json().id}/enquiries`, payload: { name: "Y", email: "y@example.com", message: "Hi B" } });

    const inboxA = await ctx.app.inject({ method: "GET", url: "/enquiries", headers: { cookie: ownerACookie } });
    expect(inboxA.json()).toHaveLength(1);
    expect(inboxA.json()[0].message).toBe("Hi A");

    const inboxAdmin = await ctx.app.inject({ method: "GET", url: "/enquiries", headers: { cookie: adminCookie } });
    expect(inboxAdmin.json()).toHaveLength(2);
  });

  it("filters the inbox by status", async () => {
    const { adminCookie, ownerCookie, createListing } = await setup(ctx);
    const listingId = await createListing("Listing");
    const submit = await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/enquiries`, payload: { name: "X", email: "x@example.com", message: "Hi" } });
    const enquiryId = submit.json().id;
    await ctx.app.inject({ method: "POST", url: `/enquiries/${enquiryId}/respond`, headers: { cookie: ownerCookie }, payload: { text: "We'll get back to you" } });

    const sentOnly = await ctx.app.inject({ method: "GET", url: "/enquiries?status=sent", headers: { cookie: adminCookie } });
    expect(sentOnly.json()).toHaveLength(0);

    const respondedOnly = await ctx.app.inject({ method: "GET", url: "/enquiries?status=responded", headers: { cookie: adminCookie } });
    expect(respondedOnly.json()).toHaveLength(1);
  });

  it("responding sets status to responded, but leaves an already-closed Enquiry closed", async () => {
    const { ownerCookie, createListing } = await setup(ctx);
    const listingId = await createListing("Listing");
    const submit = await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/enquiries`, payload: { name: "X", email: "x@example.com", message: "Hi" } });
    const enquiryId = submit.json().id;

    const respond = await ctx.app.inject({ method: "POST", url: `/enquiries/${enquiryId}/respond`, headers: { cookie: ownerCookie }, payload: { text: "Reply" } });
    expect(respond.json().status).toBe("responded");

    await ctx.app.inject({ method: "PATCH", url: `/enquiries/${enquiryId}/status`, headers: { cookie: ownerCookie }, payload: { status: "closed" } });
    const respondAgain = await ctx.app.inject({ method: "POST", url: `/enquiries/${enquiryId}/respond`, headers: { cookie: ownerCookie }, payload: { text: "Another reply" } });
    expect(respondAgain.json().status).toBe("closed");
    expect(respondAgain.json().ownerResponse).toBe("Another reply");
  });

  it("manually sets status via PATCH without a response", async () => {
    const { ownerCookie, createListing } = await setup(ctx);
    const listingId = await createListing("Listing");
    const submit = await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/enquiries`, payload: { name: "X", email: "x@example.com", message: "Hi" } });
    const enquiryId = submit.json().id;

    const close = await ctx.app.inject({ method: "PATCH", url: `/enquiries/${enquiryId}/status`, headers: { cookie: ownerCookie }, payload: { status: "closed" } });
    expect(close.statusCode).toBe(200);
    expect(close.json().status).toBe("closed");
  });

  it("blocks a non-owner, non-admin from responding to or changing status of an Enquiry with 403", async () => {
    const { createListing } = await setup(ctx);
    const { cookie: strangerCookie } = await registerAndGetCookie(ctx, "stranger@example.com");
    const listingId = await createListing("Listing");
    const submit = await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/enquiries`, payload: { name: "X", email: "x@example.com", message: "Hi" } });
    const enquiryId = submit.json().id;

    const respond = await ctx.app.inject({ method: "POST", url: `/enquiries/${enquiryId}/respond`, headers: { cookie: strangerCookie }, payload: { text: "Nope" } });
    expect(respond.statusCode).toBe(403);

    const status = await ctx.app.inject({ method: "PATCH", url: `/enquiries/${enquiryId}/status`, headers: { cookie: strangerCookie }, payload: { status: "closed" } });
    expect(status.statusCode).toBe(403);
  });
});
