import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { requireOwnerOrPermission } from "../../plugins/auth.js";
import { loadListingOwnerId } from "./service.js";
import { replaceListingAmenities, replaceListingTags, setListingAttributes } from "./taxonomy.js";

const amenitiesSchema = {
  body: {
    type: "object",
    required: ["amenityIds"],
    properties: { amenityIds: { type: "array", items: { type: "string", format: "uuid" } } },
  },
};

const tagsSchema = {
  body: {
    type: "object",
    required: ["tagIds"],
    properties: { tagIds: { type: "array", items: { type: "string", format: "uuid" } } },
  },
};

const attributesSchema = {
  body: { type: "object", additionalProperties: { type: "string" } },
};

export function registerListingTaxonomyRoutes(app: FastifyInstance, deps: Required<AppDeps>): void {
  app.put<{ Body: { amenityIds: string[] }; Params: { listingId: string } }>(
    "/listings/:listingId/amenities",
    {
      schema: amenitiesSchema,
      preHandler: requireOwnerOrPermission(deps.db, "listingId", loadListingOwnerId, "Listings", "edit"),
    },
    async (request) => {
      await replaceListingAmenities(deps.db, request.params.listingId, request.body.amenityIds);
      return { updated: true };
    },
  );

  app.put<{ Body: { tagIds: string[] }; Params: { listingId: string } }>(
    "/listings/:listingId/tags",
    {
      schema: tagsSchema,
      preHandler: requireOwnerOrPermission(deps.db, "listingId", loadListingOwnerId, "Listings", "edit"),
    },
    async (request) => {
      await replaceListingTags(deps.db, request.params.listingId, request.body.tagIds);
      return { updated: true };
    },
  );

  app.put<{ Body: Record<string, string>; Params: { listingId: string } }>(
    "/listings/:listingId/attributes",
    {
      schema: attributesSchema,
      preHandler: requireOwnerOrPermission(deps.db, "listingId", loadListingOwnerId, "Listings", "edit"),
    },
    async (request) => {
      await setListingAttributes(deps.db, request.params.listingId, request.body);
      return { updated: true };
    },
  );
}
