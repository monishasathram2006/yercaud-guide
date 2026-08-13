import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { registerBlogCategoryRoutes } from "./categories-routes.js";
import { registerBlogPostRoutes } from "./posts-routes.js";
import { registerBlogCommentRoutes } from "./comments-routes.js";
import { registerBlogRatingRoutes } from "./ratings-routes.js";
import { registerBlogPostViewRoutes } from "./post-view-routes.js";
import { registerBlogImageRoutes } from "./images-routes.js";

export async function registerBlogRoutes(app: FastifyInstance, deps: Required<AppDeps>): Promise<void> {
  registerBlogCategoryRoutes(app, deps);
  registerBlogPostRoutes(app, deps);
  registerBlogCommentRoutes(app, deps);
  registerBlogRatingRoutes(app, deps);
  registerBlogPostViewRoutes(app, deps);
  registerBlogImageRoutes(app, deps);
}
