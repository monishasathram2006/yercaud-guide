import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { requireAuth } from "../../plugins/auth.js";
import { logContactReveal } from "./contact-reveals.js";

/**
 * The write side of the contact-info gate (issue #15). The frontend calls
 * this once it actually renders a Listing's real (unblurred) contact info to
 * a signed-in visitor on the detail page — not from the search/grid cards,
 * where a blurred card scrolling past is browsing, not intent.
 *
 * Fire-and-forget by design: 204 either way, so a slow or failed write never
 * blocks or breaks the page that's already showing the contact info.
 */
export function registerContactRevealRoutes(app: FastifyInstance, deps: Required<AppDeps>): void {
  app.post<{ Params: { listingId: string } }>(
    "/listings/:listingId/contact-reveal",
    { preHandler: requireAuth },
    async (request, reply) => {
      await logContactReveal(deps.db, request.params.listingId, request.currentUser!.id);
      return reply.status(204).send();
    },
  );
}
