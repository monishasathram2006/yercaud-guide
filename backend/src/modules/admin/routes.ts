import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { requireAuth, requirePermission } from "../../plugins/auth.js";
import { userHasPermission } from "../rbac/service.js";
import { getApprovalQueue, getDashboardKpis, listAuditLogs } from "./service.js";

interface DashboardQuery {
  from?: string;
  to?: string;
}

interface AuditLogsQuery {
  tableName?: string;
  recordId?: string;
  page?: number;
  pageSize?: number;
}

const auditLogsSchema = {
  querystring: {
    type: "object",
    properties: {
      tableName: { type: "string" },
      recordId: { type: "string", format: "uuid" },
      page: { type: "integer", minimum: 1, default: 1 },
      pageSize: { type: "integer", minimum: 1, maximum: 100, default: 20 },
    },
  },
};

export async function registerAdminRoutes(app: FastifyInstance, deps: Required<AppDeps>): Promise<void> {
  app.get("/admin/approval-queue", { preHandler: requirePermission(deps.db, "Admins", "view") }, async () => {
    return getApprovalQueue(deps.db);
  });

  app.get<{ Querystring: DashboardQuery }>(
    "/admin/dashboard",
    { preHandler: requireAuth },
    async (request) => {
      // Not `Businesses:view`/`Listings:view`/etc. — each is also held by the
      // resource's own owning role (see the fix in 984796f). `Admins:view` is
      // the only permission no Business Owner ever holds.
      const includeAll = await userHasPermission(deps.db, request.currentUser!.id, "Admins", "view");
      return getDashboardKpis(
        deps.db,
        { callerId: request.currentUser!.id, includeAll },
        request.query.from,
        request.query.to,
      );
    },
  );

  app.get<{ Querystring: AuditLogsQuery }>(
    "/audit-logs",
    { schema: auditLogsSchema, preHandler: requirePermission(deps.db, "Admins", "view") },
    async (request) => {
      return listAuditLogs(deps.db, {
        tableName: request.query.tableName,
        recordId: request.query.recordId,
        page: request.query.page ?? 1,
        pageSize: request.query.pageSize ?? 20,
      });
    },
  );
}
