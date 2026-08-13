import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { requirePermission } from "../../plugins/auth.js";
import { logAudit } from "../../audit.js";
import {
  createBlogCategory,
  deleteBlogCategory,
  getBlogCategory,
  listBlogCategories,
  updateBlogCategory,
} from "./categories.js";

const nameOnlySchema = {
  body: { type: "object", required: ["name"], properties: { name: { type: "string", minLength: 1 } } },
};

export function registerBlogCategoryRoutes(app: FastifyInstance, deps: Required<AppDeps>): void {
  app.get("/blog-categories", async () => {
    return listBlogCategories(deps.db);
  });

  app.post<{ Body: { name: string } }>(
    "/blog-categories",
    { schema: nameOnlySchema, preHandler: requirePermission(deps.db, "Content", "create") },
    async (request, reply) => {
      const category = await createBlogCategory(deps.db, request.body.name);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "blog_categories.create",
        tableName: "blog_categories",
        recordId: category.id,
        newData: category,
      });
      return reply.status(201).send(category);
    },
  );

  app.patch<{ Params: { categoryId: string }; Body: { name: string } }>(
    "/blog-categories/:categoryId",
    { schema: nameOnlySchema, preHandler: requirePermission(deps.db, "Content", "edit") },
    async (request) => {
      const before = await getBlogCategory(deps.db, request.params.categoryId);
      const category = await updateBlogCategory(deps.db, request.params.categoryId, request.body.name);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "blog_categories.update",
        tableName: "blog_categories",
        recordId: category.id,
        oldData: before,
        newData: category,
      });
      return category;
    },
  );

  app.delete<{ Params: { categoryId: string } }>(
    "/blog-categories/:categoryId",
    { preHandler: requirePermission(deps.db, "Content", "delete") },
    async (request, reply) => {
      const before = await getBlogCategory(deps.db, request.params.categoryId);
      await deleteBlogCategory(deps.db, request.params.categoryId);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "blog_categories.delete",
        tableName: "blog_categories",
        recordId: request.params.categoryId,
        oldData: before,
      });
      return reply.status(204).send();
    },
  );
}
