import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { requireAuth, requireOwnerOrPermission, requirePermission } from "../../plugins/auth.js";
import { requireApprovedListing } from "../listings/service.js";
import { logAudit } from "../../audit.js";
import {
  approveReview,
  editOwnReview,
  getReview,
  listApprovedReviews,
  listMyReviews,
  listReviews,
  loadReviewOwnerId,
  rejectReview,
  replyToReview,
  reportReview,
  submitReview,
  type ReviewInput,
} from "./service.js";

const reviewInputSchema = {
  body: {
    type: "object",
    required: ["rating", "text"],
    properties: {
      rating: { type: "integer", minimum: 1, maximum: 5 },
      text: { type: "string", minLength: 1 },
    },
  },
};

const replySchema = {
  body: {
    type: "object",
    required: ["text"],
    properties: { text: { type: "string", minLength: 1 } },
  },
};

const reportSchema = {
  body: {
    type: "object",
    required: ["reason"],
    properties: { reason: { type: "string", minLength: 1 } },
  },
};

export async function registerReviewsRoutes(app: FastifyInstance, deps: Required<AppDeps>): Promise<void> {
  app.get<{ Params: { listingId: string } }>("/listings/:listingId/reviews", async (request) => {
    return listApprovedReviews(deps.db, request.params.listingId);
  });

  app.post<{ Params: { listingId: string }; Body: ReviewInput }>(
    "/listings/:listingId/reviews",
    { schema: reviewInputSchema, preHandler: requireAuth },
    async (request, reply) => {
      await requireApprovedListing(deps.db, request.params.listingId);
      const review = await submitReview(deps.db, request.params.listingId, request.currentUser!.id, request.body);
      return reply.status(201).send(review);
    },
  );

  app.patch<{ Params: { reviewId: string }; Body: ReviewInput }>(
    "/reviews/:reviewId",
    { schema: reviewInputSchema, preHandler: requireAuth },
    async (request) => {
      return editOwnReview(deps.db, request.params.reviewId, request.currentUser!.id, request.body);
    },
  );

  app.get<{ Querystring: { status?: string } }>(
    "/reviews",
    { preHandler: requirePermission(deps.db, "Reviews", "view") },
    async (request) => {
      return listReviews(deps.db, request.query.status);
    },
  );

  app.get("/me/reviews", { preHandler: requireAuth }, async (request) => {
    return listMyReviews(deps.db, request.currentUser!.id);
  });

  app.post<{ Params: { reviewId: string } }>(
    "/reviews/:reviewId/approve",
    { preHandler: requirePermission(deps.db, "Reviews", "approve") },
    async (request) => {
      const before = await getReview(deps.db, request.params.reviewId);
      const review = await approveReview(deps.db, request.params.reviewId);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "reviews.approve",
        tableName: "reviews",
        recordId: review.id,
        oldData: { status: before.status },
        newData: { status: review.status },
      });
      return review;
    },
  );

  app.post<{ Params: { reviewId: string } }>(
    "/reviews/:reviewId/reject",
    { preHandler: requirePermission(deps.db, "Reviews", "approve") },
    async (request) => {
      const before = await getReview(deps.db, request.params.reviewId);
      const review = await rejectReview(deps.db, request.params.reviewId);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "reviews.reject",
        tableName: "reviews",
        recordId: review.id,
        oldData: { status: before.status },
        newData: { status: review.status },
      });
      return review;
    },
  );

  app.post<{ Params: { reviewId: string }; Body: { text: string } }>(
    "/reviews/:reviewId/reply",
    {
      schema: replySchema,
      preHandler: requireOwnerOrPermission(deps.db, "reviewId", loadReviewOwnerId, "Reviews", "edit"),
    },
    async (request) => {
      return replyToReview(deps.db, request.params.reviewId, request.body.text);
    },
  );

  app.post<{ Params: { reviewId: string }; Body: { reason: string } }>(
    "/reviews/:reviewId/report",
    { schema: reportSchema, preHandler: requireAuth },
    async (request, reply) => {
      await reportReview(deps.db, request.params.reviewId, request.currentUser!.id, request.body.reason);
      return reply.status(201).send({ reported: true });
    },
  );
}
