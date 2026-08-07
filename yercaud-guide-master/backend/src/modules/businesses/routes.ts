import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { registerBusinessRoutes } from "./business-routes.js";
import { registerBusinessStaffRoutes } from "./staff-routes.js";

export async function registerBusinessesRoutes(app: FastifyInstance, deps: Required<AppDeps>): Promise<void> {
  registerBusinessRoutes(app, deps);
  registerBusinessStaffRoutes(app, deps);
}
