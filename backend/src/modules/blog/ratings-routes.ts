import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { requireAuth } from "../../plugins/auth.js";
import { requirePublishedPost } from "./posts.js";
import { rateArticle } from "./ratings.js";

const ratingSchema = {
  body: {
    type: "object",
    required: ["rating"],
    properties: { rating: { type: "integer", minimum: 1, maximum: 5 } },
  },
};

/** Rating is requireAuth-only (any signed-in visitor, routinely) — not audit-logged, same as submitting a Review. */
export function registerBlogRatingRoutes(app: FastifyInstance, deps: Required<AppDeps>): void {
  app.put<{ Params: { postId: string }; Body: { rating: number } }>(
    "/blog-posts/:postId/rating",
    { schema: ratingSchema, preHandler: requireAuth },
    async (request) => {
      await requirePublishedPost(deps.db, request.params.postId);
      return rateArticle(deps.db, request.params.postId, request.currentUser!.id, request.body.rating);
    },
  );
}
