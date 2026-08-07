import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { requireAuth } from "../../plugins/auth.js";
import { listFavoriteListingSummaries, requireApprovedListing } from "../listings/service.js";
import { addFavorite, removeFavorite } from "./service.js";

export async function registerFavoritesRoutes(app: FastifyInstance, deps: Required<AppDeps>): Promise<void> {
  app.get("/me/favorites", { preHandler: requireAuth }, async (request) => {
    return listFavoriteListingSummaries(deps.db, request.currentUser!.id);
  });

  app.post<{ Params: { listingId: string } }>(
    "/listings/:listingId/favorite",
    { preHandler: requireAuth },
    async (request, reply) => {
      await requireApprovedListing(deps.db, request.params.listingId);
      await addFavorite(deps.db, request.currentUser!.id, request.params.listingId);
      return reply.status(204).send();
    },
  );

  app.delete<{ Params: { listingId: string } }>(
    "/listings/:listingId/favorite",
    { preHandler: requireAuth },
    async (request, reply) => {
      await removeFavorite(deps.db, request.currentUser!.id, request.params.listingId);
      return reply.status(204).send();
    },
  );
}
