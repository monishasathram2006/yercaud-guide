import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { requireOwnerOrPermission } from "../../plugins/auth.js";
import { loadListingOwnerId } from "./service.js";
import { requireCategoryForRead, requireCategoryForWrite } from "./detail-category-guard.js";
import {
  getRestaurantDetails,
  restaurantMenuItemsService,
  setOpeningHours,
  upsertRestaurantDetails,
  type OpeningHourInput,
  type RestaurantDetailsInput,
} from "./restaurant-details.js";
import { registerChildCollectionRoutes } from "./child-collection-routes.js";

const CATEGORY_SLUG = "restaurant";

const detailsInputSchema = {
  body: {
    type: "object",
    properties: {
      cuisineType: { type: "string" },
      avgCostForTwo: { type: "integer", minimum: 0 },
      bestFor: { type: "string" },
    },
  },
};

const openingHoursSchema = {
  body: {
    type: "array",
    minItems: 7,
    maxItems: 7,
    items: {
      type: "object",
      required: ["dayOfWeek"],
      properties: {
        dayOfWeek: { type: "integer", minimum: 0, maximum: 6 },
        openTime: { type: "string" },
        closeTime: { type: "string" },
        isClosed: { type: "boolean" },
      },
    },
  },
};

const menuItemCreateSchema = {
  body: {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1 },
      price: { type: "integer", minimum: 0 },
      imageUrl: { type: "string" },
      sortOrder: { type: "integer" },
    },
  },
};

const menuItemUpdateSchema = {
  body: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1 },
      price: { type: "integer", minimum: 0 },
      imageUrl: { type: "string" },
      sortOrder: { type: "integer" },
    },
  },
};

export function registerRestaurantDetailsRoutes(app: FastifyInstance, deps: Required<AppDeps>): void {
  app.get<{ Params: { listingId: string } }>("/listings/:listingId/restaurant-details", async (request) => {
    await requireCategoryForRead(deps.db, request.params.listingId, CATEGORY_SLUG);
    return getRestaurantDetails(deps.db, request.params.listingId);
  });

  app.put<{ Params: { listingId: string }; Body: RestaurantDetailsInput }>(
    "/listings/:listingId/restaurant-details",
    {
      schema: detailsInputSchema,
      preHandler: requireOwnerOrPermission(deps.db, "listingId", loadListingOwnerId, "Listings", "edit"),
    },
    async (request) => {
      await requireCategoryForWrite(deps.db, request.params.listingId, CATEGORY_SLUG, "Restaurant");
      return upsertRestaurantDetails(deps.db, request.params.listingId, request.body);
    },
  );

  app.put<{ Params: { listingId: string }; Body: OpeningHourInput[] }>(
    "/listings/:listingId/restaurant-details/opening-hours",
    {
      schema: openingHoursSchema,
      preHandler: requireOwnerOrPermission(deps.db, "listingId", loadListingOwnerId, "Listings", "edit"),
    },
    async (request) => {
      return setOpeningHours(deps.db, request.params.listingId, request.body);
    },
  );

  registerChildCollectionRoutes(
    app,
    deps,
    "/listings/:listingId/restaurant-details/menu-items",
    restaurantMenuItemsService,
    menuItemCreateSchema,
    menuItemUpdateSchema,
  );
}
