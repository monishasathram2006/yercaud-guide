import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { registerNamedLookupRoutes } from "./named-lookup-routes.js";
import { registerCategoryRoutes } from "./categories-routes.js";
import { registerCategoryAttributeRoutes } from "./category-attributes-routes.js";
import { registerLocationRoutes } from "./locations-routes.js";
import { registerPriceBandRoutes } from "./price-bands-routes.js";
import { registerBadgeRoutes } from "./badges-routes.js";

export async function registerTaxonomyRoutes(app: FastifyInstance, deps: Required<AppDeps>): Promise<void> {
  registerCategoryRoutes(app, deps);
  registerCategoryAttributeRoutes(app, deps);
  registerLocationRoutes(app, deps);
  registerPriceBandRoutes(app, deps);
  registerBadgeRoutes(app, deps);
  registerNamedLookupRoutes(app, deps, "/amenities", { table: "amenities", hasIcon: true });
  registerNamedLookupRoutes(app, deps, "/attribute-tags", { table: "attribute_tags", hasIcon: false });
  registerNamedLookupRoutes(app, deps, "/property-types", { table: "property_types", hasIcon: false });
  registerNamedLookupRoutes(app, deps, "/languages", { table: "languages", hasIcon: false });
}
