import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { requirePermission, requireSelfOrPermission } from "../../plugins/auth.js";
import { logAudit } from "../../audit.js";
import { getPublicUserById } from "../auth/service.js";
import {
  assignUserRoles,
  createRole,
  listRolePermissions,
  listRoles,
  listUserRoleIds,
  setRolePermissions,
  type PermissionGrant,
} from "./service.js";
import { deleteUser, listUsers, setUserStatus } from "./users.js";

interface CreateRoleBody {
  name: string;
}

interface AssignRolesBody {
  roleIds: string[];
}

interface ListUsersQuery {
  q?: string;
  status?: string;
}

export async function registerRbacRoutes(app: FastifyInstance, deps: Required<AppDeps>): Promise<void> {
  app.get("/roles", { preHandler: requirePermission(deps.db, "Admins", "view") }, async () => {
    return listRoles(deps.db);
  });

  app.get<{ Querystring: ListUsersQuery }>(
    "/users",
    { preHandler: requirePermission(deps.db, "Users", "view") },
    async (request) => {
      return listUsers(deps.db, { q: request.query.q, status: request.query.status });
    },
  );

  app.post<{ Body: CreateRoleBody }>(
    "/roles",
    { preHandler: requirePermission(deps.db, "Admins", "create") },
    async (request, reply) => {
      const role = await createRole(deps.db, request.body.name);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "roles.create",
        tableName: "roles",
        recordId: role.id,
        newData: { name: role.name },
      });
      return reply.status(201).send(role);
    },
  );

  app.put<{ Body: PermissionGrant[]; Params: { roleId: string } }>(
    "/roles/:roleId/permissions",
    { preHandler: requirePermission(deps.db, "Admins", "edit") },
    async (request) => {
      const before = await listRolePermissions(deps.db, request.params.roleId);
      await setRolePermissions(deps.db, request.params.roleId, request.body);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "roles.set_permissions",
        tableName: "role_permissions",
        recordId: request.params.roleId,
        oldData: { permissions: before },
        newData: { permissions: request.body },
      });
      return { updated: true };
    },
  );

  app.put<{ Body: AssignRolesBody; Params: { userId: string } }>(
    "/users/:userId/roles",
    { preHandler: requirePermission(deps.db, "Users", "edit") },
    async (request) => {
      const before = await listUserRoleIds(deps.db, request.params.userId);
      await assignUserRoles(deps.db, request.params.userId, request.body.roleIds);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "users.assign_roles",
        tableName: "user_roles",
        recordId: request.params.userId,
        oldData: { roleIds: before },
        newData: { roleIds: request.body.roleIds },
      });
      return { updated: true };
    },
  );

  // In the contract since Phase 0.5, unimplemented until the Admin panel's
  // Users page needed it (Phase 10). Only active/suspended are assignable:
  // 'deleted' is DELETE's outcome, not a status an admin writes.
  app.patch<{ Body: { status: "active" | "suspended" }; Params: { userId: string } }>(
    "/users/:userId",
    {
      schema: {
        body: {
          type: "object",
          required: ["status"],
          properties: { status: { type: "string", enum: ["active", "suspended"] } },
        },
      },
      preHandler: requirePermission(deps.db, "Users", "edit"),
    },
    async (request) => {
      const before = await getPublicUserById(deps.db, request.params.userId);
      const user = await setUserStatus(deps.db, request.params.userId, request.body.status);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "users.set_status",
        tableName: "users",
        recordId: request.params.userId,
        oldData: before ? { status: before.status } : undefined,
        newData: { status: user.status },
      });
      return user;
    },
  );

  app.delete<{ Params: { userId: string } }>(
    "/users/:userId",
    { preHandler: requireSelfOrPermission(deps.db, "userId", "Users", "delete") },
    async (request, reply) => {
      const before = await getPublicUserById(deps.db, request.params.userId);
      await deleteUser(deps.db, request.params.userId);
      // Logged *after* the delete succeeds (so a blocked delete — e.g. still
      // owns a Business, ADR 0009 RESTRICT — never gets an audit entry for a
      // deletion that didn't happen). On self-delete, actorId can't
      // reference the row that was just removed (the FK would fail at
      // INSERT time, before ON DELETE SET NULL ever gets a chance to run),
      // so it's recorded as null directly — the same end state SET NULL
      // would produce for any other actor deleted later.
      const actorId = request.currentUser!.id === request.params.userId ? null : request.currentUser!.id;
      await logAudit(deps.db, {
        actorId,
        action: "users.delete",
        tableName: "users",
        recordId: request.params.userId,
        oldData: before ? { email: before.email, name: before.name, status: before.status } : undefined,
      });
      return reply.status(204).send();
    },
  );
}
