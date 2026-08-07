import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { getFeaturedSections } from "./read.js";

/**
 * The read side of Featured Sections (issue #19, #15). Public — no auth —
 * and reads only the precomputed featured_rankings table, never aggregating
 * rating/interaction signals live per request.
 */
export function registerFeaturedRoutes(app: FastifyInstance, deps: Required<AppDeps>): void {
  app.get("/featured-sections", async () => {
    return getFeaturedSections(deps.db);
  });
}
