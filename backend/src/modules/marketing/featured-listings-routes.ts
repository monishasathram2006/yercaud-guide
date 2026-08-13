import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { requirePermission } from "../../plugins/auth.js";
import { requireApprovedListing } from "../listings/service.js";
import { logAudit } from "../../audit.js";
import {
  createSponsoredPlacement,
  deleteSponsoredPlacement,
  getSponsoredPlacement,
  listActiveSponsoredPlacements,
  updateSponsoredPlacement,
  type SponsoredPlacementInput,
  type UpdateSponsoredPlacementInput,
} from "./featured-listings.js";

const sponsoredPlacementInputSchema = {
  body: {
    type: "object",
    required: ["listingId", "startDate"],
    properties: {
      listingId: { type: "string", format: "uuid" },
      startDate: { type: "string", format: "date" },
      endDate: { type: "string", format: "date", nullable: true },
      sortOrder: { type: "integer" },
    },
  },
};

const sponsoredPlacementUpdateSchema = {
  body: {
    type: "object",
    properties: {
      startDate: { type: "string", format: "date" },
      endDate: { type: "string", format: "date", nullable: true },
      sortOrder: { type: "integer" },
    },
  },
};

/**
 * Sponsored placements (issue #22, ADR-0012) — a Business Owner pays
 * off-platform (ADR-0001), and a Super Admin marks their Listing Sponsored
 * for an agreed date range. Same route paths as the flat "Featured
 * Listings" tooling this repurposes (no reason to churn the URL along with
 * the meaning); Admin's UI copy catches up in issue #23. No ownership
 * branch here either — a Business Owner still can't grant this to
 * themselves, only pay for it and have a Super Admin apply it.
 */
export function registerFeaturedListingRoutes(app: FastifyInstance, deps: Required<AppDeps>): void {
  app.get("/featured-listings", async () => {
    return listActiveSponsoredPlacements(deps.db);
  });

  app.post<{ Body: SponsoredPlacementInput }>(
    "/featured-listings",
    { schema: sponsoredPlacementInputSchema, preHandler: requirePermission(deps.db, "Marketing", "create") },
    async (request, reply) => {
      await requireApprovedListing(deps.db, request.body.listingId);
      const placement = await createSponsoredPlacement(deps.db, request.body);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "sponsored_placements.create",
        tableName: "featured_listings",
        recordId: placement.id,
        newData: placement,
      });
      return reply.status(201).send(placement);
    },
  );

  app.patch<{ Params: { featuredId: string }; Body: UpdateSponsoredPlacementInput }>(
    "/featured-listings/:featuredId",
    { schema: sponsoredPlacementUpdateSchema, preHandler: requirePermission(deps.db, "Marketing", "edit") },
    async (request) => {
      const before = await getSponsoredPlacement(deps.db, request.params.featuredId);
      const placement = await updateSponsoredPlacement(deps.db, request.params.featuredId, request.body);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "sponsored_placements.update",
        tableName: "featured_listings",
        recordId: placement.id,
        oldData: before,
        newData: placement,
      });
      return placement;
    },
  );

  app.delete<{ Params: { featuredId: string } }>(
    "/featured-listings/:featuredId",
    { preHandler: requirePermission(deps.db, "Marketing", "delete") },
    async (request, reply) => {
      const before = await getSponsoredPlacement(deps.db, request.params.featuredId);
      await deleteSponsoredPlacement(deps.db, request.params.featuredId);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "sponsored_placements.delete",
        tableName: "featured_listings",
        recordId: request.params.featuredId,
        oldData: before,
      });
      return reply.status(204).send();
    },
  );
}
