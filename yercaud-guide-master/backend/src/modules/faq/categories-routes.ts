import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { requirePermission } from "../../plugins/auth.js";
import { logAudit } from "../../audit.js";
import {
  createFaqCategory,
  deleteFaqCategory,
  getFaqCategory,
  listFaqCategories,
  updateFaqCategory,
  type FaqCategoryInput,
} from "./categories.js";

const createSchema = {
  body: {
    type: "object",
    required: ["name"],
    properties: { name: { type: "string", minLength: 1 }, sortOrder: { type: "integer" } },
  },
};

const updateSchema = {
  body: { type: "object", properties: { name: { type: "string", minLength: 1 }, sortOrder: { type: "integer" } } },
};

export function registerFaqCategoryRoutes(app: FastifyInstance, deps: Required<AppDeps>): void {
  app.get("/faq-categories", async () => {
    return listFaqCategories(deps.db);
  });

  app.post<{ Body: FaqCategoryInput }>(
    "/faq-categories",
    { schema: createSchema, preHandler: requirePermission(deps.db, "Content", "create") },
    async (request, reply) => {
      const category = await createFaqCategory(deps.db, request.body);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "faq_categories.create",
        tableName: "faq_categories",
        recordId: category.id,
        newData: category,
      });
      return reply.status(201).send(category);
    },
  );

  app.patch<{ Params: { categoryId: string }; Body: Partial<FaqCategoryInput> }>(
    "/faq-categories/:categoryId",
    { schema: updateSchema, preHandler: requirePermission(deps.db, "Content", "edit") },
    async (request) => {
      const before = await getFaqCategory(deps.db, request.params.categoryId);
      const category = await updateFaqCategory(deps.db, request.params.categoryId, request.body);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "faq_categories.update",
        tableName: "faq_categories",
        recordId: category.id,
        oldData: before,
        newData: category,
      });
      return category;
    },
  );

  app.delete<{ Params: { categoryId: string } }>(
    "/faq-categories/:categoryId",
    { preHandler: requirePermission(deps.db, "Content", "delete") },
    async (request, reply) => {
      const before = await getFaqCategory(deps.db, request.params.categoryId);
      await deleteFaqCategory(deps.db, request.params.categoryId);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "faq_categories.delete",
        tableName: "faq_categories",
        recordId: request.params.categoryId,
        oldData: before,
      });
      return reply.status(204).send();
    },
  );
}
