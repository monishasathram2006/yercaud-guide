import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type pg from "pg";
import { resolveSession, type SessionUser } from "../modules/auth/session.js";
import { userHasPermission } from "../modules/rbac/service.js";
import { config } from "../config.js";
import { ForbiddenError, UnauthorizedError } from "../errors.js";

export async function registerAuthPlugin(app: FastifyInstance, db: pg.Pool): Promise<void> {
  app.decorateRequest("currentUser", null);
  app.decorateRequest("impersonatedBy", null);

  app.addHook("onRequest", async (request) => {
    const token = request.cookies[config.sessionCookieName];
    if (!token) return;
    const resolved = await resolveSession(db, token);
    if (resolved) {
      request.currentUser = resolved.user;
      request.impersonatedBy = resolved.impersonatedBy;
    }
  });
}

// Must be async: a synchronous preHandler that returns without throwing gives
// Fastify no signal it has finished (no Promise, no done() callback) and it
// hangs forever on the success path. Only the throw path short-circuits.
export async function requireAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!request.currentUser) {
    throw new UnauthorizedError();
  }
}

/** 401 (not signed in) is distinct from 403 (signed in, lacks the permission) — see Phase 1 spec. */
export function requirePermission(db: pg.Pool, module: string, action: string) {
  return async function requirePermissionHandler(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!request.currentUser) {
      throw new UnauthorizedError();
    }
    const allowed = await userHasPermission(db, request.currentUser.id, module, action);
    if (!allowed) {
      throw new ForbiddenError();
    }
  };
}

/** Allows acting on your own record with no permission needed, or anyone else's record if you hold the permission. */
export function requireSelfOrPermission(
  db: pg.Pool,
  paramName: string,
  module: string,
  action: string,
) {
  return async function requireSelfOrPermissionHandler(
    request: FastifyRequest<{ Params: Record<string, string> }>,
    _reply: FastifyReply,
  ): Promise<void> {
    if (!request.currentUser) {
      throw new UnauthorizedError();
    }
    if (request.params[paramName] === request.currentUser.id) {
      return;
    }
    const allowed = await userHasPermission(db, request.currentUser.id, module, action);
    if (!allowed) {
      throw new ForbiddenError();
    }
  };
}

/**
 * Allows acting on a resource you own (looked up via `loadOwnerId`), or any
 * resource if you hold the permission. Unlike requireSelfOrPermission, "self"
 * here isn't a direct param-to-session-user match — it's a lookup, since the
 * param identifies the resource, not the user.
 */
export function requireOwnerOrPermission(
  db: pg.Pool,
  paramName: string,
  loadOwnerId: (db: pg.Pool, id: string) => Promise<string | null>,
  module: string,
  action: string,
) {
  return async function requireOwnerOrPermissionHandler(
    request: FastifyRequest<{ Params: Record<string, string> }>,
    _reply: FastifyReply,
  ): Promise<void> {
    if (!request.currentUser) {
      throw new UnauthorizedError();
    }
    const ownerId = await loadOwnerId(db, request.params[paramName]);
    if (ownerId !== null && ownerId === request.currentUser.id) {
      return;
    }
    const allowed = await userHasPermission(db, request.currentUser.id, module, action);
    if (!allowed) {
      throw new ForbiddenError();
    }
  };
}

declare module "fastify" {
  interface FastifyRequest {
    currentUser: SessionUser | null;
    /** Non-null only while the current session is an active impersonation session (FR160). */
    impersonatedBy: string | null;
  }
}
