import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

/** Yesterday/tomorrow, so a promotion created with them is in-range today. */
const YESTERDAY = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const TOMORROW = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const LAST_WEEK = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
const LAST_MONTH = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

async function setup(ctx: TestContext) {
  const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
  await grantRole(ctx.db, adminId, "Super Admin");
  const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner@example.com");
  const biz = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerCookie }, payload: { name: "Biz" } });
  const businessId = biz.json().id;
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

describe("Promotions", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("404s a create against a Listing that isn't approved yet", async () => {
    const { ownerCookie, createListing } = await setup(ctx);
    const listingId = await createListing("Pending Listing", false);
    const response = await ctx.app.inject({
      method: "POST",
      url: "/promotions",
      headers: { cookie: ownerCookie },
      payload: { listingId, title: "20% off", startDate: YESTERDAY, endDate: TOMORROW },
    });
    expect(response.statusCode).toBe(404);
  });

  it("blocks a non-owner, non-admin from promoting someone else's Listing with 403", async () => {
    const { createListing } = await setup(ctx);
    const { cookie: strangerCookie } = await registerAndGetCookie(ctx, "stranger@example.com");
    const listingId = await createListing("Listing");
    const response = await ctx.app.inject({
      method: "POST",
      url: "/promotions",
      headers: { cookie: strangerCookie },
      payload: { listingId, title: "Sneaky promo", startDate: YESTERDAY, endDate: TOMORROW },
    });
    expect(response.statusCode).toBe(403);
  });

  it("lets the owner create a Promotion on their own Listing, starting as draft and invisible publicly", async () => {
    const { ownerCookie, createListing } = await setup(ctx);
    const listingId = await createListing("Listing");

    const create = await ctx.app.inject({
      method: "POST",
      url: "/promotions",
      headers: { cookie: ownerCookie },
      payload: { listingId, title: "20% off", discountPercent: 20, startDate: YESTERDAY, endDate: TOMORROW },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().status).toBe("draft");
    expect(create.json().discountPercent).toBe(20);
    expect(create.json().startDate).toBe(YESTERDAY);

    const publicList = await ctx.app.inject({ method: "GET", url: "/promotions" });
    expect(publicList.json()).toHaveLength(0);
  });

  it("runs the draft -> pending -> active flow: owner submits, admin approves, then it's public", async () => {
    const { adminCookie, ownerCookie, createListing } = await setup(ctx);
    const listingId = await createListing("Listing");
    const create = await ctx.app.inject({
      method: "POST",
      url: "/promotions",
      headers: { cookie: ownerCookie },
      payload: { listingId, title: "20% off", startDate: YESTERDAY, endDate: TOMORROW },
    });
    const promotionId = create.json().id;

    const submit = await ctx.app.inject({
      method: "PATCH",
      url: `/promotions/${promotionId}`,
      headers: { cookie: ownerCookie },
      payload: { status: "pending" },
    });
    expect(submit.statusCode).toBe(200);
    expect(submit.json().status).toBe("pending");

    const approve = await ctx.app.inject({
      method: "PATCH",
      url: `/promotions/${promotionId}`,
      headers: { cookie: adminCookie },
      payload: { status: "active" },
    });
    expect(approve.json().status).toBe("active");

    const publicList = await ctx.app.inject({ method: "GET", url: "/promotions" });
    expect(publicList.json()).toHaveLength(1);
  });

  it("blocks the owner from activating their own Promotion with 400", async () => {
    const { ownerCookie, createListing } = await setup(ctx);
    const listingId = await createListing("Listing");
    const create = await ctx.app.inject({
      method: "POST",
      url: "/promotions",
      headers: { cookie: ownerCookie },
      payload: { listingId, title: "20% off", startDate: YESTERDAY, endDate: TOMORROW },
    });
    const promotionId = create.json().id;
    await ctx.app.inject({ method: "PATCH", url: `/promotions/${promotionId}`, headers: { cookie: ownerCookie }, payload: { status: "pending" } });

    const response = await ctx.app.inject({
      method: "PATCH",
      url: `/promotions/${promotionId}`,
      headers: { cookie: ownerCookie },
      payload: { status: "active" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("lets an admin send a pending Promotion back to draft for revision", async () => {
    const { adminCookie, ownerCookie, createListing } = await setup(ctx);
    const listingId = await createListing("Listing");
    const create = await ctx.app.inject({
      method: "POST",
      url: "/promotions",
      headers: { cookie: ownerCookie },
      payload: { listingId, title: "20% off", startDate: YESTERDAY, endDate: TOMORROW },
    });
    const promotionId = create.json().id;
    await ctx.app.inject({ method: "PATCH", url: `/promotions/${promotionId}`, headers: { cookie: ownerCookie }, payload: { status: "pending" } });

    const sendBack = await ctx.app.inject({
      method: "PATCH",
      url: `/promotions/${promotionId}`,
      headers: { cookie: adminCookie },
      payload: { status: "draft" },
    });
    expect(sendBack.json().status).toBe("draft");
  });

  it("lets the owner edit non-status fields at any status", async () => {
    const { ownerCookie, createListing } = await setup(ctx);
    const listingId = await createListing("Listing");
    const create = await ctx.app.inject({
      method: "POST",
      url: "/promotions",
      headers: { cookie: ownerCookie },
      payload: { listingId, title: "20% off", startDate: YESTERDAY, endDate: TOMORROW },
    });
    const promotionId = create.json().id;

    const edit = await ctx.app.inject({
      method: "PATCH",
      url: `/promotions/${promotionId}`,
      headers: { cookie: ownerCookie },
      payload: { title: "25% off", discountPercent: 25 },
    });
    expect(edit.statusCode).toBe(200);
    expect(edit.json().title).toBe("25% off");
    expect(edit.json().status).toBe("draft"); // untouched
  });

  it("blocks a non-owner, non-admin from editing or deleting a Promotion with 403", async () => {
    const { ownerCookie, createListing } = await setup(ctx);
    const { cookie: strangerCookie } = await registerAndGetCookie(ctx, "stranger2@example.com");
    const listingId = await createListing("Listing");
    const create = await ctx.app.inject({
      method: "POST",
      url: "/promotions",
      headers: { cookie: ownerCookie },
      payload: { listingId, title: "20% off", startDate: YESTERDAY, endDate: TOMORROW },
    });
    const promotionId = create.json().id;

    const edit = await ctx.app.inject({
      method: "PATCH",
      url: `/promotions/${promotionId}`,
      headers: { cookie: strangerCookie },
      payload: { title: "Hijacked" },
    });
    expect(edit.statusCode).toBe(403);

    const del = await ctx.app.inject({ method: "DELETE", url: `/promotions/${promotionId}`, headers: { cookie: strangerCookie } });
    expect(del.statusCode).toBe(403);
  });

  it("lets the owner delete their own Promotion", async () => {
    const { ownerCookie, createListing } = await setup(ctx);
    const listingId = await createListing("Listing");
    const create = await ctx.app.inject({
      method: "POST",
      url: "/promotions",
      headers: { cookie: ownerCookie },
      payload: { listingId, title: "20% off", startDate: YESTERDAY, endDate: TOMORROW },
    });
    const promotionId = create.json().id;

    const del = await ctx.app.inject({ method: "DELETE", url: `/promotions/${promotionId}`, headers: { cookie: ownerCookie } });
    expect(del.statusCode).toBe(204);

    const get = await ctx.app.inject({ method: "GET", url: `/promotions/${promotionId}`, headers: { cookie: ownerCookie } });
    expect(get.statusCode).toBe(404);
  });

  it("hides an active-but-out-of-range Promotion from the public list (status alone isn't enough)", async () => {
    const { adminCookie, ownerCookie, createListing } = await setup(ctx);
    const listingId = await createListing("Listing");
    const create = await ctx.app.inject({
      method: "POST",
      url: "/promotions",
      headers: { cookie: ownerCookie },
      payload: { listingId, title: "Past promo", startDate: LAST_MONTH, endDate: LAST_WEEK },
    });
    const promotionId = create.json().id;
    await ctx.app.inject({ method: "PATCH", url: `/promotions/${promotionId}`, headers: { cookie: ownerCookie }, payload: { status: "pending" } });
    await ctx.app.inject({ method: "PATCH", url: `/promotions/${promotionId}`, headers: { cookie: adminCookie }, payload: { status: "active" } });

    const publicList = await ctx.app.inject({ method: "GET", url: "/promotions" });
    expect(publicList.json()).toHaveLength(0);

    const anonGet = await ctx.app.inject({ method: "GET", url: `/promotions/${promotionId}` });
    expect(anonGet.statusCode).toBe(404);
  });

  it("shows an owner every status on their own Listing, but only public ones on someone else's", async () => {
    const { adminCookie, ownerCookie, createListing } = await setup(ctx);
    const listingId = await createListing("Listing");
    await ctx.app.inject({
      method: "POST",
      url: "/promotions",
      headers: { cookie: ownerCookie },
      payload: { listingId, title: "My draft", startDate: YESTERDAY, endDate: TOMORROW },
    });

    const ownList = await ctx.app.inject({ method: "GET", url: "/promotions", headers: { cookie: ownerCookie } });
    expect(ownList.json()).toHaveLength(1);

    const { cookie: strangerCookie } = await registerAndGetCookie(ctx, "stranger3@example.com");
    const strangerList = await ctx.app.inject({ method: "GET", url: "/promotions", headers: { cookie: strangerCookie } });
    expect(strangerList.json()).toHaveLength(0);

    const adminList = await ctx.app.inject({ method: "GET", url: "/promotions", headers: { cookie: adminCookie } });
    expect(adminList.json()).toHaveLength(1);
  });

  it("filters the list by listingId", async () => {
    const { ownerCookie, createListing } = await setup(ctx);
    const listingA = await createListing("Listing A");
    const listingB = await createListing("Listing B");
    await ctx.app.inject({
      method: "POST",
      url: "/promotions",
      headers: { cookie: ownerCookie },
      payload: { listingId: listingA, title: "A promo", startDate: YESTERDAY, endDate: TOMORROW },
    });
    await ctx.app.inject({
      method: "POST",
      url: "/promotions",
      headers: { cookie: ownerCookie },
      payload: { listingId: listingB, title: "B promo", startDate: YESTERDAY, endDate: TOMORROW },
    });

    const filtered = await ctx.app.inject({ method: "GET", url: `/promotions?listingId=${listingA}`, headers: { cookie: ownerCookie } });
    expect(filtered.json()).toHaveLength(1);
    expect(filtered.json()[0].title).toBe("A promo");
  });
});
