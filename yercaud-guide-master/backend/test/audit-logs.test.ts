import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

async function getAuditLogs(ctx: TestContext, adminCookie: string, tableName?: string) {
  const url = tableName ? `/audit-logs?tableName=${tableName}` : "/audit-logs";
  const response = await ctx.app.inject({ method: "GET", url, headers: { cookie: adminCookie } });
  return response.json() as Array<{ action: string; tableName: string; recordId: string; actorId: string | null; oldData: unknown; newData: unknown }>;
}

describe("Audit log retrofit (GET /audit-logs)", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("blocks a non-admin from querying the audit log with 403", async () => {
    const { cookie } = await registerAndGetCookie(ctx, "plain@example.com");
    const response = await ctx.app.inject({ method: "GET", url: "/audit-logs", headers: { cookie } });
    expect(response.statusCode).toBe(403);
  });

  it("logs Business approve/reject/suspend/archive, but not the owner-editable PATCH", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner@example.com");
    const create = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerCookie }, payload: { name: "Biz" } });
    const businessId = create.json().id;

    await ctx.app.inject({ method: "PATCH", url: `/businesses/${businessId}`, headers: { cookie: ownerCookie }, payload: { name: "Renamed (before approval)" } });
    await ctx.app.inject({ method: "POST", url: `/businesses/${businessId}/approve`, headers: { cookie: adminCookie } });
    await ctx.app.inject({ method: "POST", url: `/businesses/${businessId}/suspend`, headers: { cookie: adminCookie } });
    await ctx.app.inject({ method: "PATCH", url: `/businesses/${businessId}`, headers: { cookie: ownerCookie }, payload: { name: "Renamed (after suspend)" } });
    await ctx.app.inject({ method: "POST", url: `/businesses/${businessId}/archive`, headers: { cookie: adminCookie } });

    const logs = await getAuditLogs(ctx, adminCookie, "businesses");
    const actions = logs.map((l) => l.action).sort();
    expect(actions).toEqual(["businesses.approve", "businesses.archive", "businesses.suspend"]);
    expect(logs.every((l) => l.recordId === businessId)).toBe(true);
    expect(logs.every((l) => l.actorId === adminId)).toBe(true);
  });

  it("captures old/new status (and rejectionReason where relevant) on a Listing reject", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin2@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner2@example.com");
    const biz = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerCookie }, payload: { name: "Biz2" } });
    await ctx.app.inject({ method: "POST", url: `/businesses/${biz.json().id}/approve`, headers: { cookie: adminCookie } });
    const { rows: catRows } = await ctx.db.query<{ id: string }>(
      `INSERT INTO categories (name, slug, has_detail_table) VALUES ('Hotel', 'hotel', true) RETURNING id`,
    );
    const listing = await ctx.app.inject({
      method: "POST",
      url: "/listings",
      headers: { cookie: ownerCookie },
      payload: { businessId: biz.json().id, categoryId: catRows[0].id, name: "Listing2" },
    });
    await ctx.app.inject({
      method: "POST",
      url: `/listings/${listing.json().id}/reject`,
      headers: { cookie: adminCookie },
      payload: { reason: "Needs more photos" },
    });

    const logs = await getAuditLogs(ctx, adminCookie, "listings");
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe("listings.reject");
    expect(logs[0].oldData).toEqual({ status: "pending" });
    expect(logs[0].newData).toEqual({ status: "rejected", rejectionReason: "Needs more photos" });
  });

  it("logs Review approve/reject with only {status} — Reviews have no rejectionReason column", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin3@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner3@example.com");
    const biz = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerCookie }, payload: { name: "Biz3" } });
    await ctx.app.inject({ method: "POST", url: `/businesses/${biz.json().id}/approve`, headers: { cookie: adminCookie } });
    const { rows: catRows } = await ctx.db.query<{ id: string }>(
      `INSERT INTO categories (name, slug, has_detail_table) VALUES ('Hotel', 'hotel', true) RETURNING id`,
    );
    const listing = await ctx.app.inject({
      method: "POST",
      url: "/listings",
      headers: { cookie: ownerCookie },
      payload: { businessId: biz.json().id, categoryId: catRows[0].id, name: "Listing3" },
    });
    await ctx.app.inject({ method: "POST", url: `/listings/${listing.json().id}/approve`, headers: { cookie: adminCookie } });
    const { cookie: reviewerCookie } = await registerAndGetCookie(ctx, "reviewer3@example.com");
    const review = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listing.json().id}/reviews`,
      headers: { cookie: reviewerCookie },
      payload: { rating: 5, text: "Great" },
    });
    await ctx.app.inject({ method: "POST", url: `/reviews/${review.json().id}/approve`, headers: { cookie: adminCookie } });

    const logs = await getAuditLogs(ctx, adminCookie, "reviews");
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe("reviews.approve");
    expect(logs[0].newData).toEqual({ status: "approved" });
  });

  it("logs role creation, permission changes, and role assignment", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin4@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const create = await ctx.app.inject({ method: "POST", url: "/roles", headers: { cookie: adminCookie }, payload: { name: "Moderator" } });
    const roleId = create.json().id;
    await ctx.app.inject({
      method: "PUT",
      url: `/roles/${roleId}/permissions`,
      headers: { cookie: adminCookie },
      payload: [{ module: "Reviews", action: "approve" }],
    });
    const { userId: targetId } = await registerAndGetCookie(ctx, "target4@example.com");
    await ctx.app.inject({ method: "PUT", url: `/users/${targetId}/roles`, headers: { cookie: adminCookie }, payload: { roleIds: [roleId] } });

    const logs = await getAuditLogs(ctx, adminCookie, "roles");
    expect(logs.map((l) => l.action)).toEqual(["roles.create"]);

    const permLogs = await getAuditLogs(ctx, adminCookie, "role_permissions");
    expect(permLogs[0].oldData).toEqual({ permissions: [] });
    expect(permLogs[0].newData).toEqual({ permissions: [{ module: "Reviews", action: "approve" }] });

    const roleAssignLogs = await getAuditLogs(ctx, adminCookie, "user_roles");
    expect(roleAssignLogs[0].newData).toEqual({ roleIds: [roleId] });
  });

  it("logs User deletion (self and admin-triggered), with actorId null on self-delete", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin5@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: selfCookie, userId: selfId } = await registerAndGetCookie(ctx, "self5@example.com");
    await ctx.app.inject({ method: "DELETE", url: `/users/${selfId}`, headers: { cookie: selfCookie } });

    const { userId: otherId } = await registerAndGetCookie(ctx, "other5@example.com");
    await ctx.app.inject({ method: "DELETE", url: `/users/${otherId}`, headers: { cookie: adminCookie } });

    const logs = await getAuditLogs(ctx, adminCookie, "users");
    expect(logs).toHaveLength(2);
    const selfLog = logs.find((l) => l.recordId === selfId)!;
    expect(selfLog.actorId).toBeNull();
    const adminLog = logs.find((l) => l.recordId === otherId)!;
    expect(adminLog.actorId).toBe(adminId);
  });

  it("logs impersonation start and end", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin6@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { userId: ownerId } = await registerAndGetCookie(ctx, "owner6@example.com");
    await grantRole(ctx.db, ownerId, "Business Owner");

    const impersonate = await ctx.app.inject({ method: "POST", url: `/users/${ownerId}/impersonate`, headers: { cookie: adminCookie } });
    const impersonationCookie = impersonate.headers["set-cookie"] as string;
    await ctx.app.inject({ method: "POST", url: "/auth/exit-impersonation", headers: { cookie: impersonationCookie } });

    const logs = await getAuditLogs(ctx, adminCookie, "users");
    const impersonationLogs = logs.filter((l) => l.action.startsWith("auth.impersonate"));
    expect(impersonationLogs.map((l) => l.action).sort()).toEqual(["auth.impersonate_end", "auth.impersonate_start"]);
    expect(impersonationLogs.every((l) => l.recordId === ownerId && l.actorId === adminId)).toBe(true);
  });

  it("logs the Marketing mutations that are reachable only via requirePermission", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "adminM@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "ownerM@example.com");
    const biz = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerCookie }, payload: { name: "BizM" } });
    await ctx.app.inject({ method: "POST", url: `/businesses/${biz.json().id}/approve`, headers: { cookie: adminCookie } });
    const { rows: catRows } = await ctx.db.query<{ id: string }>(
      `INSERT INTO categories (name, slug, has_detail_table) VALUES ('Hotel', 'hotel', true) RETURNING id`,
    );
    const listing = await ctx.app.inject({
      method: "POST",
      url: "/listings",
      headers: { cookie: ownerCookie },
      payload: { businessId: biz.json().id, categoryId: catRows[0].id, name: "ListingM" },
    });
    const listingId = listing.json().id;
    await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/approve`, headers: { cookie: adminCookie } });

    const today = new Date().toISOString().slice(0, 10);
    const featured = await ctx.app.inject({
      method: "POST",
      url: "/featured-listings",
      headers: { cookie: adminCookie },
      payload: { listingId, startDate: today },
    });
    await ctx.app.inject({
      method: "PATCH",
      url: `/featured-listings/${featured.json().id}`,
      headers: { cookie: adminCookie },
      payload: { sortOrder: 3 },
    });
    await ctx.app.inject({ method: "DELETE", url: `/featured-listings/${featured.json().id}`, headers: { cookie: adminCookie } });

    const banner = await ctx.app.inject({
      method: "POST",
      url: "/banners",
      headers: { cookie: adminCookie },
      payload: { title: "B", imageUrl: "/b.png", placement: "home-hero" },
    });
    await ctx.app.inject({
      method: "PATCH",
      url: `/banners/${banner.json().id}`,
      headers: { cookie: adminCookie },
      payload: { status: "active" },
    });
    await ctx.app.inject({ method: "DELETE", url: `/banners/${banner.json().id}`, headers: { cookie: adminCookie } });

    // Table name is still featured_listings (issue #22 repurposed the table without
    // renaming it); the action namespace moved to sponsored_placements.*.
    const featuredLogs = await getAuditLogs(ctx, adminCookie, "featured_listings");
    expect(featuredLogs.map((l) => l.action).sort()).toEqual([
      "sponsored_placements.create",
      "sponsored_placements.delete",
      "sponsored_placements.update",
    ]);
    expect(featuredLogs.every((l) => l.actorId === adminId)).toBe(true);

    const bannerLogs = await getAuditLogs(ctx, adminCookie, "banners");
    expect(bannerLogs.map((l) => l.action).sort()).toEqual(["banners.create", "banners.delete", "banners.update"]);

    // Promotions' PATCH/DELETE are requireOwnerOrPermission (owner-reachable),
    // so they stay unlogged — same rule as a Review reply.
    const promotionLogs = await getAuditLogs(ctx, adminCookie, "promotions");
    expect(promotionLogs).toHaveLength(0);
  });

  it("logs the Blog/FAQ mutations that are reachable only via requirePermission — but not commenting or rating", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "adminB@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");

    const category = await ctx.app.inject({ method: "POST", url: "/blog-categories", headers: { cookie: adminCookie }, payload: { name: "Guides" } });
    const categoryId = category.json().id;
    const post = await ctx.app.inject({
      method: "POST",
      url: "/blog-posts",
      headers: { cookie: adminCookie },
      payload: { categoryId, title: "Audited Post", body: "Body" },
    });
    const postId = post.json().id;
    await ctx.app.inject({ method: "PATCH", url: `/blog-posts/${postId}`, headers: { cookie: adminCookie }, payload: { title: "Edited" } });
    await ctx.app.inject({ method: "POST", url: `/blog-posts/${postId}/publish`, headers: { cookie: adminCookie } });

    const { cookie: visitorCookie } = await registerAndGetCookie(ctx, "visitorB@example.com");
    const comment = await ctx.app.inject({
      method: "POST",
      url: `/blog-posts/${postId}/comments`,
      headers: { cookie: visitorCookie },
      payload: { body: "Nice" },
    });
    await ctx.app.inject({ method: "PUT", url: `/blog-posts/${postId}/rating`, headers: { cookie: visitorCookie }, payload: { rating: 5 } });
    await ctx.app.inject({ method: "POST", url: `/blog-comments/${comment.json().id}/approve`, headers: { cookie: adminCookie } });

    const faqCategory = await ctx.app.inject({ method: "POST", url: "/faq-categories", headers: { cookie: adminCookie }, payload: { name: "General" } });
    const faq = await ctx.app.inject({
      method: "POST",
      url: "/faqs",
      headers: { cookie: adminCookie },
      payload: { categoryId: faqCategory.json().id, question: "Q?", answer: "A." },
    });
    await ctx.app.inject({ method: "DELETE", url: `/faqs/${faq.json().id}`, headers: { cookie: adminCookie } });

    const postLogs = await getAuditLogs(ctx, adminCookie, "blog_posts");
    expect(postLogs.map((l) => l.action).sort()).toEqual(["blog_posts.create", "blog_posts.publish", "blog_posts.update"]);
    expect(postLogs.every((l) => l.actorId === adminId)).toBe(true);

    const categoryLogs = await getAuditLogs(ctx, adminCookie, "blog_categories");
    expect(categoryLogs.map((l) => l.action)).toEqual(["blog_categories.create"]);

    const commentLogs = await getAuditLogs(ctx, adminCookie, "blog_comments");
    expect(commentLogs.map((l) => l.action)).toEqual(["blog_comments.approve"]);

    const faqLogs = await getAuditLogs(ctx, adminCookie, "faqs");
    expect(faqLogs.map((l) => l.action).sort()).toEqual(["faqs.create", "faqs.delete"]);

    const faqCategoryLogs = await getAuditLogs(ctx, adminCookie, "faq_categories");
    expect(faqCategoryLogs.map((l) => l.action)).toEqual(["faq_categories.create"]);

    // Commenting and rating are requireAuth-only — any signed-in visitor,
    // routinely — so they're not logged, same as submitting a Review.
    const ratingLogs = await getAuditLogs(ctx, adminCookie, "article_ratings");
    expect(ratingLogs).toHaveLength(0);
    expect(commentLogs.some((l) => l.action.includes("submit") || l.action.includes("create"))).toBe(false);
  });

  it("does NOT log owner-reachable mutations: Business PATCH, staff invite, review reply, enquiry respond, review self-edit", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin7@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner7@example.com");
    const biz = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerCookie }, payload: { name: "Biz7" } });
    const businessId = biz.json().id;
    await ctx.app.inject({ method: "POST", url: `/businesses/${businessId}/approve`, headers: { cookie: adminCookie } });
    await ctx.app.inject({ method: "PATCH", url: `/businesses/${businessId}`, headers: { cookie: ownerCookie }, payload: { name: "Renamed" } });

    const { userId: staffUserId } = await registerAndGetCookie(ctx, "staff7@example.com");
    await ctx.app.inject({
      method: "POST",
      url: `/businesses/${businessId}/staff`,
      headers: { cookie: ownerCookie },
      payload: { email: "staff7@example.com" },
    });
    void staffUserId;

    const { rows: catRows } = await ctx.db.query<{ id: string }>(
      `INSERT INTO categories (name, slug, has_detail_table) VALUES ('Hotel', 'hotel', true) RETURNING id`,
    );
    const listing = await ctx.app.inject({
      method: "POST",
      url: "/listings",
      headers: { cookie: ownerCookie },
      payload: { businessId, categoryId: catRows[0].id, name: "Listing7" },
    });
    const listingId = listing.json().id;
    await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/approve`, headers: { cookie: adminCookie } });

    const { cookie: reviewerCookie } = await registerAndGetCookie(ctx, "reviewer7@example.com");
    const review = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/reviews`,
      headers: { cookie: reviewerCookie },
      payload: { rating: 4, text: "Good" },
    });
    const reviewId = review.json().id;
    await ctx.app.inject({ method: "POST", url: `/reviews/${reviewId}/approve`, headers: { cookie: adminCookie } });
    await ctx.app.inject({ method: "POST", url: `/reviews/${reviewId}/reply`, headers: { cookie: ownerCookie }, payload: { text: "Thanks!" } });
    await ctx.app.inject({ method: "PATCH", url: `/reviews/${reviewId}`, headers: { cookie: reviewerCookie }, payload: { rating: 5, text: "Even better" } });

    const enquiry = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/enquiries`,
      payload: { name: "X", email: "x@example.com", message: "Hi" },
    });
    await ctx.app.inject({ method: "POST", url: `/enquiries/${enquiry.json().id}/respond`, headers: { cookie: ownerCookie }, payload: { text: "Reply" } });

    const businessLogs = await getAuditLogs(ctx, adminCookie, "businesses");
    expect(businessLogs.map((l) => l.action)).toEqual(["businesses.approve"]);

    const staffLogs = await getAuditLogs(ctx, adminCookie, "business_staff");
    expect(staffLogs).toHaveLength(0);

    const enquiryLogs = await getAuditLogs(ctx, adminCookie, "enquiries");
    expect(enquiryLogs).toHaveLength(0);

    const reviewLogs = await getAuditLogs(ctx, adminCookie, "reviews");
    expect(reviewLogs.map((l) => l.action)).toEqual(["reviews.approve"]);
  });

  it("filters by recordId and paginates", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin8@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerACookie } = await registerAndGetCookie(ctx, "ownerA8@example.com");
    const { cookie: ownerBCookie } = await registerAndGetCookie(ctx, "ownerB8@example.com");
    const bizA = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerACookie }, payload: { name: "BizA8" } });
    const bizB = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerBCookie }, payload: { name: "BizB8" } });
    await ctx.app.inject({ method: "POST", url: `/businesses/${bizA.json().id}/approve`, headers: { cookie: adminCookie } });
    await ctx.app.inject({ method: "POST", url: `/businesses/${bizB.json().id}/approve`, headers: { cookie: adminCookie } });

    const response = await ctx.app.inject({
      method: "GET",
      url: `/audit-logs?recordId=${bizA.json().id}`,
      headers: { cookie: adminCookie },
    });
    expect(response.json()).toHaveLength(1);
    expect(response.json()[0].recordId).toBe(bizA.json().id);
  });
});
