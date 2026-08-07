import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { requirePermission } from "../../plugins/auth.js";
import { logAudit } from "../../audit.js";
import { createFaq, deleteFaq, getFaq, listFaqs, updateFaq, type FaqInput } from "./faqs.js";

const faqFields = {
  categoryId: { type: "string", format: "uuid" },
  question: { type: "string", minLength: 1 },
  answer: { type: "string", minLength: 1 },
  sortOrder: { type: "integer" },
};

const createSchema = {
  body: { type: "object", required: ["categoryId", "question", "answer"], properties: faqFields },
};

const updateSchema = { body: { type: "object", properties: faqFields } };

export function registerFaqEntryRoutes(app: FastifyInstance, deps: Required<AppDeps>): void {
  app.get<{ Querystring: { category?: string } }>("/faqs", async (request) => {
    return listFaqs(deps.db, request.query.category);
  });

  app.post<{ Body: FaqInput }>(
    "/faqs",
    { schema: createSchema, preHandler: requirePermission(deps.db, "Content", "create") },
    async (request, reply) => {
      const faq = await createFaq(deps.db, request.body);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "faqs.create",
        tableName: "faqs",
        recordId: faq.id,
        newData: faq,
      });
      return reply.status(201).send(faq);
    },
  );

  app.patch<{ Params: { faqId: string }; Body: Partial<FaqInput> }>(
    "/faqs/:faqId",
    { schema: updateSchema, preHandler: requirePermission(deps.db, "Content", "edit") },
    async (request) => {
      const before = await getFaq(deps.db, request.params.faqId);
      const faq = await updateFaq(deps.db, request.params.faqId, request.body);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "faqs.update",
        tableName: "faqs",
        recordId: faq.id,
        oldData: before,
        newData: faq,
      });
      return faq;
    },
  );

  app.delete<{ Params: { faqId: string } }>(
    "/faqs/:faqId",
    { preHandler: requirePermission(deps.db, "Content", "delete") },
    async (request, reply) => {
      const before = await getFaq(deps.db, request.params.faqId);
      await deleteFaq(deps.db, request.params.faqId);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "faqs.delete",
        tableName: "faqs",
        recordId: request.params.faqId,
        oldData: before,
      });
      return reply.status(204).send();
    },
  );
}
