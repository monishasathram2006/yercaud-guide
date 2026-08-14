import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

async function setup(ctx: TestContext) {
  const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
  await grantRole(ctx.db, adminId, "Super Admin");
  const { rows } = await ctx.db.query<{ id: string }>(
    `INSERT INTO blog_categories (name, slug) VALUES ('Guides', 'guides') RETURNING id`,
  );

  async function createPost(title: string, publish = true): Promise<string> {
    const create = await ctx.app.inject({
      method: "POST",
      url: "/blog-posts",
      headers: { cookie: adminCookie },
      payload: { categoryId: rows[0].id, title, body: "Body text here." },
    });
    const postId = create.json().id;
    if (publish) {
      await ctx.app.inject({ method: "POST", url: `/blog-posts/${postId}/publish`, headers: { cookie: adminCookie } });
    }
    return postId;
  }

  return { adminCookie, createPost };
}

describe("Blog Comments", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("rejects an anonymous comment with 401", async () => {
    const { createPost } = await setup(ctx);
    const postId = await createPost("Post");
    const response = await ctx.app.inject({ method: "POST", url: `/blog-posts/${postId}/comments`, payload: { body: "Hi" } });
    expect(response.statusCode).toBe(401);
  });

  it("404s a comment on an unpublished post", async () => {
    const { createPost } = await setup(ctx);
    const { cookie: visitorCookie } = await registerAndGetCookie(ctx, "visitor@example.com");
    const postId = await createPost("Draft Post", false);
    const response = await ctx.app.inject({
      method: "POST",
      url: `/blog-posts/${postId}/comments`,
      headers: { cookie: visitorCookie },
      payload: { body: "Hi" },
    });
    expect(response.statusCode).toBe(404);
  });

  it("starts a comment pending and invisible publicly, until a Super Admin approves it", async () => {
    const { adminCookie, createPost } = await setup(ctx);
    const { cookie: visitorCookie, userId: visitorId } = await registerAndGetCookie(ctx, "visitor2@example.com");
    const postId = await createPost("Post");

    const submit = await ctx.app.inject({
      method: "POST",
      url: `/blog-posts/${postId}/comments`,
      headers: { cookie: visitorCookie },
      payload: { body: "Great guide!" },
    });
    expect(submit.statusCode).toBe(201);
    expect(submit.json().status).toBe("pending");
    expect(submit.json().userId).toBe(visitorId);
    expect(submit.json().likeCount).toBe(0);

    const publicList = await ctx.app.inject({ method: "GET", url: `/blog-posts/${postId}/comments` });
    expect(publicList.json()).toHaveLength(0);

    const approve = await ctx.app.inject({
      method: "POST",
      url: `/blog-comments/${submit.json().id}/approve`,
      headers: { cookie: adminCookie },
    });
    expect(approve.json().status).toBe("approved");

    const afterApprove = await ctx.app.inject({ method: "GET", url: `/blog-posts/${postId}/comments` });
    expect(afterApprove.json()).toHaveLength(1);
  });

  it("rejects a pending comment, keeping it invisible", async () => {
    const { adminCookie, createPost } = await setup(ctx);
    const { cookie: visitorCookie } = await registerAndGetCookie(ctx, "visitor3@example.com");
    const postId = await createPost("Post");
    const submit = await ctx.app.inject({
      method: "POST",
      url: `/blog-posts/${postId}/comments`,
      headers: { cookie: visitorCookie },
      payload: { body: "spam spam" },
    });

    const reject = await ctx.app.inject({
      method: "POST",
      url: `/blog-comments/${submit.json().id}/reject`,
      headers: { cookie: adminCookie },
    });
    expect(reject.statusCode).toBe(200);
    expect(reject.json().status).toBe("rejected");

    const publicList = await ctx.app.inject({ method: "GET", url: `/blog-posts/${postId}/comments` });
    expect(publicList.json()).toHaveLength(0);
  });

  it("409s a no-op transition (approving an already-approved comment, or rejecting an already-rejected one)", async () => {
    const { adminCookie, createPost } = await setup(ctx);
    const { cookie: visitorCookie } = await registerAndGetCookie(ctx, "visitor4@example.com");
    const postId = await createPost("Post");
    const submit = await ctx.app.inject({
      method: "POST",
      url: `/blog-posts/${postId}/comments`,
      headers: { cookie: visitorCookie },
      payload: { body: "Nice" },
    });
    const commentId = submit.json().id;
    await ctx.app.inject({ method: "POST", url: `/blog-comments/${commentId}/approve`, headers: { cookie: adminCookie } });

    const again = await ctx.app.inject({ method: "POST", url: `/blog-comments/${commentId}/approve`, headers: { cookie: adminCookie } });
    expect(again.statusCode).toBe(409);

    await ctx.app.inject({ method: "POST", url: `/blog-comments/${commentId}/reject`, headers: { cookie: adminCookie } });
    const rejectAgain = await ctx.app.inject({ method: "POST", url: `/blog-comments/${commentId}/reject`, headers: { cookie: adminCookie } });
    expect(rejectAgain.statusCode).toBe(409);
  });

  it("lets a moderator reverse their own call in either direction (approved -> rejected, rejected -> approved)", async () => {
    const { adminCookie, createPost } = await setup(ctx);
    const { cookie: visitorCookie } = await registerAndGetCookie(ctx, "visitor4b@example.com");
    const postId = await createPost("Post");
    const submit = await ctx.app.inject({
      method: "POST",
      url: `/blog-posts/${postId}/comments`,
      headers: { cookie: visitorCookie },
      payload: { body: "Second thoughts" },
    });
    const commentId = submit.json().id;

    const approve = await ctx.app.inject({ method: "POST", url: `/blog-comments/${commentId}/approve`, headers: { cookie: adminCookie } });
    expect(approve.json().status).toBe("approved");

    const reject = await ctx.app.inject({ method: "POST", url: `/blog-comments/${commentId}/reject`, headers: { cookie: adminCookie } });
    expect(reject.statusCode).toBe(200);
    expect(reject.json().status).toBe("rejected");
    // A comment moved back out of approved must stop showing publicly.
    const afterReject = await ctx.app.inject({ method: "GET", url: `/blog-posts/${postId}/comments` });
    expect(afterReject.json()).toHaveLength(0);

    const reapprove = await ctx.app.inject({ method: "POST", url: `/blog-comments/${commentId}/approve`, headers: { cookie: adminCookie } });
    expect(reapprove.statusCode).toBe(200);
    expect(reapprove.json().status).toBe("approved");
    const afterReapprove = await ctx.app.inject({ method: "GET", url: `/blog-posts/${postId}/comments` });
    expect(afterReapprove.json()).toHaveLength(1);
  });

  it("gives a Super Admin a cross-post moderation queue, filtered by status", async () => {
    const { adminCookie, createPost } = await setup(ctx);
    const { cookie: visitorCookie } = await registerAndGetCookie(ctx, "visitor5@example.com");
    const postA = await createPost("Post A");
    const postB = await createPost("Post B");
    await ctx.app.inject({ method: "POST", url: `/blog-posts/${postA}/comments`, headers: { cookie: visitorCookie }, payload: { body: "On A" } });
    await ctx.app.inject({ method: "POST", url: `/blog-posts/${postB}/comments`, headers: { cookie: visitorCookie }, payload: { body: "On B" } });

    const queue = await ctx.app.inject({ method: "GET", url: "/blog-comments?status=pending", headers: { cookie: adminCookie } });
    expect(queue.json()).toHaveLength(2);

    const approved = await ctx.app.inject({ method: "GET", url: "/blog-comments?status=approved", headers: { cookie: adminCookie } });
    expect(approved.json()).toHaveLength(0);
  });

  it("blocks a non-admin from the moderation queue and from approve/reject with 403", async () => {
    const { adminCookie, createPost } = await setup(ctx);
    const { cookie: visitorCookie } = await registerAndGetCookie(ctx, "visitor6@example.com");
    const postId = await createPost("Post");
    const submit = await ctx.app.inject({
      method: "POST",
      url: `/blog-posts/${postId}/comments`,
      headers: { cookie: visitorCookie },
      payload: { body: "Mine" },
    });
    void adminCookie;

    const queue = await ctx.app.inject({ method: "GET", url: "/blog-comments", headers: { cookie: visitorCookie } });
    expect(queue.statusCode).toBe(403);

    const approve = await ctx.app.inject({
      method: "POST",
      url: `/blog-comments/${submit.json().id}/approve`,
      headers: { cookie: visitorCookie },
    });
    expect(approve.statusCode).toBe(403);
  });

  it("surfaces a pending comment in Phase 6's unified approval queue", async () => {
    const { adminCookie, createPost } = await setup(ctx);
    const { cookie: visitorCookie } = await registerAndGetCookie(ctx, "visitor7@example.com");
    const postId = await createPost("Queue Post");
    await ctx.app.inject({
      method: "POST",
      url: `/blog-posts/${postId}/comments`,
      headers: { cookie: visitorCookie },
      payload: { body: "Awaiting moderation" },
    });

    const queue = await ctx.app.inject({ method: "GET", url: "/admin/approval-queue", headers: { cookie: adminCookie } });
    const commentItems = queue.json().filter((i: { kind: string }) => i.kind === "blog_comment");
    expect(commentItems).toHaveLength(1);
    // The queue's subject for a comment is its post's title.
    expect(commentItems[0].subject).toBe("Queue Post");
  });
});

describe("Article Ratings", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("404s a rating on an unpublished post", async () => {
    const { createPost } = await setup(ctx);
    const { cookie: visitorCookie } = await registerAndGetCookie(ctx, "rater1@example.com");
    const postId = await createPost("Draft", false);
    const response = await ctx.app.inject({
      method: "PUT",
      url: `/blog-posts/${postId}/rating`,
      headers: { cookie: visitorCookie },
      payload: { rating: 5 },
    });
    expect(response.statusCode).toBe(404);
  });

  it("rejects an anonymous rating with 401", async () => {
    const { createPost } = await setup(ctx);
    const postId = await createPost("Post");
    const response = await ctx.app.inject({ method: "PUT", url: `/blog-posts/${postId}/rating`, payload: { rating: 5 } });
    expect(response.statusCode).toBe(401);
  });

  it("rates a post, and re-rating replaces rather than conflicting", async () => {
    const { createPost } = await setup(ctx);
    const { cookie: visitorCookie, userId: visitorId } = await registerAndGetCookie(ctx, "rater2@example.com");
    const postId = await createPost("Post");

    const first = await ctx.app.inject({
      method: "PUT",
      url: `/blog-posts/${postId}/rating`,
      headers: { cookie: visitorCookie },
      payload: { rating: 3 },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ postId, userId: visitorId, rating: 3 });

    const second = await ctx.app.inject({
      method: "PUT",
      url: `/blog-posts/${postId}/rating`,
      headers: { cookie: visitorCookie },
      payload: { rating: 5 },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().rating).toBe(5);

    const { rows } = await ctx.db.query(`SELECT rating FROM article_ratings WHERE post_id = $1 AND user_id = $2`, [postId, visitorId]);
    expect(rows).toEqual([{ rating: 5 }]);
  });

  it("rejects an out-of-range rating with 400", async () => {
    const { createPost } = await setup(ctx);
    const { cookie: visitorCookie } = await registerAndGetCookie(ctx, "rater3@example.com");
    const postId = await createPost("Post");
    const response = await ctx.app.inject({
      method: "PUT",
      url: `/blog-posts/${postId}/rating`,
      headers: { cookie: visitorCookie },
      payload: { rating: 9 },
    });
    expect(response.statusCode).toBe(400);
  });
});
