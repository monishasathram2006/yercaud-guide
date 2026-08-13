import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { requireAuth, requireOwnerOrPermission, requirePermission } from "../../plugins/auth.js";
import { userHasPermission } from "../rbac/service.js";
import { requireApprovedListing } from "../listings/service.js";
import {
  listEnquiries,
  listMyEnquiries,
  loadEnquiryOwnerId,
  respondToEnquiry,
  setEnquiryStatus,
  submitEnquiry,
  type EnquiryInput,
} from "./service.js";

const enquiryInputSchema = {
  body: {
    type: "object",
    required: ["name", "email", "message"],
    properties: {
      name: { type: "string", minLength: 1 },
      email: { type: "string", format: "email" },
      phone: { type: "string" },
      message: { type: "string", minLength: 1 },
    },
  },
};

const respondSchema = {
  body: {
    type: "object",
    required: ["text"],
    properties: { text: { type: "string", minLength: 1 } },
  },
};

const statusSchema = {
  body: {
    type: "object",
    required: ["status"],
    properties: { status: { type: "string", enum: ["sent", "responded", "closed"] } },
  },
};

export async function registerEnquiriesRoutes(app: FastifyInstance, deps: Required<AppDeps>): Promise<void> {
  app.post<{ Params: { listingId: string }; Body: EnquiryInput }>(
    "/listings/:listingId/enquiries",
    { schema: enquiryInputSchema },
    async (request, reply) => {
      await requireApprovedListing(deps.db, request.params.listingId);
      const enquiry = await submitEnquiry(
        deps.db,
        request.params.listingId,
        request.currentUser?.id ?? null,
        request.body,
      );
      return reply.status(201).send(enquiry);
    },
  );

  app.get("/me/enquiries", { preHandler: requireAuth }, async (request) => {
    return listMyEnquiries(deps.db, request.currentUser!.id);
  });

  app.get<{ Querystring: { status?: string } }>(
    "/enquiries",
    { preHandler: requirePermission(deps.db, "Enquiries", "view") },
    async (request) => {
      // Not Enquiries:view — the Business Owner role also holds that (for
      // their own inbox), so it can't distinguish "sees everything" from
      // "sees only mine" (same fix as Listings' search/get endpoints).
      const includeAll = await userHasPermission(deps.db, request.currentUser!.id, "Admins", "view");
      return listEnquiries(deps.db, { callerId: request.currentUser!.id, includeAll, status: request.query.status });
    },
  );

  app.post<{ Params: { enquiryId: string }; Body: { text: string } }>(
    "/enquiries/:enquiryId/respond",
    {
      schema: respondSchema,
      preHandler: requireOwnerOrPermission(deps.db, "enquiryId", loadEnquiryOwnerId, "Enquiries", "edit"),
    },
    async (request) => {
      return respondToEnquiry(deps.db, request.params.enquiryId, request.body.text);
    },
  );

  app.patch<{ Params: { enquiryId: string }; Body: { status: "sent" | "responded" | "closed" } }>(
    "/enquiries/:enquiryId/status",
    {
      schema: statusSchema,
      preHandler: requireOwnerOrPermission(deps.db, "enquiryId", loadEnquiryOwnerId, "Enquiries", "edit"),
    },
    async (request) => {
      return setEnquiryStatus(deps.db, request.params.enquiryId, request.body.status);
    },
  );
}
