import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { requirePermission } from "../../plugins/auth.js";
import {
  createCategoryAttribute,
  deleteCategoryAttribute,
  listCategoryAttributes,
  updateCategoryAttribute,
  type CategoryAttributeInput,
} from "./category-attributes.js";

// A 'select' field is meaningless without choices — enforced here, not left
// to the DB (ADR 0004: this whole feature is meant to be cheap, but a select
// field with zero options would just break whatever renders it).
const categoryAttributeSchema = {
  body: {
    type: "object",
    required: ["name", "fieldType"],
    properties: {
      name: { type: "string", minLength: 1 },
      fieldType: { type: "string", enum: ["text", "number", "boolean", "select"] },
      options: { type: "array", items: { type: "string" } },
      isRequired: { type: "boolean" },
      sortOrder: { type: "integer" },
    },
    if: { properties: { fieldType: { const: "select" } } },
    then: { required: ["options"], properties: { options: { type: "array", items: { type: "string" }, minItems: 1 } } },
  },
};

export function registerCategoryAttributeRoutes(app: FastifyInstance, deps: Required<AppDeps>): void {
  app.get<{ Params: { categoryId: string } }>("/categories/:categoryId/attributes", async (request) => {
    return listCategoryAttributes(deps.db, request.params.categoryId);
  });

  app.post<{ Body: CategoryAttributeInput; Params: { categoryId: string } }>(
    "/categories/:categoryId/attributes",
    { schema: categoryAttributeSchema, preHandler: requirePermission(deps.db, "Categories", "create") },
    async (request, reply) => {
      const attribute = await createCategoryAttribute(deps.db, request.params.categoryId, request.body);
      return reply.status(201).send(attribute);
    },
  );

  app.patch<{ Body: CategoryAttributeInput; Params: { categoryId: string; attributeId: string } }>(
    "/categories/:categoryId/attributes/:attributeId",
    { schema: categoryAttributeSchema, preHandler: requirePermission(deps.db, "Categories", "edit") },
    async (request) => {
      return updateCategoryAttribute(deps.db, request.params.attributeId, request.body);
    },
  );

  app.delete<{ Params: { categoryId: string; attributeId: string } }>(
    "/categories/:categoryId/attributes/:attributeId",
    { preHandler: requirePermission(deps.db, "Categories", "delete") },
    async (request, reply) => {
      await deleteCategoryAttribute(deps.db, request.params.attributeId);
      return reply.status(204).send();
    },
  );
}
