import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { requireOwnerOrPermission } from "../../plugins/auth.js";
import { loadListingOwnerId } from "./service.js";
import { requireCategoryForRead, requireCategoryForWrite } from "./detail-category-guard.js";
import { getHotelDetails, hotelAvailabilityBlocksService, hotelRoomsService, upsertHotelDetails, type HotelDetailsInput } from "./hotel-details.js";
import { registerChildCollectionRoutes } from "./child-collection-routes.js";

const CATEGORY_SLUG = "hotel";

const detailsInputSchema = {
  body: {
    type: "object",
    properties: {
      propertyTypeId: { type: "string", format: "uuid" },
      starRating: { type: "integer", minimum: 1, maximum: 5 },
      checkInTime: { type: "string" },
      checkOutTime: { type: "string" },
      guestsCapacityNote: { type: "string" },
      cancellationPolicy: { type: "string" },
      languageIds: { type: "array", items: { type: "string", format: "uuid" } },
    },
  },
};

const roomCreateSchema = {
  body: {
    type: "object",
    required: ["name", "ratePerNight"],
    properties: {
      name: { type: "string", minLength: 1 },
      description: { type: "string" },
      ratePerNight: { type: "integer", minimum: 0 },
      quantityAvailable: { type: "integer", minimum: 0 },
      sortOrder: { type: "integer" },
    },
  },
};

const roomUpdateSchema = {
  body: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1 },
      description: { type: "string" },
      ratePerNight: { type: "integer", minimum: 0 },
      quantityAvailable: { type: "integer", minimum: 0 },
      sortOrder: { type: "integer" },
    },
  },
};

const availabilityBlockCreateSchema = {
  body: {
    type: "object",
    required: ["startDate", "endDate"],
    properties: {
      startDate: { type: "string", format: "date" },
      endDate: { type: "string", format: "date" },
      note: { type: "string" },
    },
  },
};

const availabilityBlockUpdateSchema = {
  body: {
    type: "object",
    properties: {
      startDate: { type: "string", format: "date" },
      endDate: { type: "string", format: "date" },
      note: { type: "string" },
    },
  },
};

export function registerHotelDetailsRoutes(app: FastifyInstance, deps: Required<AppDeps>): void {
  app.get<{ Params: { listingId: string } }>("/listings/:listingId/hotel-details", async (request) => {
    await requireCategoryForRead(deps.db, request.params.listingId, CATEGORY_SLUG);
    return getHotelDetails(deps.db, request.params.listingId);
  });

  app.put<{ Params: { listingId: string }; Body: HotelDetailsInput }>(
    "/listings/:listingId/hotel-details",
    {
      schema: detailsInputSchema,
      preHandler: requireOwnerOrPermission(deps.db, "listingId", loadListingOwnerId, "Listings", "edit"),
    },
    async (request) => {
      await requireCategoryForWrite(deps.db, request.params.listingId, CATEGORY_SLUG, "Hotel");
      return upsertHotelDetails(deps.db, request.params.listingId, request.body);
    },
  );

  registerChildCollectionRoutes(
    app,
    deps,
    "/listings/:listingId/hotel-details/rooms",
    hotelRoomsService,
    roomCreateSchema,
    roomUpdateSchema,
  );

  registerChildCollectionRoutes(
    app,
    deps,
    "/listings/:listingId/hotel-details/availability-blocks",
    hotelAvailabilityBlocksService,
    availabilityBlockCreateSchema,
    availabilityBlockUpdateSchema,
  );
}
