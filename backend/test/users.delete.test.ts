import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildTestApp,
  closeTestApp,
  grantRole,
  registerAndGetCookie as register,
  resetDb,
  type TestContext,
} from "./helpers.js";

describe("DELETE /users/:userId", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("lets a user delete their own account", async () => {
    const { cookie, userId } = await register(ctx, "gary@example.com");

    const response = await ctx.app.inject({ method: "DELETE", url: `/users/${userId}`, headers: { cookie } });
    expect(response.statusCode).toBe(204);

    const { rows } = await ctx.db.query("SELECT 1 FROM users WHERE id = $1", [userId]);
    expect(rows).toHaveLength(0);
  });

  it("applies the ADR 0009 FK policy: personal content cascades, administrative records survive with the identity link nulled", async () => {
    const { cookie, userId } = await register(ctx, "helen@example.com");

    const category = await ctx.db.query(
      `INSERT INTO categories (name, slug, has_detail_table) VALUES ('Hotel', 'hotel', true) RETURNING id`,
    );
    const otherOwner = await register(ctx, "owner@example.com");
    const business = await ctx.db.query(
      `INSERT INTO businesses (owner_id, name) VALUES ($1, 'Some Hotel') RETURNING id`,
      [otherOwner.userId],
    );
    const listing = await ctx.db.query(
      `INSERT INTO listings (business_id, category_id, name, slug) VALUES ($1, $2, 'Some Hotel Listing', 'some-hotel-listing') RETURNING id`,
      [business.rows[0].id, category.rows[0].id],
    );
    const listingId = listing.rows[0].id;

    await ctx.db.query(`INSERT INTO reviews (listing_id, user_id, rating, text) VALUES ($1, $2, 5, 'Great!')`, [
      listingId,
      userId,
    ]);
    const enquiry = await ctx.db.query(
      `INSERT INTO enquiries (listing_id, user_id, name, email, message) VALUES ($1, $2, 'Helen', 'helen@example.com', 'Hi') RETURNING id`,
      [listingId, userId],
    );
    const auditLog = await ctx.db.query(
      `INSERT INTO audit_logs (actor_id, action, table_name, record_id) VALUES ($1, 'created', 'listings', $2) RETURNING id`,
      [userId, listingId],
    );

    const response = await ctx.app.inject({ method: "DELETE", url: `/users/${userId}`, headers: { cookie } });
    expect(response.statusCode).toBe(204);

    const reviews = await ctx.db.query("SELECT 1 FROM reviews WHERE user_id = $1", [userId]);
    expect(reviews.rows).toHaveLength(0);

    const survivingEnquiry = await ctx.db.query("SELECT user_id FROM enquiries WHERE id = $1", [
      enquiry.rows[0].id,
    ]);
    expect(survivingEnquiry.rows).toHaveLength(1);
    expect(survivingEnquiry.rows[0].user_id).toBeNull();

    const survivingAuditLog = await ctx.db.query("SELECT actor_id FROM audit_logs WHERE id = $1", [
      auditLog.rows[0].id,
    ]);
    expect(survivingAuditLog.rows).toHaveLength(1);
    expect(survivingAuditLog.rows[0].actor_id).toBeNull();
  });

  it("blocks a user from deleting someone else's account", async () => {
    const { userId: victimId } = await register(ctx, "victim@example.com");
    const { cookie: attackerCookie } = await register(ctx, "attacker@example.com");

    const response = await ctx.app.inject({
      method: "DELETE",
      url: `/users/${victimId}`,
      headers: { cookie: attackerCookie },
    });

    expect(response.statusCode).toBe(403);
  });

  it("lets a Super Admin delete any user's account", async () => {
    const { cookie: adminCookie, userId: adminId } = await register(ctx, "admin@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { userId: targetId } = await register(ctx, "target@example.com");

    const response = await ctx.app.inject({
      method: "DELETE",
      url: `/users/${targetId}`,
      headers: { cookie: adminCookie },
    });

    expect(response.statusCode).toBe(204);
  });

  it("returns a clear conflict, not a raw 500, when the account still owns a Business (ADR 0009 RESTRICT)", async () => {
    const { cookie, userId } = await register(ctx, "owner2@example.com");
    await ctx.db.query(`INSERT INTO businesses (owner_id, name) VALUES ($1, 'Owned Business')`, [userId]);

    const response = await ctx.app.inject({ method: "DELETE", url: `/users/${userId}`, headers: { cookie } });

    expect(response.statusCode).toBe(409);
  });
});
