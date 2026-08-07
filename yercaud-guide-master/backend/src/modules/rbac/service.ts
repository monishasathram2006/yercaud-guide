import type pg from "pg";
import { NotFoundError } from "../../errors.js";

export interface RoleSummary {
  id: string;
  name: string;
  isSystem: boolean;
}

export interface PermissionGrant {
  module: string;
  action: string;
}

/**
 * Embeds each role's permission grants (the Role schema always allowed it) —
 * the Roles & Permissions screen renders a matrix, and without this the only
 * way to see a role's grants was to overwrite them.
 */
export async function listRoles(db: pg.Pool): Promise<(RoleSummary & { permissions: PermissionGrant[] })[]> {
  const { rows } = await db.query<{ id: string; name: string; is_system: boolean; permissions: PermissionGrant[] }>(
    `SELECT r.id, r.name, r.is_system,
       COALESCE(
         json_agg(json_build_object('module', p.module, 'action', p.action) ORDER BY p.module, p.action)
           FILTER (WHERE p.id IS NOT NULL),
         '[]'
       ) AS permissions
     FROM roles r
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     LEFT JOIN permissions p ON p.id = rp.permission_id
     GROUP BY r.id
     ORDER BY r.name`,
  );
  return rows.map((r) => ({ id: r.id, name: r.name, isSystem: r.is_system, permissions: r.permissions }));
}

export async function createRole(db: pg.Pool, name: string): Promise<RoleSummary> {
  const { rows } = await db.query<{ id: string; name: string; is_system: boolean }>(
    `INSERT INTO roles (name, is_system) VALUES ($1, false) RETURNING id, name, is_system`,
    [name],
  );
  const row = rows[0];
  return { id: row.id, name: row.name, isSystem: row.is_system };
}

export async function setRolePermissions(db: pg.Pool, roleId: string, grants: PermissionGrant[]): Promise<void> {
  const role = await db.query(`SELECT id FROM roles WHERE id = $1`, [roleId]);
  if (role.rows.length === 0) {
    throw new NotFoundError("Role not found");
  }

  await db.query(`DELETE FROM role_permissions WHERE role_id = $1`, [roleId]);

  for (const grant of grants) {
    await db.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT $1, id FROM permissions WHERE module = $2 AND action = $3`,
      [roleId, grant.module, grant.action],
    );
  }
}

export async function assignUserRoles(db: pg.Pool, userId: string, roleIds: string[]): Promise<void> {
  const user = await db.query(`SELECT id FROM users WHERE id = $1`, [userId]);
  if (user.rows.length === 0) {
    throw new NotFoundError("User not found");
  }

  await db.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
  for (const roleId of roleIds) {
    await db.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [userId, roleId]);
  }
}

/** Phase 6 audit retrofit — captures the "before" state ahead of setRolePermissions'/assignUserRoles' full replace. */
export async function listRolePermissions(db: pg.Pool, roleId: string): Promise<PermissionGrant[]> {
  const { rows } = await db.query<PermissionGrant>(
    `SELECT p.module, p.action FROM role_permissions rp
     JOIN permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = $1
     ORDER BY p.module, p.action`,
    [roleId],
  );
  return rows;
}

export async function listUserRoleIds(db: pg.Pool, userId: string): Promise<string[]> {
  const { rows } = await db.query<{ role_id: string }>(`SELECT role_id FROM user_roles WHERE user_id = $1`, [
    userId,
  ]);
  return rows.map((r) => r.role_id);
}

/**
 * Every permission a User holds, unioned across their Roles.
 *
 * The set-shaped sibling of userHasPermission, for /auth/me: it lets the Admin
 * panel render what the caller can actually do, so a Super-Admin-created custom
 * Role works with no frontend change. DISTINCT because a permission held via two
 * Roles is one permission.
 *
 * Advisory only. Endpoints keep their own guards — this exists so the UI doesn't
 * offer buttons the API will 403.
 */
export async function listUserPermissions(db: pg.Pool, userId: string): Promise<PermissionGrant[]> {
  const { rows } = await db.query<PermissionGrant>(
    `SELECT DISTINCT p.module, p.action
     FROM user_roles ur
     JOIN role_permissions rp ON rp.role_id = ur.role_id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE ur.user_id = $1
     ORDER BY p.module, p.action`,
    [userId],
  );
  return rows;
}

export async function userHasPermission(db: pg.Pool, userId: string, module: string, action: string): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1
     FROM user_roles ur
     JOIN role_permissions rp ON rp.role_id = ur.role_id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE ur.user_id = $1 AND p.module = $2 AND p.action = $3
     LIMIT 1`,
    [userId, module, action],
  );
  return rows.length > 0;
}
