import type pg from "pg";
import { ConflictError, NotFoundError } from "../../errors.js";
import { isForeignKeyViolation } from "../../db-errors.js";
import { toPublicUser, type PublicUser, type UserRow } from "../auth/service.js";

interface UserListRow extends UserRow {
  roles: string[];
}

export interface ListUsersOptions {
  q?: string;
  status?: string;
}

/** Single query with array_agg for roles, not one query per user (N+1). Reuses toPublicUser (auth/service.ts) for the row mapping, not a second copy of it. */
export async function listUsers(db: pg.Pool, options: ListUsersOptions): Promise<PublicUser[]> {
  const { rows } = await db.query<UserListRow>(
    `SELECT u.id, u.email, u.name, u.phone, u.avatar_url, u.bio, u.status, u.created_at,
       COALESCE(array_agg(r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     WHERE ($1::text IS NULL OR u.name ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%')
       AND ($2::text IS NULL OR u.status = $2)
     GROUP BY u.id
     ORDER BY u.created_at DESC`,
    [options.q ?? null, options.status ?? null],
  );
  return rows.map((row) => toPublicUser(row, row.roles));
}

/** Suspend/reactivate — the only two states an admin sets; 'deleted' is DELETE's. */
export async function setUserStatus(db: pg.Pool, userId: string, status: "active" | "suspended"): Promise<PublicUser> {
  const { rows } = await db.query<UserRow>(
    `UPDATE users SET status = $2 WHERE id = $1
     RETURNING id, email, name, phone, avatar_url, bio, status, created_at`,
    [userId, status],
  );
  if (!rows[0]) {
    throw new NotFoundError("User not found");
  }
  const { rows: roleRows } = await db.query<{ name: string }>(
    `SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = $1`,
    [userId],
  );
  return toPublicUser(rows[0], roleRows.map((r) => r.name));
}

export async function deleteUser(db: pg.Pool, userId: string): Promise<void> {
  try {
    const { rowCount } = await db.query(`DELETE FROM users WHERE id = $1`, [userId]);
    if (rowCount === 0) {
      throw new NotFoundError("User not found");
    }
  } catch (error) {
    // Postgres FK violation (e.g. ADR 0009 RESTRICT: still owns a Business/Blog Post).
    if (isForeignKeyViolation(error)) {
      throw new ConflictError(
        "This account still owns Businesses or content that must be reassigned or removed first",
      );
    }
    throw error;
  }
}
