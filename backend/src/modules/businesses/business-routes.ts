import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { requireAuth, requireOwnerOrPermission, requirePermission } from "../../plugins/auth.js";
import { scheduleEmbeddingRefresh } from "../search/sync.js";
import { userHasPermission } from "../rbac/service.js";
import { logAudit } from "../../audit.js";
import { ForbiddenError, UnauthorizedError } from "../../errors.js";
import {
  applyAsBusinessOwner,
  approveBusiness,
  archiveBusiness,
  getBusiness,
  listBusinesses,
  loadBusinessOwnerId,
  rejectBusiness,
  suspendBusiness,
  updateBusiness,
  type BusinessInput,
} from "./service.js";

const businessInputSchema = {
  body: {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1 },
      description: { type: "string" },
      contactPhone: { type: "string" },
      contactEmail: { type: "string" },
      website: { type: "string" },
      address: { type: "string" },
      socialLinks: { type: "object", additionalProperties: { type: "string" } },
      logoUrl: { type: "string" },
      coverUrl: { type: "string" },
    },
  },
};

const rejectSchema = {
  body: {
    type: "object",
    required: ["reason"],
    properties: { reason: { type: "string", minLength: 1 } },
  },
};

export function registerBusinessRoutes(app: FastifyInstance, deps: Required<AppDeps>): void {
  app.get<{ Querystring: { status?: string } }>("/businesses", { preHandler: requireAuth }, async (request) => {
    const includeAll = await userHasPermission(deps.db, request.currentUser!.id, "Businesses", "view");
    return listBusinesses(deps.db, {
      callerId: request.currentUser!.id,
      includeAll,
      status: request.query.status,
    });
  });

  app.post<{ Body: BusinessInput }>(
    "/businesses",
    { schema: businessInputSchema, preHandler: requireAuth },
    async (request, reply) => {
      const business = await applyAsBusinessOwner(deps.db, request.currentUser!.id, request.body);
      return reply.status(201).send(business);
    },
  );

  /**
   * An approved Business is public; anything else keeps the previous rule
   * exactly (Phase 10).
   *
   * This used to require Businesses:view for every caller, which made a Business
   * unreadable to the visitors the directory exists to connect it to: a public
   * Listing page could show its owner's phone and website — those ride along on
   * ListingSummary — but not the address, email or social links on the same
   * Business. An address nobody can read is not a directory.
   *
   * Deliberately additive. The obvious-looking version, mirroring the Listing
   * rule's 404-not-403 for unapproved rows, would also have rewritten a tested
   * contract as a side effect: one owner probing another's *pending* Business
   * gets 403 today, and Phase 1 chose that distinction on purpose (401 = not
   * signed in, 403 = signed in but not allowed). Business ids are UUIDs, so the
   * enumeration argument that justifies 404 for Listings doesn't carry here.
   * Opening approved Businesses is the whole change.
   */
  app.get<{ Params: { businessId: string } }>("/businesses/:businessId", async (request) => {
    const business = await getBusiness(deps.db, request.params.businessId);
    if (business.status === "approved") return business;

    if (!request.currentUser) throw new UnauthorizedError();
    const isOwner = (await loadBusinessOwnerId(deps.db, business.id)) === request.currentUser.id;
    const isAdmin = await userHasPermission(deps.db, request.currentUser.id, "Businesses", "view");
    if (!isOwner && !isAdmin) throw new ForbiddenError();
    return business;
  });

  app.patch<{ Body: BusinessInput; Params: { businessId: string } }>(
    "/businesses/:businessId",
    {
      schema: businessInputSchema,
      preHandler: requireOwnerOrPermission(deps.db, "businessId", loadBusinessOwnerId, "Businesses", "edit"),
    },
    async (request) => {
      const updated = await updateBusiness(deps.db, request.params.businessId, request.body);
      scheduleEmbeddingRefresh(deps); // its content changed; re-embed in the background
      return updated;
    },
  );

  app.post<{ Params: { businessId: string } }>(
    "/businesses/:businessId/approve",
    { preHandler: requirePermission(deps.db, "Businesses", "approve") },
    async (request) => {
      const before = await getBusiness(deps.db, request.params.businessId);
      const business = await approveBusiness(deps.db, request.params.businessId);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "businesses.approve",
        tableName: "businesses",
        recordId: business.id,
        oldData: { status: before.status },
        newData: { status: business.status },
      });
      scheduleEmbeddingRefresh(deps); // now public — make it semantically findable promptly
      return business;
    },
  );

  app.post<{ Body: { reason: string }; Params: { businessId: string } }>(
    "/businesses/:businessId/reject",
    { schema: rejectSchema, preHandler: requirePermission(deps.db, "Businesses", "approve") },
    async (request) => {
      const before = await getBusiness(deps.db, request.params.businessId);
      const business = await rejectBusiness(deps.db, request.params.businessId, request.body.reason);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "businesses.reject",
        tableName: "businesses",
        recordId: business.id,
        oldData: { status: before.status },
        newData: { status: business.status, rejectionReason: business.rejectionReason },
      });
      return business;
    },
  );

  app.post<{ Params: { businessId: string } }>(
    "/businesses/:businessId/suspend",
    { preHandler: requirePermission(deps.db, "Businesses", "approve") },
    async (request) => {
      const before = await getBusiness(deps.db, request.params.businessId);
      const business = await suspendBusiness(deps.db, request.params.businessId);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "businesses.suspend",
        tableName: "businesses",
        recordId: business.id,
        oldData: { status: before.status },
        newData: { status: business.status },
      });
      return business;
    },
  );

  app.post<{ Params: { businessId: string } }>(
    "/businesses/:businessId/archive",
    { preHandler: requirePermission(deps.db, "Businesses", "delete") },
    async (request) => {
      const before = await getBusiness(deps.db, request.params.businessId);
      const business = await archiveBusiness(deps.db, request.params.businessId);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "businesses.archive",
        tableName: "businesses",
        recordId: business.id,
        oldData: { status: before.status },
        newData: { status: business.status },
      });
      return business;
    },
  );
}
