import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { registerListingRoutes } from "./listing-routes.js";
import { registerListingImageRoutes } from "./images-routes.js";
import { registerListingTaxonomyRoutes } from "./taxonomy-routes.js";
import { registerHotelDetailsRoutes } from "./hotel-details-routes.js";
import { registerRestaurantDetailsRoutes } from "./restaurant-details-routes.js";
import { registerActivityDetailsRoutes } from "./activity-details-routes.js";
import { registerTourDetailsRoutes } from "./tour-details-routes.js";
import { registerContactRevealRoutes } from "./contact-reveal-routes.js";
import { registerListingViewRoutes } from "./listing-view-routes.js";
import { registerListingStatsRoutes } from "./listing-stats-routes.js";

export async function registerListingsRoutes(app: FastifyInstance, deps: Required<AppDeps>): Promise<void> {
  registerListingRoutes(app, deps);
  registerListingImageRoutes(app, deps);
  registerListingTaxonomyRoutes(app, deps);
  registerHotelDetailsRoutes(app, deps);
  registerRestaurantDetailsRoutes(app, deps);
  registerActivityDetailsRoutes(app, deps);
  registerTourDetailsRoutes(app, deps);
  registerContactRevealRoutes(app, deps);
  registerListingViewRoutes(app, deps);
  registerListingStatsRoutes(app, deps);
}
