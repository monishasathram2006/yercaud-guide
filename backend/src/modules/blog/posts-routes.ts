import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppDeps } from "../../app.js";
import { TWITTER_CARD_TYPES } from "../listings/service.js";
import { requirePermission } from "../../plugins/auth.js";
import { userHasPermission } from "../rbac/service.js";
import { logAudit } from "../../audit.js";
import { NotFoundError } from "../../errors.js";
import {
  createBlogPost,
  deleteBlogPost,
  duplicateBlogPost,
  getBlogPost,
  getBlogPostBySlug,
  listBlogPosts,
  publishBlogPost,
  updateBlogPost,
  type BlogPostInput,
  type UpdateBlogPostInput,
} from "./posts.js";

const postFields = {
  categoryId: { type: "string", format: "uuid" },
  title: { type: "string", minLength: 1 },
  excerpt: { type: "string", nullable: true },
  body: { type: "string", minLength: 1 },
  coverImage: { type: "string", nullable: true },
  seoTitle: { type: "string", nullable: true },
  seoDescription: { type: "string", nullable: true },
  // FR189, closed in Phase 10. A URL to an already-hosted image, not an upload.
  ogImage: { type: "string", nullable: true },
  // Validated here, not by a CHECK constraint — same as a Listing's. Rejecting
  // an unknown card type at write time beats discovering at share time that the
  // meta tag was ignored.
  twitterCard: { type: "string", enum: TWITTER_CARD_TYPES, nullable: true },
  relatedPostIds: { type: "array", items: { type: "string", format: "uuid" } },
  placeListingIds: { type: "array", items: { type: "string", format: "uuid" } },
  tags: { type: "array", items: { type: "string", minLength: 1 } },
};

const postCreateSchema = {
  body: { type: "object", required: ["categoryId", "title", "body"], properties: postFields },
};

const postUpdateSchema = {
  body: {
    type: "object",
    properties: {
      ...postFields,
      status: { type: "string", enum: ["draft", "pending", "published"] },
      // Scheduling: a future date holds the post out of the public feed
      // until it passes — see listBlogPosts' published_at <= NOW() check.
      publishedAt: { type: "string", format: "date-time" },
    },
  },
};

const listSchema = {
  querystring: {
    type: "object",
    properties: {
      q: { type: "string" },
      category: { type: "string" },
      status: { type: "string", enum: ["draft", "pending", "published"] },
      page: { type: "integer", minimum: 1, default: 1 },
      pageSize: { type: "integer", minimum: 1, maximum: 100, default: 20 },
    },
  },
};

interface ListQuery {
  q?: string;
  category?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export function registerBlogPostRoutes(app: FastifyInstance, deps: Required<AppDeps>): void {
  app.get<{ Querystring: ListQuery }>("/blog-posts", { schema: listSchema }, async (request) => {
    const callerId = request.currentUser?.id;
    const includeAll = callerId ? await userHasPermission(deps.db, callerId, "Content", "view") : false;
    return listBlogPosts(deps.db, {
      q: request.query.q,
      category: request.query.category,
      status: request.query.status,
      includeAll,
      page: request.query.page ?? 1,
      pageSize: request.query.pageSize ?? 20,
    });
  });

  app.post<{ Body: BlogPostInput }>(
    "/blog-posts",
    { schema: postCreateSchema, preHandler: requirePermission(deps.db, "Content", "create") },
    async (request, reply) => {
      const post = await createBlogPost(deps.db, request.currentUser!.id, request.body);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "blog_posts.create",
        tableName: "blog_posts",
        recordId: post.id,
        newData: { title: post.title, slug: post.slug, status: post.status },
      });
      return reply.status(201).send(post);
    },
  );

  async function assertVisible(request: FastifyRequest, post: { status: string; publishedAt: string | null }): Promise<void> {
    // A scheduled post (status='published', publishedAt in the future) isn't
    // actually live yet — same rule listBlogPosts' public branch enforces.
    const isLive = post.status === "published" && post.publishedAt !== null && new Date(post.publishedAt) <= new Date();
    if (isLive) return;
    const callerId = request.currentUser?.id;
    const isAdmin = callerId ? await userHasPermission(deps.db, callerId, "Content", "view") : false;
    if (!isAdmin) {
      // 404, not 403 — an unpublished post shouldn't confirm its own existence.
      throw new NotFoundError("Blog post not found");
    }
  }

  app.get<{ Params: { postId: string } }>("/blog-posts/:postId", async (request) => {
    const post = await getBlogPost(deps.db, request.params.postId);
    await assertVisible(request, post);
    return post;
  });

  // The public site addresses Blog Posts by slug (readable, keyword-bearing
  // URLs) — same reasoning as GET /listings/by-slug/:slug. A separate path
  // rather than overloading :postId, so a slug that happens to look like a
  // UUID is never ambiguous.
  app.get<{ Params: { slug: string } }>("/blog-posts/by-slug/:slug", async (request) => {
    const post = await getBlogPostBySlug(deps.db, request.params.slug);
    await assertVisible(request, post);
    return post;
  });

  app.patch<{ Params: { postId: string }; Body: UpdateBlogPostInput }>(
    "/blog-posts/:postId",
    { schema: postUpdateSchema, preHandler: requirePermission(deps.db, "Content", "edit") },
    async (request) => {
      const before = await getBlogPost(deps.db, request.params.postId);
      const post = await updateBlogPost(deps.db, request.params.postId, request.body);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "blog_posts.update",
        tableName: "blog_posts",
        recordId: post.id,
        oldData: { title: before.title, status: before.status },
        newData: { title: post.title, status: post.status },
      });
      return post;
    },
  );

  app.post<{ Params: { postId: string } }>(
    "/blog-posts/:postId/publish",
    { preHandler: requirePermission(deps.db, "Content", "publish") },
    async (request) => {
      const before = await getBlogPost(deps.db, request.params.postId);
      const post = await publishBlogPost(deps.db, request.params.postId);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "blog_posts.publish",
        tableName: "blog_posts",
        recordId: post.id,
        oldData: { status: before.status, publishedAt: before.publishedAt },
        newData: { status: post.status, publishedAt: post.publishedAt },
      });
      return post;
    },
  );

  app.post<{ Params: { postId: string } }>(
    "/blog-posts/:postId/duplicate",
    { preHandler: requirePermission(deps.db, "Content", "create") },
    async (request, reply) => {
      const post = await duplicateBlogPost(deps.db, request.params.postId, request.currentUser!.id);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "blog_posts.duplicate",
        tableName: "blog_posts",
        recordId: post.id,
        newData: { title: post.title, slug: post.slug, duplicatedFrom: request.params.postId },
      });
      return reply.status(201).send(post);
    },
  );

  app.delete<{ Params: { postId: string } }>(
    "/blog-posts/:postId",
    { preHandler: requirePermission(deps.db, "Content", "delete") },
    async (request, reply) => {
      const before = await getBlogPost(deps.db, request.params.postId);
      await deleteBlogPost(deps.db, request.params.postId);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "blog_posts.delete",
        tableName: "blog_posts",
        recordId: request.params.postId,
        oldData: { title: before.title, slug: before.slug, status: before.status },
      });
      return reply.status(204).send();
    },
  );
}
