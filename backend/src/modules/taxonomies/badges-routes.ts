import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { requirePermission } from "../../plugins/auth.js";
import { createBadge, deleteBadge, listBadges, updateBadge, type BadgeInput } from "./badges.js";

const badgeSchema = {
  body: {
    type: "object",
    required: ["label"],
    properties: {
      label: { type: "string", minLength: 1 },
      color: { type: "string", nullable: true },
      sortOrder: { type: "integer" },
    },
  },
};

export function registerBadgeRoutes(app: FastifyInstance, deps: Required<AppDeps>): void {
  // Public: the directory styles every badge it renders from this list, and a
  // card is visible to anonymous visitors.
  app.get("/badges", async () => {
    return listBadges(deps.db);
  });

  // Guarded by `Categories`, the permission every other master taxonomy uses
  // (price bands, property types, amenities) — there is no `Taxonomies` module
  // in the permission set.
  app.post<{ Body: BadgeInput }>(
    "/badges",
    { schema: badgeSchema, preHandler: requirePermission(deps.db, "Categories", "create") },
    async (request, reply) => {
      const badge = await createBadge(deps.db, request.body);
      return reply.status(201).send(badge);
    },
  );

  app.patch<{ Body: BadgeInput; Params: { badgeId: string } }>(
    "/badges/:badgeId",
    { schema: badgeSchema, preHandler: requirePermission(deps.db, "Categories", "edit") },
    async (request) => {
      return updateBadge(deps.db, request.params.badgeId, request.body);
    },
  );

  app.delete<{ Params: { badgeId: string } }>(
    "/badges/:badgeId",
    { preHandler: requirePermission(deps.db, "Categories", "delete") },
    async (request, reply) => {
      await deleteBadge(deps.db, request.params.badgeId);
      return reply.status(204).send();
    },
  );
}
