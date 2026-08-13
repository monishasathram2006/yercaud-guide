import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { requirePermission } from "../../plugins/auth.js";
import { createPriceBand, deletePriceBand, listPriceBands, updatePriceBand } from "./price-bands.js";

interface PriceBandBody {
  label: string;
  minAmount: number;
  maxAmount?: number;
}

const priceBandSchema = {
  body: {
    type: "object",
    required: ["label", "minAmount"],
    properties: {
      label: { type: "string", minLength: 1 },
      minAmount: { type: "integer", minimum: 0 },
      maxAmount: { type: "integer", minimum: 0 },
    },
  },
};

export function registerPriceBandRoutes(app: FastifyInstance, deps: Required<AppDeps>): void {
  app.get("/price-bands", async () => {
    return listPriceBands(deps.db);
  });

  app.post<{ Body: PriceBandBody }>(
    "/price-bands",
    { schema: priceBandSchema, preHandler: requirePermission(deps.db, "Categories", "create") },
    async (request, reply) => {
      const priceBand = await createPriceBand(deps.db, request.body);
      return reply.status(201).send(priceBand);
    },
  );

  app.patch<{ Body: PriceBandBody; Params: { id: string } }>(
    "/price-bands/:id",
    { schema: priceBandSchema, preHandler: requirePermission(deps.db, "Categories", "edit") },
    async (request) => {
      return updatePriceBand(deps.db, request.params.id, request.body);
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/price-bands/:id",
    { preHandler: requirePermission(deps.db, "Categories", "delete") },
    async (request, reply) => {
      await deletePriceBand(deps.db, request.params.id);
      return reply.status(204).send();
    },
  );
}
