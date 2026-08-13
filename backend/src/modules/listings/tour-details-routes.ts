import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { requireOwnerOrPermission } from "../../plugins/auth.js";
import { loadListingOwnerId } from "./service.js";
import { requireCategoryForRead, requireCategoryForWrite } from "./detail-category-guard.js";
import {
  getTourDetails,
  tourAttractionsService,
  tourInclusionsService,
  tourItineraryStepsService,
  upsertTourDetails,
  type TourDetailsInput,
} from "./tour-details.js";
import { registerChildCollectionRoutes } from "./child-collection-routes.js";
import { inclusionCreateSchema, inclusionUpdateSchema } from "./inclusion-schemas.js";

const CATEGORY_SLUG = "tour";

const detailsInputSchema = {
  body: {
    type: "object",
    properties: {
      tourType: { type: "string" },
      bestFor: { type: "string" },
      duration: { type: "string" },
      // FR58. Also the source the Listing's cached price_from derives from.
      pricePerPerson: { type: "integer", minimum: 0, nullable: true },
      languageIds: { type: "array", items: { type: "string", format: "uuid" } },
    },
  },
};

const itineraryStepCreateSchema = {
  body: {
    type: "object",
    required: ["stepOrder", "title"],
    properties: {
      stepOrder: { type: "integer" },
      title: { type: "string", minLength: 1 },
      description: { type: "string" },
      duration: { type: "string" },
      stepType: { type: "string", enum: ["pickup", "stop", "dropoff"] },
    },
  },
};

const itineraryStepUpdateSchema = {
  body: {
    type: "object",
    properties: {
      stepOrder: { type: "integer" },
      title: { type: "string", minLength: 1 },
      description: { type: "string" },
      duration: { type: "string" },
      stepType: { type: "string", enum: ["pickup", "stop", "dropoff"] },
    },
  },
};

const attractionCreateSchema = {
  body: {
    type: "object",
    required: ["name"],
    properties: { name: { type: "string", minLength: 1 } },
  },
};

const attractionUpdateSchema = {
  body: {
    type: "object",
    properties: { name: { type: "string", minLength: 1 } },
  },
};

export function registerTourDetailsRoutes(app: FastifyInstance, deps: Required<AppDeps>): void {
  app.get<{ Params: { listingId: string } }>("/listings/:listingId/tour-details", async (request) => {
    await requireCategoryForRead(deps.db, request.params.listingId, CATEGORY_SLUG);
    return getTourDetails(deps.db, request.params.listingId);
  });

  app.put<{ Params: { listingId: string }; Body: TourDetailsInput }>(
    "/listings/:listingId/tour-details",
    {
      schema: detailsInputSchema,
      preHandler: requireOwnerOrPermission(deps.db, "listingId", loadListingOwnerId, "Listings", "edit"),
    },
    async (request) => {
      await requireCategoryForWrite(deps.db, request.params.listingId, CATEGORY_SLUG, "Tour & Travel");
      return upsertTourDetails(deps.db, request.params.listingId, request.body);
    },
  );

  registerChildCollectionRoutes(
    app,
    deps,
    "/listings/:listingId/tour-details/itinerary-steps",
    tourItineraryStepsService,
    itineraryStepCreateSchema,
    itineraryStepUpdateSchema,
  );

  registerChildCollectionRoutes(
    app,
    deps,
    "/listings/:listingId/tour-details/inclusions",
    tourInclusionsService,
    inclusionCreateSchema,
    inclusionUpdateSchema,
  );

  registerChildCollectionRoutes(
    app,
    deps,
    "/listings/:listingId/tour-details/attractions",
    tourAttractionsService,
    attractionCreateSchema,
    attractionUpdateSchema,
  );
}
