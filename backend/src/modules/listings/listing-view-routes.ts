import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { getOrSetVisitorId } from "../../lib/visitor-id.js";
import { recordListingView } from "./listing-views.js";

/**
 * The write side of Listing View tracking (issue #16). Deliberately public —
 * no requireAuth — since Views must be counted for anonymous visitors too;
 * the owner-skip check reads request.currentUser directly, which auth.ts's
 * onRequest hook populates (nullable) on every request regardless of whether
 * a route requires auth.
 *
 * Fire-and-forget by design: 204 either way, so a slow or failed write never
 * blocks or breaks the page that's already loaded.
 */
export function registerListingViewRoutes(app: FastifyInstance, deps: Required<AppDeps>): void {
  app.post<{ Params: { listingId: string } }>("/listings/:listingId/view", async (request, reply) => {
    const visitorId = getOrSetVisitorId(request, reply);
    await recordListingView(deps.db, request.params.listingId, visitorId, request.currentUser?.id ?? null);
    return reply.status(204).send();
  });
}
