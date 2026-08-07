import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

async function setup(ctx: TestContext) {
  const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
  await grantRole(ctx.db, adminId, "Super Admin");
  const { cookie: ownerCookie, userId: ownerId } = await registerAndGetCookie(ctx, "owner@example.com");
  const bizRes = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerCookie }, payload: { name: "Biz" } });
  const businessId = bizRes.json().id;
  await ctx.app.inject({ method: "POST", url: `/businesses/${businessId}/approve`, headers: { cookie: adminCookie } });
  const { rows: catRows } = await ctx.db.query<{ id: string }>(
    `INSERT INTO categories (name, slug, has_detail_table) VALUES ('Hotel', 'hotel', true) RETURNING id`,
  );
  const categoryId = catRows[0].id;

  const create = await ctx.app.inject({
    method: "POST",
    url: "/listings",
    headers: { cookie: ownerCookie },
    payload: { businessId, categoryId, name: "Lakeside Suite" },
  });
  const listingId = create.json().id;
  await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/approve`, headers: { cookie: adminCookie } });

  return { adminCookie, ownerCookie, ownerId, businessId, listingId };
}

describe("POST /listings/:listingId/contact-reveal — the contact-info gate's lead signal (issue #15)", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("rejects an anonymous caller with 401", async () => {
    const { listingId } = await setup(ctx);
    const response = await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/contact-reveal` });
    expect(response.statusCode).toBe(401);
  });

  it("logs a row for a signed-in visitor's reveal", async () => {
    const { listingId } = await setup(ctx);
    const { cookie: visitorCookie, userId: visitorId } = await registerAndGetCookie(ctx, "visitor@example.com");

    const response = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/contact-reveal`,
      headers: { cookie: visitorCookie },
    });
    expect(response.statusCode).toBe(204);

    const { rows } = await ctx.db.query(`SELECT * FROM contact_reveals WHERE listing_id = $1 AND user_id = $2`, [
      listingId,
      visitorId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it("dedupes repeat reveals from the same visitor on the same day, without erroring", async () => {
    const { listingId } = await setup(ctx);
    const { cookie: visitorCookie, userId: visitorId } = await registerAndGetCookie(ctx, "visitor2@example.com");

    await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/contact-reveal`, headers: { cookie: visitorCookie } });
    const second = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/contact-reveal`,
      headers: { cookie: visitorCookie },
    });
    expect(second.statusCode).toBe(204);

    const { rows } = await ctx.db.query(`SELECT * FROM contact_reveals WHERE listing_id = $1 AND user_id = $2`, [
      listingId,
      visitorId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it("skips logging when the caller is the Listing's own Business Owner", async () => {
    const { listingId, ownerCookie, ownerId } = await setup(ctx);

    const response = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/contact-reveal`,
      headers: { cookie: ownerCookie },
    });
    expect(response.statusCode).toBe(204);

    const { rows } = await ctx.db.query(`SELECT * FROM contact_reveals WHERE listing_id = $1 AND user_id = $2`, [
      listingId,
      ownerId,
    ]);
    expect(rows).toHaveLength(0);
  });

  it("skips logging when the caller is accepted staff on the Listing's Business", async () => {
    const { listingId, ownerCookie, businessId } = await setup(ctx);
    const { cookie: staffCookie, userId: staffId } = await registerAndGetCookie(ctx, "staff@example.com");

    const invite = await ctx.app.inject({
      method: "POST",
      url: `/businesses/${businessId}/staff`,
      headers: { cookie: ownerCookie },
      payload: { email: "staff@example.com" },
    });
    await ctx.app.inject({
      method: "PATCH",
      url: `/businesses/${businessId}/staff/${invite.json().id}`,
      headers: { cookie: staffCookie },
      payload: { status: "accepted" },
    });

    const response = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/contact-reveal`,
      headers: { cookie: staffCookie },
    });
    expect(response.statusCode).toBe(204);

    const { rows } = await ctx.db.query(`SELECT * FROM contact_reveals WHERE listing_id = $1 AND user_id = $2`, [
      listingId,
      staffId,
    ]);
    expect(rows).toHaveLength(0);
  });

  it("still logs a pending (not yet accepted) staff invite's reveal — only accepted staff are excluded", async () => {
    const { listingId, ownerCookie, businessId } = await setup(ctx);
    const { cookie: staffCookie, userId: staffId } = await registerAndGetCookie(ctx, "pendingstaff@example.com");

    await ctx.app.inject({
      method: "POST",
      url: `/businesses/${businessId}/staff`,
      headers: { cookie: ownerCookie },
      payload: { email: "pendingstaff@example.com" },
    });

    const response = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/contact-reveal`,
      headers: { cookie: staffCookie },
    });
    expect(response.statusCode).toBe(204);

    const { rows } = await ctx.db.query(`SELECT * FROM contact_reveals WHERE listing_id = $1 AND user_id = $2`, [
      listingId,
      staffId,
    ]);
    expect(rows).toHaveLength(1);
  });
});
