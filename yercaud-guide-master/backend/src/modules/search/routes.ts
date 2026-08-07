import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { hybridSearch } from "./service.js";

interface SearchQuery {
  q: string;
  category?: string;
  mode?: "full" | "quick";
  pageSize?: number;
}

const searchSchema = {
  querystring: {
    type: "object",
    required: ["q"],
    properties: {
      q: { type: "string", minLength: 1 },
      category: { type: "string" },
      mode: { type: "string", enum: ["full", "quick"] },
      pageSize: { type: "integer", minimum: 1, maximum: 50, default: 20 },
    },
  },
};

export function registerSearchRoutes(app: FastifyInstance, deps: Required<AppDeps>): void {
  // Public: no preHandler. The global onRequest hook still resolves a session
  // cookie into request.currentUser when present, which is what lets a signed-in
  // Business Owner see their own pending rows in results.
  app.get<{ Querystring: SearchQuery }>("/search", { schema: searchSchema }, async (request) => {
    return hybridSearch(deps.db, deps.embeddingProvider, {
      q: request.query.q,
      category: request.query.category,
      mode: request.query.mode === "quick" ? "quick" : "full",
      pageSize: request.query.pageSize ?? 20,
      callerId: request.currentUser?.id,
    });
  });
}
