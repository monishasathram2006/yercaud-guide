import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppDeps } from "../../app.js";
import { requireOwnerOrPermission, requirePermission } from "../../plugins/auth.js";
import { scheduleEmbeddingRefresh } from "../search/sync.js";
import { userHasPermission } from "../rbac/service.js";
import { loadBusinessOwnerId } from "../businesses/service.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../errors.js";
import { logAudit } from "../../audit.js";
import {
  approveListing,
  archiveListing,
  createListing,
  getListing,
  getListingBySlug,
  getSimilarListings,
  loadListingOwnerId,
  rejectListing,
  PRICE_UNITS,
  searchListings,
  setListingBadge,
  TWITTER_CARD_TYPES,
  updateListing,
  type ListingInput,
} from "./service.js";

const listingInputSchema = {
  body: {
    type: "object",
    required: ["businessId", "categoryId", "name"],
    properties: {
      businessId: { type: "string", format: "uuid" },
      categoryId: { type: "string", format: "uuid" },
      locationId: { type: "string", format: "uuid" },
      name: { type: "string", minLength: 1 },
      description: { type: "string" },
      seoTitle: { type: "string" },
      seoDescription: { type: "string" },
      // A plain URL string, not an upload — an admin points this at an
      // already-hosted image, typically one of the Listing's own.
      ogImage: { type: "string" },
      twitterCard: { type: "string", enum: TWITTER_CARD_TYPES },
      // Only meaningful for the four categories ADR 0003 gives no detail table;
      // the service refuses it for the rest, which derive their price instead.
      priceFrom: { type: "integer", minimum: 0, nullable: true },
      priceUnit: { type: "string", enum: PRICE_UNITS, nullable: true },
    },
  },
};

const badgeAssignSchema = {
  body: {
    type: "object",
    required: ["badgeId"],
    // Explicitly nullable: clearing a badge is how a seasonal highlight ends.
    properties: { badgeId: { type: "string", format: "uuid", nullable: true } },
  },
};

const rejectSchema = {
  body: {
    type: "object",
    required: ["reason"],
    properties: { reason: { type: "string", minLength: 1 } },
  },
};

interface SearchQuery {
  q?: string;
  category?: string;
  location?: string;
  businessId?: string;
  minRating?: number;
  priceBand?: string;
  minPrice?: number;
  maxPrice?: number;
  /** Comma-separated amenity names — split server-side, not a JSON array, to keep the URL a plain query string. */
  amenities?: string;
  minStarRating?: number;
  propertyType?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

const searchSchema = {
  querystring: {
    type: "object",
    properties: {
      q: { type: "string" },
      category: { type: "string" },
      location: { type: "string" },
      businessId: { type: "string", format: "uuid" },
      minRating: { type: "number" },
      priceBand: { type: "string" },
      minPrice: { type: "integer", minimum: 0 },
      maxPrice: { type: "integer", minimum: 0 },
      amenities: { type: "string" },
      minStarRating: { type: "integer", minimum: 1, maximum: 5 },
      propertyType: { type: "string" },
      status: { type: "string" },
      page: { type: "integer", minimum: 1, default: 1 },
      pageSize: { type: "integer", minimum: 1, maximum: 100, default: 20 },
    },
  },
};

/** Throws 403 unless the caller owns `businessId` or holds the admin override (Businesses:edit). */
async function requireOwnsBusiness(deps: Required<AppDeps>, request: FastifyRequest, businessId: string): Promise<void> {
  const ownerId = await loadBusinessOwnerId(deps.db, businessId);
  const isOwner = ownerId === request.currentUser!.id;
  if (isOwner) return;
  const isAdmin = await userHasPermission(deps.db, request.currentUser!.id, "Businesses", "edit");
  if (!isAdmin) {
    throw new ForbiddenError("You can only manage Listings under your own Business");
  }
}

export function registerListingRoutes(app: FastifyInstance, deps: Required<AppDeps>): void {
  app.get<{ Querystring: SearchQuery }>("/listings", { schema: searchSchema }, async (request) => {
    const callerId = request.currentUser?.id;
    // Not `Listings:view` — the Business Owner role also holds that (for
    // seeing their own Listings), so it can't distinguish "sees everything"
    // from "sees only mine". `Admins:view` is held only by Super Admin.
    const includeAll = callerId ? await userHasPermission(deps.db, callerId, "Admins", "view") : false;
    const { items, total } = await searchListings(deps.db, {
      q: request.query.q,
      category: request.query.category,
      location: request.query.location,
      businessId: request.query.businessId,
      minRating: request.query.minRating,
      priceBand: request.query.priceBand,
      minPrice: request.query.minPrice,
      maxPrice: request.query.maxPrice,
      amenities: request.query.amenities?.split(",").map((a) => a.trim()).filter(Boolean),
      minStarRating: request.query.minStarRating,
      propertyType: request.query.propertyType,
      status: request.query.status,
      page: request.query.page ?? 1,
      pageSize: request.query.pageSize ?? 20,
      callerId,
      includeAll,
    });
    return { items, total };
  });

  app.post<{ Body: ListingInput }>(
    "/listings",
    { schema: listingInputSchema, preHandler: requirePermission(deps.db, "Listings", "create") },
    async (request, reply) => {
      await requireOwnsBusiness(deps, request, request.body.businessId);
      const listing = await createListing(deps.db, request.body);
      return reply.status(201).send(listing);
    },
  );

  /**
   * 404, not 403 — an unapproved Listing shouldn't confirm its own existence to
   * a caller who isn't its owner or an admin. Shared by the id and slug routes:
   * addressing a Listing a different way must not disclose more of it.
   */
  async function assertVisible(request: FastifyRequest, listing: { id: string; status: string }): Promise<void> {
    if (listing.status === "approved") return;
    const callerId = request.currentUser?.id;
    const isOwner = callerId ? (await loadListingOwnerId(deps.db, listing.id)) === callerId : false;
    // Admins:view, not Listings:view — the Business Owner role holds the latter.
    const isAdmin = callerId ? await userHasPermission(deps.db, callerId, "Admins", "view") : false;
    if (!isOwner && !isAdmin) {
      throw new NotFoundError("Listing not found");
    }
  }

  app.get<{ Params: { listingId: string } }>("/listings/:listingId", async (request) => {
    const listing = await getListing(deps.db, request.params.listingId);
    await assertVisible(request, listing);
    return listing;
  });

  // The public site addresses Listings by slug (Phase 10): readable,
  // keyword-bearing, and what the SSR'd pages link to. Admin keeps using ids.
  // A separate path rather than overloading :listingId, so a slug that happens
  // to look like a UUID is never ambiguous.
  app.get<{ Params: { slug: string } }>("/listings/by-slug/:slug", async (request) => {
    const listing = await getListingBySlug(deps.db, request.params.slug);
    await assertVisible(request, listing);
    return listing;
  });

  app.get<{ Params: { listingId: string } }>("/listings/:listingId/similar", async (request) => {
    const listing = await getListing(deps.db, request.params.listingId);
    await assertVisible(request, listing);
    return getSimilarListings(deps.db, listing.id);
  });

  app.patch<{ Body: ListingInput; Params: { listingId: string } }>(
    "/listings/:listingId",
    {
      schema: listingInputSchema,
      preHandler: requireOwnerOrPermission(deps.db, "listingId", loadListingOwnerId, "Listings", "edit"),
    },
    async (request) => {
      const current = await getListing(deps.db, request.params.listingId);
      // categoryId is immutable after creation — changing it would orphan
      // whatever category-detail row (hotel_details/etc.) already exists,
      // invisibly to detail-category-guard's slug-join lookup. Archive and
      // re-create instead of reassigning a live Listing's category.
      if (request.body.categoryId !== current.categoryId) {
        throw new BadRequestError("categoryId cannot be changed after creation");
      }
      // Moving a Listing to a different Business requires owning (or holding
      // the admin override on) the *new* target Business — requireOwnerOrPermission
      // above only confirmed ownership of the Listing's *current* Business.
      if (request.body.businessId !== current.businessId) {
        await requireOwnsBusiness(deps, request, request.body.businessId);
      }
      const updated = await updateListing(deps.db, request.params.listingId, request.body);
      scheduleEmbeddingRefresh(deps); // its content changed; re-embed in the background
      return updated;
    },
  );

  // FR30. A separate endpoint rather than a ListingInput field, so that the
  // permission — Marketing:edit, which Business Owners do not hold — is what
  // states the rule. A self-applied "Popular" would make the badge meaningless.
  app.put<{ Body: { badgeId: string | null }; Params: { listingId: string } }>(
    "/listings/:listingId/badge",
    { schema: badgeAssignSchema, preHandler: requirePermission(deps.db, "Marketing", "edit") },
    async (request) => {
      const before = await getListing(deps.db, request.params.listingId);
      const listing = await setListingBadge(deps.db, request.params.listingId, request.body.badgeId);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "listings.badge",
        tableName: "listings",
        recordId: listing.id,
        oldData: { badgeId: before.badge?.id ?? null },
        newData: { badgeId: listing.badge?.id ?? null },
      });
      return listing;
    },
  );

  app.post<{ Params: { listingId: string } }>(
    "/listings/:listingId/approve",
    { preHandler: requirePermission(deps.db, "Listings", "approve") },
    async (request) => {
      const before = await getListing(deps.db, request.params.listingId);
      const listing = await approveListing(deps.db, request.params.listingId);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "listings.approve",
        tableName: "listings",
        recordId: listing.id,
        oldData: { status: before.status },
        newData: { status: listing.status },
      });
      scheduleEmbeddingRefresh(deps); // now public — make it semantically findable promptly
      return listing;
    },
  );

  app.post<{ Body: { reason: string }; Params: { listingId: string } }>(
    "/listings/:listingId/reject",
    { schema: rejectSchema, preHandler: requirePermission(deps.db, "Listings", "approve") },
    async (request) => {
      const before = await getListing(deps.db, request.params.listingId);
      const listing = await rejectListing(deps.db, request.params.listingId, request.body.reason);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "listings.reject",
        tableName: "listings",
        recordId: listing.id,
        oldData: { status: before.status },
        newData: { status: listing.status, rejectionReason: listing.rejectionReason },
      });
      return listing;
    },
  );

  app.post<{ Params: { listingId: string } }>(
    "/listings/:listingId/archive",
    { preHandler: requirePermission(deps.db, "Listings", "delete") },
    async (request) => {
      const before = await getListing(deps.db, request.params.listingId);
      const listing = await archiveListing(deps.db, request.params.listingId);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "listings.archive",
        tableName: "listings",
        recordId: listing.id,
        oldData: { status: before.status },
        newData: { status: listing.status },
      });
      return listing;
    },
  );
}
