import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { requireOwnerOrPermission } from "../../plugins/auth.js";
import { loadListingOwnerId } from "./service.js";
import type { createChildCollectionService } from "./child-collection.js";

/** Registers POST/PATCH/DELETE for one child collection nested under `/listings/:listingId/...`. */
export function registerChildCollectionRoutes(
  app: FastifyInstance,
  deps: Required<AppDeps>,
  path: string,
  service: ReturnType<typeof createChildCollectionService>,
  createSchema: object,
  updateSchema: object,
): void {
  const guard = requireOwnerOrPermission(deps.db, "listingId", loadListingOwnerId, "Listings", "edit");

  app.post<{ Params: { listingId: string }; Body: Record<string, unknown> }>(
    path,
    { schema: createSchema, preHandler: guard },
    async (request, reply) => {
      const item = await service.create(deps.db, request.params.listingId, request.body);
      return reply.status(201).send(item);
    },
  );

  app.patch<{ Params: { listingId: string; childId: string }; Body: Record<string, unknown> }>(
    `${path}/:childId`,
    { schema: updateSchema, preHandler: guard },
    async (request) => {
      return service.update(deps.db, request.params.listingId, request.params.childId, request.body);
    },
  );

  app.delete<{ Params: { listingId: string; childId: string } }>(
    `${path}/:childId`,
    { preHandler: guard },
    async (request, reply) => {
      await service.remove(deps.db, request.params.listingId, request.params.childId);
      return reply.status(204).send();
    },
  );
}
