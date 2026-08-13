import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { ForbiddenError } from "../../errors.js";
import { requireAuth, requireOwnerOrPermission } from "../../plugins/auth.js";
import { userHasPermission } from "../rbac/service.js";
import { loadBusinessOwnerId } from "./service.js";
import {
  acceptOwnInvite,
  getStaffMember,
  inviteStaff,
  listStaff,
  revokeStaff,
  updateStaffAsOwner,
  type InviteStaffInput,
  type UpdateStaffInput,
} from "./staff.js";

const inviteSchema = {
  body: {
    type: "object",
    required: ["email"],
    properties: {
      email: { type: "string", format: "email" },
      permissions: { type: "object", additionalProperties: { type: "boolean" } },
    },
  },
};

const updateSchema = {
  body: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["pending", "accepted", "revoked"] },
      permissions: { type: "object", additionalProperties: { type: "boolean" } },
    },
  },
};

export function registerBusinessStaffRoutes(app: FastifyInstance, deps: Required<AppDeps>): void {
  app.get<{ Params: { businessId: string } }>(
    "/businesses/:businessId/staff",
    { preHandler: requireOwnerOrPermission(deps.db, "businessId", loadBusinessOwnerId, "Businesses", "view") },
    async (request) => {
      return listStaff(deps.db, request.params.businessId);
    },
  );

  app.post<{ Body: InviteStaffInput; Params: { businessId: string } }>(
    "/businesses/:businessId/staff",
    {
      schema: inviteSchema,
      preHandler: requireOwnerOrPermission(deps.db, "businessId", loadBusinessOwnerId, "Businesses", "edit"),
    },
    async (request, reply) => {
      const staff = await inviteStaff(deps.db, request.params.businessId, request.currentUser!.id, request.body);
      return reply.status(201).send(staff);
    },
  );

  // Two distinct callers can reach this route with different allowed shapes (owner vs. the
  // invited staff member accepting their own invite) — kept as inline branching per the spec,
  // rather than forcing both shapes through one generic guard.
  app.patch<{ Body: UpdateStaffInput; Params: { businessId: string; staffId: string } }>(
    "/businesses/:businessId/staff/:staffId",
    { schema: updateSchema, preHandler: requireAuth },
    async (request) => {
      const { businessId, staffId } = request.params;
      const staffMember = await getStaffMember(deps.db, businessId, staffId);
      const callerId = request.currentUser!.id;

      const ownerId = await loadBusinessOwnerId(deps.db, businessId);
      const isOwnerOrAdmin =
        ownerId === callerId || (await userHasPermission(deps.db, callerId, "Businesses", "edit"));

      if (isOwnerOrAdmin) {
        return updateStaffAsOwner(deps.db, businessId, staffId, request.body);
      }

      if (staffMember.userId === callerId) {
        const keys = Object.keys(request.body);
        if (keys.length !== 1 || request.body.status !== "accepted") {
          throw new ForbiddenError("You may only accept your own pending invite");
        }
        return acceptOwnInvite(deps.db, businessId, staffId, callerId);
      }

      throw new ForbiddenError();
    },
  );

  app.delete<{ Params: { businessId: string; staffId: string } }>(
    "/businesses/:businessId/staff/:staffId",
    { preHandler: requireOwnerOrPermission(deps.db, "businessId", loadBusinessOwnerId, "Businesses", "edit") },
    async (request, reply) => {
      await revokeStaff(deps.db, request.params.businessId, request.params.staffId);
      return reply.status(204).send();
    },
  );
}
