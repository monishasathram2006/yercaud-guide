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

describe("Reviews", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("rejects an anonymous submit with 401", async () => {
    const { createListing } = await setup(ctx);
    const listingId = await createListing("Listing");
    const response = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/reviews`,
      payload: { rating: 5, text: "Great!" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("404s a submit against a Listing that isn't approved yet", async () => {
    const { createListing } = await setup(ctx);
    const { cookie: visitorCookie } = await registerAndGetCookie(ctx, "visitor@example.com");
    const listingId = await createListing("Pending Listing", false);
    const response = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/reviews`,
      headers: { cookie: visitorCookie },
      payload: { rating: 5, text: "Great!" },
    });
    expect(response.statusCode).toBe(404);
  });

  it("lets any signed-in visitor submit a review, starting pending and invisible on the public list", async () => {
    const { createListing } = await setup(ctx);
    const { cookie: visitorCookie, userId: visitorId } = await registerAndGetCookie(ctx, "visitor2@example.com");
    const listingId = await createListing("Listing");

    const submit = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/reviews`,
      headers: { cookie: visitorCookie },
      payload: { rating: 4, text: "Pretty good" },
    });
    expect(submit.statusCode).toBe(201);
    expect(submit.json().status).toBe("pending");
    expect(submit.json().userId).toBe(visitorId);

    const publicList = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}/reviews` });
    expect(publicList.json()).toHaveLength(0);
  });

  it("rejects a duplicate review from the same User with 409", async () => {
    const { createListing } = await setup(ctx);
    const { cookie: visitorCookie } = await registerAndGetCookie(ctx, "visitor3@example.com");
    const listingId = await createListing("Listing");
    await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/reviews`,
      headers: { cookie: visitorCookie },
      payload: { rating: 4, text: "First" },
    });

    const response = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/reviews`,
      headers: { cookie: visitorCookie },
      payload: { rating: 2, text: "Second" },
    });
    expect(response.statusCode).toBe(409);
  });

  it("Super Admin approves a pending review, making it publicly visible; owner can then reply", async () => {
    const { adminCookie, ownerCookie, createListing } = await setup(ctx);
    const { cookie: visitorCookie } = await registerAndGetCookie(ctx, "visitor4@example.com");
    const listingId = await createListing("Listing");
    const submit = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/reviews`,
      headers: { cookie: visitorCookie },
      payload: { rating: 5, text: "Loved it" },
    });
    const reviewId = submit.json().id;

    const approve = await ctx.app.inject({
      method: "POST",
      url: `/reviews/${reviewId}/approve`,
      headers: { cookie: adminCookie },
    });
    expect(approve.statusCode).toBe(200);
    expect(approve.json().status).toBe("approved");

    const publicList = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}/reviews` });
    expect(publicList.json()).toHaveLength(1);

    const reply = await ctx.app.inject({
      method: "POST",
      url: `/reviews/${reviewId}/reply`,
      headers: { cookie: ownerCookie },
      payload: { text: "Thank you!" },
    });
    expect(reply.statusCode).toBe(200);
    expect(reply.json().ownerReply).toBe("Thank you!");
  });

  it("blocks a Business Owner from approving/rejecting their own Listing's review with 403 (ADR 0006)", async () => {
    const { ownerCookie, createListing } = await setup(ctx);
    const { cookie: visitorCookie } = await registerAndGetCookie(ctx, "visitor5@example.com");
    const listingId = await createListing("Listing");
    const submit = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/reviews`,
      headers: { cookie: visitorCookie },
      payload: { rating: 3, text: "It was ok" },
    });
    const reviewId = submit.json().id;

    const response = await ctx.app.inject({
      method: "POST",
      url: `/reviews/${reviewId}/approve`,
      headers: { cookie: ownerCookie },
    });
    expect(response.statusCode).toBe(403);
  });

  it("blocks a non-owner, non-admin from replying to a review with 403", async () => {
    const { adminCookie, createListing } = await setup(ctx);
    const { cookie: visitorCookie } = await registerAndGetCookie(ctx, "visitor6@example.com");
    const { cookie: strangerCookie } = await registerAndGetCookie(ctx, "stranger6@example.com");
    const listingId = await createListing("Listing");
    const submit = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/reviews`,
      headers: { cookie: visitorCookie },
      payload: { rating: 5, text: "Nice" },
    });
    const reviewId = submit.json().id;
    await ctx.app.inject({ method: "POST", url: `/reviews/${reviewId}/approve`, headers: { cookie: adminCookie } });

    const response = await ctx.app.inject({
      method: "POST",
      url: `/reviews/${reviewId}/reply`,
      headers: { cookie: strangerCookie },
      payload: { text: "Hijacked reply" },
    });
    expect(response.statusCode).toBe(403);
  });

  it("blocks replying to a review that isn't approved yet with 409", async () => {
    const { ownerCookie, createListing } = await setup(ctx);
    const { cookie: visitorCookie } = await registerAndGetCookie(ctx, "visitor7@example.com");
    const listingId = await createListing("Listing");
    const submit = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/reviews`,
      headers: { cookie: visitorCookie },
      payload: { rating: 5, text: "Nice" },
    });
    const reviewId = submit.json().id;

    const response = await ctx.app.inject({
      method: "POST",
      url: `/reviews/${reviewId}/reply`,
      headers: { cookie: ownerCookie },
      payload: { text: "Too soon" },
    });
    expect(response.statusCode).toBe(409);
  });

  it("lets the author edit their own review, resetting it to pending", async () => {
    const { adminCookie, createListing } = await setup(ctx);
    const { cookie: visitorCookie } = await registerAndGetCookie(ctx, "visitor8@example.com");
    const listingId = await createListing("Listing");
    const submit = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/reviews`,
      headers: { cookie: visitorCookie },
      payload: { rating: 3, text: "Meh" },
    });
    const reviewId = submit.json().id;
    await ctx.app.inject({ method: "POST", url: `/reviews/${reviewId}/approve`, headers: { cookie: adminCookie } });

    const edit = await ctx.app.inject({
      method: "PATCH",
      url: `/reviews/${reviewId}`,
      headers: { cookie: visitorCookie },
      payload: { rating: 5, text: "Actually great on reflection" },
    });
    expect(edit.statusCode).toBe(200);
    expect(edit.json().status).toBe("pending");
    expect(edit.json().rating).toBe(5);

    const publicList = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}/reviews` });
    expect(publicList.json()).toHaveLength(0);
  });

  it("blocks editing someone else's review with 403", async () => {
    const { createListing } = await setup(ctx);
    const { cookie: visitorCookie } = await registerAndGetCookie(ctx, "visitor9@example.com");
    const { cookie: strangerCookie } = await registerAndGetCookie(ctx, "stranger9@example.com");
    const listingId = await createListing("Listing");
    const submit = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/reviews`,
      headers: { cookie: visitorCookie },
      payload: { rating: 3, text: "Meh" },
    });
    const reviewId = submit.json().id;

    const response = await ctx.app.inject({
      method: "PATCH",
      url: `/reviews/${reviewId}`,
      headers: { cookie: strangerCookie },
      payload: { rating: 1, text: "Hijacked" },
    });
    expect(response.statusCode).toBe(403);
  });

  it("lets any signed-in User report a review, and a Super Admin see the full moderation queue", async () => {
    const { adminCookie, createListing } = await setup(ctx);
    const { cookie: visitorCookie } = await registerAndGetCookie(ctx, "visitor10@example.com");
    const { cookie: reporterCookie } = await registerAndGetCookie(ctx, "reporter10@example.com");
    const listingId = await createListing("Listing");
    const submit = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/reviews`,
      headers: { cookie: visitorCookie },
      payload: { rating: 1, text: "Spam-ish" },
    });
    const reviewId = submit.json().id;

    const report = await ctx.app.inject({
      method: "POST",
      url: `/reviews/${reviewId}/report`,
      headers: { cookie: reporterCookie },
      payload: { reason: "Looks like spam" },
    });
    expect(report.statusCode).toBe(201);

    const queue = await ctx.app.inject({ method: "GET", url: "/reviews?status=pending", headers: { cookie: adminCookie } });
    expect(queue.json()).toHaveLength(1);
  });

  it("blocks a non-admin from listing the moderation queue with 403", async () => {
    const { ownerCookie } = await setup(ctx);
    const response = await ctx.app.inject({ method: "GET", url: "/reviews", headers: { cookie: ownerCookie } });
    expect(response.statusCode).toBe(403);
  });

  it("includes the author's name and username on the public reviews list, so a review isn't anonymous (issue #14)", async () => {
    const { adminCookie, createListing } = await setup(ctx);
    const { cookie: visitorCookie } = await registerAndGetCookie(ctx, "ravi14@example.com");
    const listingId = await createListing("Listing");
    const submit = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/reviews`,
      headers: { cookie: visitorCookie },
      payload: { rating: 5, text: "Loved it" },
    });
    await ctx.app.inject({ method: "POST", url: `/reviews/${submit.json().id}/approve`, headers: { cookie: adminCookie } });

    const publicList = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}/reviews` });
    expect(publicList.json()[0]).toMatchObject({ authorName: "Test User" });
    expect(publicList.json()[0].authorUsername).toMatch(/^[a-z][a-z0-9_]{2,19}$/);
  });
});

describe("GET /me/reviews", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("returns every Review the caller has written, across every status, joined with each Listing's summary", async () => {
    const { adminCookie, createListing } = await setup(ctx);
    const { cookie: visitorCookie } = await registerAndGetCookie(ctx, "visitor11@example.com");
    const listingA = await createListing("Listing A");
    const listingB = await createListing("Listing B");

    const reviewA = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingA}/reviews`,
      headers: { cookie: visitorCookie },
      payload: { rating: 5, text: "Loved it" },
    });
    await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingB}/reviews`,
      headers: { cookie: visitorCookie },
      payload: { rating: 2, text: "Not great" },
    });
    await ctx.app.inject({
      method: "POST",
      url: `/reviews/${reviewA.json().id}/reject`,
      headers: { cookie: adminCookie },
    });

    const mine = await ctx.app.inject({ method: "GET", url: "/me/reviews", headers: { cookie: visitorCookie } });
    expect(mine.statusCode).toBe(200);
    expect(mine.json()).toHaveLength(2);
    const statuses = mine.json().map((r: { status: string }) => r.status);
    expect(statuses.sort()).toEqual(["pending", "rejected"]);
    const listingNames = mine.json().map((r: { listing: { name: string } }) => r.listing.name).sort();
    expect(listingNames).toEqual(["Listing A", "Listing B"]);
  });

  it("includes the owner's reply when one exists", async () => {
    const { adminCookie, ownerCookie, createListing } = await setup(ctx);
    const { cookie: visitorCookie } = await registerAndGetCookie(ctx, "visitor12@example.com");
    const listingId = await createListing("Listing");
    const submit = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/reviews`,
      headers: { cookie: visitorCookie },
      payload: { rating: 4, text: "Nice stay" },
    });
    // A reply is only allowed on an approved Review (ADR 0006).
    await ctx.app.inject({
      method: "POST",
      url: `/reviews/${submit.json().id}/approve`,
      headers: { cookie: adminCookie },
    });
    await ctx.app.inject({
      method: "POST",
      url: `/reviews/${submit.json().id}/reply`,
      headers: { cookie: ownerCookie },
      payload: { text: "Thanks for staying with us!" },
    });

    const mine = await ctx.app.inject({ method: "GET", url: "/me/reviews", headers: { cookie: visitorCookie } });
    expect(mine.json()[0].ownerReply).toBe("Thanks for staying with us!");
  });

  it("never shows one visitor's Reviews to another", async () => {
    const { createListing } = await setup(ctx);
    const { cookie: aliceCookie } = await registerAndGetCookie(ctx, "alice13@example.com");
    const { cookie: bobCookie } = await registerAndGetCookie(ctx, "bob13@example.com");
    const listingId = await createListing("Listing");
    await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/reviews`,
      headers: { cookie: aliceCookie },
      payload: { rating: 5, text: "Alice's review" },
    });

    const bobsView = await ctx.app.inject({ method: "GET", url: "/me/reviews", headers: { cookie: bobCookie } });
    expect(bobsView.json()).toEqual([]);
  });

  it("rejects an anonymous request with 401", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/me/reviews" });
    expect(response.statusCode).toBe(401);
  });
});
