import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { registerContentBlockRoutes } from "./blocks-routes.js";
import { registerNewsletterRoutes } from "./newsletter-routes.js";
import { registerContactMessageRoutes } from "./contact-messages-routes.js";

/**
 * Content blocks, the newsletter and Contact-page messages share no code — they
 * share a module because they share the `Content` permission and none is large
 * enough to stand alone. Contact messages join them in Phase 10: FR128's form is
 * the Contact page's, and the page's copy already lives in Content Blocks.
 */
export async function registerContentRoutes(app: FastifyInstance, deps: Required<AppDeps>): Promise<void> {
  registerContentBlockRoutes(app, deps);
  registerNewsletterRoutes(app, deps);
  registerContactMessageRoutes(app, deps);
}
