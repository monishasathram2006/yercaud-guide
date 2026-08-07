import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { registerPromotionRoutes } from "./promotions-routes.js";
import { registerFeaturedListingRoutes } from "./featured-listings-routes.js";
import { registerBannerRoutes } from "./banners-routes.js";

export async function registerMarketingRoutes(app: FastifyInstance, deps: Required<AppDeps>): Promise<void> {
  registerPromotionRoutes(app, deps);
  registerFeaturedListingRoutes(app, deps);
  registerBannerRoutes(app, deps);
}
