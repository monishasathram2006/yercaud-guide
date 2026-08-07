import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { registerFaqCategoryRoutes } from "./categories-routes.js";
import { registerFaqEntryRoutes } from "./faqs-routes.js";

export async function registerFaqRoutes(app: FastifyInstance, deps: Required<AppDeps>): Promise<void> {
  registerFaqCategoryRoutes(app, deps);
  registerFaqEntryRoutes(app, deps);
}
