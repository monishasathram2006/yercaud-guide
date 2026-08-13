import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { requirePermission } from "../../plugins/auth.js";
import { createCategory, deleteCategory, listCategories, updateCategory, type CategoryInput } from "./categories.js";

const categorySchema = {
  body: {
    type: "object",
    required: ["name", "slug"],
    properties: {
      name: { type: "string", minLength: 1 },
      slug: { type: "string", minLength: 1 },
      icon: { type: "string" },
      color: { type: "string" },
      sortOrder: { type: "integer" },
    },
  },
};

export function registerCategoryRoutes(app: FastifyInstance, deps: Required<AppDeps>): void {
  app.get("/categories", async () => {
    return listCategories(deps.db);
  });

  app.post<{ Body: CategoryInput }>(
    "/categories",
    { schema: categorySchema, preHandler: requirePermission(deps.db, "Categories", "create") },
    async (request, reply) => {
      const category = await createCategory(deps.db, request.body);
      return reply.status(201).send(category);
    },
  );

  app.patch<{ Body: CategoryInput; Params: { categoryId: string } }>(
    "/categories/:categoryId",
    { schema: categorySchema, preHandler: requirePermission(deps.db, "Categories", "edit") },
    async (request) => {
      return updateCategory(deps.db, request.params.categoryId, request.body);
    },
  );

  app.delete<{ Params: { categoryId: string } }>(
    "/categories/:categoryId",
    { preHandler: requirePermission(deps.db, "Categories", "delete") },
    async (request, reply) => {
      await deleteCategory(deps.db, request.params.categoryId);
      return reply.status(204).send();
    },
  );
}
