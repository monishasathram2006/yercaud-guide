import type pg from "pg";
import { BadRequestError, ForbiddenError } from "../../errors.js";
import { mapUniqueViolation, requireDeleted, requireRow } from "../../db-errors.js";

export type BusinessStaffStatus = "pending" | "accepted" | "revoked";

export interface BusinessStaff {
  id: string;
  businessId: string;
  userId: string;
  email: string;
  permissions: Record<string, boolean>;
  status: BusinessStaffStatus;
}

interface BusinessStaffRow {
  id: string;
  business_id: string;
  user_id: string;
  email: string;
  permissions: Record<string, boolean>;
  status: BusinessStaffStatus;
}

const COLUMNS = "bs.id, bs.business_id, bs.user_id, u.email, bs.permissions, bs.status";

function toBusinessStaff(row: BusinessStaffRow): BusinessStaff {
  return {
    id: row.id,
    businessId: row.business_id,
    userId: row.user_id,
    email: row.email,
    permissions: row.permissions,
    status: row.status,
  };
}

export async function listStaff(db: pg.Pool, businessId: string): Promise<BusinessStaff[]> {
  const { rows } = await db.query<BusinessStaffRow>(
    `SELECT ${COLUMNS} FROM business_staff bs JOIN users u ON u.id = bs.user_id
     WHERE bs.business_id = $1 ORDER BY bs.created_at`,
    [businessId],
  );
  return rows.map(toBusinessStaff);
}

export interface InviteStaffInput {
  email: string;
  permissions?: Record<string, boolean>;
}

/** The invited email must belong to an existing registered user — no email-invite-token flow (see spec). */
export async function inviteStaff(
  db: pg.Pool,
  businessId: string,
  invitedBy: string,
  input: InviteStaffInput,
): Promise<BusinessStaff> {
  const user = await db.query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [input.email]);
  const userId = user.rows[0]?.id;
  if (!userId) {
    throw new BadRequestError("No registered user with that email");
  }

  return mapUniqueViolation(async () => {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO business_staff (business_id, user_id, invited_by, permissions)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [businessId, userId, invitedBy, JSON.stringify(input.permissions ?? {})],
    );
    return toBusinessStaff(await getStaffRow(db, businessId, rows[0].id));
  }, "This user is already staff on this business");
}

async function getStaffRow(db: pg.Pool, businessId: string, staffId: string): Promise<BusinessStaffRow> {
  const { rows } = await db.query<BusinessStaffRow>(
    `SELECT ${COLUMNS} FROM business_staff bs JOIN users u ON u.id = bs.user_id
     WHERE bs.id = $1 AND bs.business_id = $2`,
    [staffId, businessId],
  );
  return requireRow(rows, "Staff member not found");
}

export async function getStaffMember(db: pg.Pool, businessId: string, staffId: string): Promise<BusinessStaff> {
  return toBusinessStaff(await getStaffRow(db, businessId, staffId));
}

export interface UpdateStaffInput {
  status?: BusinessStaffStatus;
  permissions?: Record<string, boolean>;
}

/** Owner (or Businesses:edit) — may change status to any value and/or the permission grants. */
export async function updateStaffAsOwner(
  db: pg.Pool,
  businessId: string,
  staffId: string,
  input: UpdateStaffInput,
): Promise<BusinessStaff> {
  const current = await getStaffRow(db, businessId, staffId);
  const status = input.status ?? current.status;
  const permissions = input.permissions ?? current.permissions;

  // getStaffRow above already confirmed this row exists, so this UPDATE always affects one row.
  await db.query(`UPDATE business_staff SET status = $1, permissions = $2 WHERE id = $3 AND business_id = $4`, [
    status,
    JSON.stringify(permissions),
    staffId,
    businessId,
  ]);
  return toBusinessStaff(await getStaffRow(db, businessId, staffId));
}

/** The invited staff member accepting their own invite — the only self-service transition allowed. */
export async function acceptOwnInvite(
  db: pg.Pool,
  businessId: string,
  staffId: string,
  callerId: string,
): Promise<BusinessStaff> {
  const current = await getStaffRow(db, businessId, staffId);
  if (current.user_id !== callerId) {
    throw new ForbiddenError();
  }
  if (current.status !== "pending") {
    throw new ForbiddenError("Only a pending invite can be accepted");
  }

  await db.query(`UPDATE business_staff SET status = 'accepted' WHERE id = $1 AND business_id = $2`, [
    staffId,
    businessId,
  ]);
  return toBusinessStaff(await getStaffRow(db, businessId, staffId));
}

export async function revokeStaff(db: pg.Pool, businessId: string, staffId: string): Promise<void> {
  const { rowCount } = await db.query(`DELETE FROM business_staff WHERE id = $1 AND business_id = $2`, [
    staffId,
    businessId,
  ]);
  requireDeleted(rowCount, "Staff member not found");
}
