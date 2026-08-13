import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { requirePermission } from "../../plugins/auth.js";
import { createLocation, deleteLocation, listLocations, updateLocation } from "./locations.js";

const nameOnlySchema = {
  body: { type: "object", required: ["name"], properties: { name: { type: "string", minLength: 1 } } },
};

export function registerLocationRoutes(app: FastifyInstance, deps: Required<AppDeps>): void {
  app.get("/locations", async () => {
    return listLocations(deps.db);
  });

  app.post<{ Body: { name: string } }>(
    "/locations",
    { schema: nameOnlySchema, preHandler: requirePermission(deps.db, "Categories", "create") },
    async (request, reply) => {
      const location = await createLocation(deps.db, request.body.name);
      return reply.status(201).send(location);
    },
  );

  app.patch<{ Body: { name: string }; Params: { id: string } }>(
    "/locations/:id",
    { schema: nameOnlySchema, preHandler: requirePermission(deps.db, "Categories", "edit") },
    async (request) => {
      return updateLocation(deps.db, request.params.id, request.body.name);
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/locations/:id",
    { preHandler: requirePermission(deps.db, "Categories", "delete") },
    async (request, reply) => {
      await deleteLocation(deps.db, request.params.id);
      return reply.status(204).send();
    },
  );
}
