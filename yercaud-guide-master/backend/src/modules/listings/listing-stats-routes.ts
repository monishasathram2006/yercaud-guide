import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { requireOwnerOrPermission } from "../../plugins/auth.js";
import { loadListingOwnerId } from "./service.js";
import { getListingStats } from "./listing-stats.js";

/**
 * A Business Owner's own view of what's driving their Listing's Featured
 * eligibility (issue #24) — same owner-or-permission gate as every other
 * owner-scoped Listing sub-resource (edit, images, taxonomy, details).
 */
export function registerListingStatsRoutes(app: FastifyInstance, deps: Required<AppDeps>): void {
  app.get<{ Params: { listingId: string } }>(
    "/listings/:listingId/stats",
    { preHandler: requireOwnerOrPermission(deps.db, "listingId", loadListingOwnerId, "Listings", "edit") },
    async (request) => {
      return getListingStats(deps.db, request.params.listingId);
    },
  );
}
