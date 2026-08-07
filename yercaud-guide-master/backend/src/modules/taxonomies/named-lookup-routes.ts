import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { requirePermission } from "../../plugins/auth.js";
import { createNamedLookupService, type NamedLookupTableConfig } from "./named-lookup.js";

interface NamedLookupBody {
  name: string;
  icon?: string;
}

const nameSchema = {
  body: {
    type: "object",
    required: ["name"],
    properties: { name: { type: "string", minLength: 1 }, icon: { type: "string" } },
  },
};

export function registerNamedLookupRoutes(
  app: FastifyInstance,
  deps: Required<AppDeps>,
  path: string,
  config: NamedLookupTableConfig,
): void {
  const service = createNamedLookupService(config);

  app.get(path, async () => {
    return service.list(deps.db);
  });

  app.post<{ Body: NamedLookupBody }>(
    path,
    { schema: nameSchema, preHandler: requirePermission(deps.db, "Categories", "create") },
    async (request, reply) => {
      const entry = await service.create(deps.db, request.body);
      return reply.status(201).send(entry);
    },
  );

  app.patch<{ Body: NamedLookupBody; Params: { id: string } }>(
    `${path}/:id`,
    { schema: nameSchema, preHandler: requirePermission(deps.db, "Categories", "edit") },
    async (request) => {
      return service.update(deps.db, request.params.id, request.body);
    },
  );

  app.delete<{ Params: { id: string } }>(
    `${path}/:id`,
    { preHandler: requirePermission(deps.db, "Categories", "delete") },
    async (request, reply) => {
      await service.remove(deps.db, request.params.id);
      return reply.status(204).send();
    },
  );
}
