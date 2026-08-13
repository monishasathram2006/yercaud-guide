import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";

export const VISITOR_ID_COOKIE_NAME = "visitor_id";

/**
 * The anonymous-friendly visitor identity behind View tracking (issue #16,
 * ADR-0013) — generic and shared (not listings-specific), since a sibling
 * ticket reuses it for Blog Post views.
 *
 * Deliberately separate from the auth session cookie: it identifies "this
 * browser" for dedup purposes regardless of sign-in state, is opaque (no
 * PII), and outlives a login session (400 days — the practical browser
 * maximum for a cookie's Max-Age). Reads the existing cookie if present;
 * otherwise mints one and sets it on the reply.
 */
export function getOrSetVisitorId(request: FastifyRequest, reply: FastifyReply): string {
  const existing = request.cookies[VISITOR_ID_COOKIE_NAME];
  if (existing) {
    return existing;
  }

  const id = randomUUID();
  reply.setCookie(VISITOR_ID_COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.secureCookies,
    path: "/",
    maxAge: 400 * 24 * 60 * 60,
  });
  return id;
}
