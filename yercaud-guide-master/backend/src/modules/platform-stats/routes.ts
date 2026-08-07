import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { getPlatformStats } from "./service.js";

/** Public — the home page's real stat tiles, no auth. */
export function registerPlatformStatsRoutes(app: FastifyInstance, deps: Required<AppDeps>): void {
  app.get("/platform-stats", async () => {
    return getPlatformStats(deps.db);
  });
}
