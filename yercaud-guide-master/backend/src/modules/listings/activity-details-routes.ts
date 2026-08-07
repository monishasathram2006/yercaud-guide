import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { requireOwnerOrPermission } from "../../plugins/auth.js";
import { loadListingOwnerId } from "./service.js";
import { requireCategoryForRead, requireCategoryForWrite } from "./detail-category-guard.js";
import {
  activityInclusionsService,
  activityItineraryStepsService,
  getActivityDetails,
  upsertActivityDetails,
  type ActivityDetailsInput,
} from "./activity-details.js";
import { registerChildCollectionRoutes } from "./child-collection-routes.js";
import { inclusionCreateSchema, inclusionUpdateSchema } from "./inclusion-schemas.js";

const CATEGORY_SLUG = "activity";

const detailsInputSchema = {
  body: {
    type: "object",
    properties: {
      duration: { type: "string" },
      maxHeight: { type: "string" },
      totalDistance: { type: "string" },
      difficultyLevel: { type: "string" },
      // FR58. Also the source the Listing's cached price_from derives from.
      pricePerPerson: { type: "integer", minimum: 0, nullable: true },
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
    },
  },
};

export function registerActivityDetailsRoutes(app: FastifyInstance, deps: Required<AppDeps>): void {
  app.get<{ Params: { listingId: string } }>("/listings/:listingId/activity-details", async (request) => {
    await requireCategoryForRead(deps.db, request.params.listingId, CATEGORY_SLUG);
    return getActivityDetails(deps.db, request.params.listingId);
  });

  app.put<{ Params: { listingId: string }; Body: ActivityDetailsInput }>(
    "/listings/:listingId/activity-details",
    {
      schema: detailsInputSchema,
      preHandler: requireOwnerOrPermission(deps.db, "listingId", loadListingOwnerId, "Listings", "edit"),
    },
    async (request) => {
      await requireCategoryForWrite(deps.db, request.params.listingId, CATEGORY_SLUG, "Activity");
      return upsertActivityDetails(deps.db, request.params.listingId, request.body);
    },
  );

  registerChildCollectionRoutes(
    app,
    deps,
    "/listings/:listingId/activity-details/itinerary-steps",
    activityItineraryStepsService,
    itineraryStepCreateSchema,
    itineraryStepUpdateSchema,
  );

  registerChildCollectionRoutes(
    app,
    deps,
    "/listings/:listingId/activity-details/inclusions",
    activityInclusionsService,
    inclusionCreateSchema,
    inclusionUpdateSchema,
  );
}
