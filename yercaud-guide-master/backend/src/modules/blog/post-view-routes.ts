import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { getOrSetVisitorId } from "../../lib/visitor-id.js";
import { recordBlogPostView } from "./post-views.js";

/**
 * The write side of Blog Post View tracking (issue #18). Public — no
 * requireAuth — since Views must be counted for anonymous visitors too, same
 * as Listing View tracking (listing-view-routes.ts).
 *
 * Fire-and-forget by design: 204 either way, so a slow or failed write never
 * blocks or breaks the page that's already loaded.
 */
export function registerBlogPostViewRoutes(app: FastifyInstance, deps: Required<AppDeps>): void {
  app.post<{ Params: { postId: string } }>("/blog-posts/:postId/view", async (request, reply) => {
    const visitorId = getOrSetVisitorId(request, reply);
    await recordBlogPostView(deps.db, request.params.postId, visitorId);
    return reply.status(204).send();
  });
}
