import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { requireAuth, requireOwnerOrPermission } from "../../plugins/auth.js";
import { userHasPermission } from "../rbac/service.js";
import { loadListingOwnerId, requireApprovedListing } from "../listings/service.js";
import { ForbiddenError, NotFoundError } from "../../errors.js";
import {
  createPromotion,
  deletePromotion,
  getPromotion,
  isPromotionPubliclyVisible,
  listPromotions,
  loadPromotionOwnerId,
  updatePromotion,
  type PromotionInput,
  type UpdatePromotionInput,
} from "./promotions.js";

const promotionInputSchema = {
  body: {
    type: "object",
    required: ["listingId", "title", "startDate", "endDate"],
    properties: {
      listingId: { type: "string", format: "uuid" },
      title: { type: "string", minLength: 1 },
      discountPercent: { type: "integer", minimum: 0, maximum: 100 },
      startDate: { type: "string", format: "date" },
      endDate: { type: "string", format: "date" },
      imageUrl: { type: "string" },
    },
  },
};

const promotionUpdateSchema = {
  body: {
    type: "object",
    properties: {
      title: { type: "string", minLength: 1 },
      discountPercent: { type: "integer", minimum: 0, maximum: 100, nullable: true },
      startDate: { type: "string", format: "date" },
      endDate: { type: "string", format: "date" },
      imageUrl: { type: "string", nullable: true },
      status: { type: "string", enum: ["draft", "pending", "active", "expired"] },
    },
  },
};

export function registerPromotionRoutes(app: FastifyInstance, deps: Required<AppDeps>): void {
  app.get<{ Querystring: { listingId?: string } }>("/promotions", async (request) => {
    const callerId = request.currentUser?.id;
    const includeAll = callerId ? await userHasPermission(deps.db, callerId, "Marketing", "view") : false;
    return listPromotions(deps.db, { listingId: request.query.listingId, callerId, includeAll });
  });

  app.post<{ Body: PromotionInput }>(
    "/promotions",
    { schema: promotionInputSchema, preHandler: requireAuth },
    async (request, reply) => {
      await requireApprovedListing(deps.db, request.body.listingId);
      // Body-driven ownership check (the target Listing comes from the payload,
      // not a URL param, so requireOwnerOrPermission can't do this) — same
      // shape as POST /listings' requireOwnsBusiness in Phase 4.
      const ownerId = await loadListingOwnerId(deps.db, request.body.listingId);
      if (ownerId !== request.currentUser!.id) {
        const isAdmin = await userHasPermission(deps.db, request.currentUser!.id, "Marketing", "edit");
        if (!isAdmin) {
          throw new ForbiddenError("You can only promote your own Listings");
        }
      }
      const promotion = await createPromotion(deps.db, request.body);
      return reply.status(201).send(promotion);
    },
  );

  app.get<{ Params: { promotionId: string } }>("/promotions/:promotionId", async (request) => {
    const promotion = await getPromotion(deps.db, request.params.promotionId);
    if (!(await isPromotionPubliclyVisible(deps.db, promotion.id))) {
      const callerId = request.currentUser?.id;
      const isOwner = callerId ? (await loadPromotionOwnerId(deps.db, promotion.id)) === callerId : false;
      const isAdmin = callerId ? await userHasPermission(deps.db, callerId, "Marketing", "view") : false;
      if (!isOwner && !isAdmin) {
        // 404, not 403 — a non-public Promotion shouldn't confirm its own
        // existence, same as an unapproved Listing (Phase 4).
        throw new NotFoundError("Promotion not found");
      }
    }
    return promotion;
  });

  app.patch<{ Params: { promotionId: string }; Body: UpdatePromotionInput }>(
    "/promotions/:promotionId",
    {
      schema: promotionUpdateSchema,
      preHandler: requireOwnerOrPermission(deps.db, "promotionId", loadPromotionOwnerId, "Marketing", "edit"),
    },
    async (request) => {
      const isAdmin = await userHasPermission(deps.db, request.currentUser!.id, "Marketing", "edit");
      return updatePromotion(deps.db, request.params.promotionId, request.body, isAdmin);
    },
  );

  app.delete<{ Params: { promotionId: string } }>(
    "/promotions/:promotionId",
    { preHandler: requireOwnerOrPermission(deps.db, "promotionId", loadPromotionOwnerId, "Marketing", "delete") },
    async (request, reply) => {
      await deletePromotion(deps.db, request.params.promotionId);
      return reply.status(204).send();
    },
  );
}
