import { randomBytes, createHash } from "node:crypto";
import type pg from "pg";
import type { FastifyReply } from "fastify";
import { config } from "../../config.js";
import { getPublicUserById, type PublicUser } from "./service.js";

export type SessionUser = PublicUser;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Raw token goes in the cookie; only its hash is ever stored (mirrors
 * password_hash). `impersonatedBy` is set only for a session created via
 * Super Admin "view as" (FR160) — the admin who started it.
 */
export async function createSession(db: pg.Pool, userId: string, impersonatedBy?: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000);

  await db.query(`INSERT INTO sessions (user_id, token_hash, expires_at, impersonated_by) VALUES ($1, $2, $3, $4)`, [
    userId,
    tokenHash,
    expiresAt,
    impersonatedBy ?? null,
  ]);

  return token;
}

export interface ResolvedSession {
  user: SessionUser;
  /** Non-null only while the session is an active impersonation session. */
  impersonatedBy: string | null;
}

export async function resolveSession(db: pg.Pool, token: string): Promise<ResolvedSession | null> {
  const tokenHash = hashToken(token);

  // Sliding expiry: a valid session's expiry is pushed out on every use,
  // rather than fixed at login time.
  const newExpiresAt = new Date(Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000);
  const { rows } = await db.query<{ user_id: string; impersonated_by: string | null }>(
    `UPDATE sessions SET expires_at = $1
     WHERE token_hash = $2 AND expires_at > NOW()
     RETURNING user_id, impersonated_by`,
    [newExpiresAt, tokenHash],
  );
  const row = rows[0];
  if (!row) return null;

  const user = await getPublicUserById(db, row.user_id);
  if (!user) return null;
  return { user, impersonatedBy: row.impersonated_by };
}

export async function deleteSession(db: pg.Pool, token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await db.query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash]);
}

/** Shared by every login path (password, Google) that needs to hand back a session. */
export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(config.sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.secureCookies,
    path: "/",
    maxAge: config.sessionTtlDays * 24 * 60 * 60,
  });
}

export function hashOpaqueToken(token: string): string {
  return hashToken(token);
}

export function generateOpaqueToken(): string {
  return randomBytes(32).toString("hex");
}
