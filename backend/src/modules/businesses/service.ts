import type pg from "pg";
import { ConflictError, NotFoundError } from "../../errors.js";
import { requireRow } from "../../db-errors.js";

export type BusinessStatus = "pending" | "approved" | "rejected" | "suspended" | "archived";

export interface Business {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  website: string | null;
  address: string | null;
  socialLinks: Record<string, string>;
  logoUrl: string | null;
  coverUrl: string | null;
  status: BusinessStatus;
  rejectionReason: string | null;
  createdAt: string;
}

interface BusinessRow {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  website: string | null;
  address: string | null;
  social_links: Record<string, string>;
  logo_url: string | null;
  cover_url: string | null;
  status: BusinessStatus;
  rejection_reason: string | null;
  created_at: string;
}

const COLUMNS = `id, owner_id, name, description, contact_phone, contact_email, website, address,
  social_links, logo_url, cover_url, status, rejection_reason, created_at`;

function toBusiness(row: BusinessRow): Business {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    description: row.description,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    website: row.website,
    address: row.address,
    socialLinks: row.social_links,
    logoUrl: row.logo_url,
    coverUrl: row.cover_url,
    status: row.status,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
  };
}

export interface BusinessInput {
  name: string;
  description?: string;
  contactPhone?: string;
  contactEmail?: string;
  website?: string;
  address?: string;
  socialLinks?: Record<string, string>;
  logoUrl?: string;
  coverUrl?: string;
}

export interface ListBusinessesOptions {
  callerId: string;
  includeAll: boolean;
  status?: string;
}

export async function listBusinesses(db: pg.Pool, options: ListBusinessesOptions): Promise<Business[]> {
  const conditions: string[] = [];
  const params: string[] = [];

  if (!options.includeAll) {
    params.push(options.callerId);
    conditions.push(`owner_id = $${params.length}`);
  }
  if (options.status) {
    params.push(options.status);
    conditions.push(`status = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await db.query<BusinessRow>(
    `SELECT ${COLUMNS} FROM businesses ${where} ORDER BY created_at DESC`,
    params,
  );
  return rows.map(toBusiness);
}

/** Applying is how a plain user becomes eligible to be a Business Owner — no permission gate. */
export async function applyAsBusinessOwner(db: pg.Pool, ownerId: string, input: BusinessInput): Promise<Business> {
  const { rows } = await db.query<BusinessRow>(
    `INSERT INTO businesses (owner_id, name, description, contact_phone, contact_email, website, address, social_links, logo_url, cover_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING ${COLUMNS}`,
    [
      ownerId,
      input.name,
      input.description ?? null,
      input.contactPhone ?? null,
      input.contactEmail ?? null,
      input.website ?? null,
      input.address ?? null,
      JSON.stringify(input.socialLinks ?? {}),
      input.logoUrl ?? null,
      input.coverUrl ?? null,
    ],
  );
  return toBusiness(rows[0]);
}

export async function getBusiness(db: pg.Pool, id: string): Promise<Business> {
  const { rows } = await db.query<BusinessRow>(`SELECT ${COLUMNS} FROM businesses WHERE id = $1`, [id]);
  return toBusiness(requireRow(rows, "Business not found"));
}

/** Used by requireOwnerOrPermission — returns null (never throws) when the business doesn't exist. */
export async function loadBusinessOwnerId(db: pg.Pool, id: string): Promise<string | null> {
  const { rows } = await db.query<{ owner_id: string }>(`SELECT owner_id FROM businesses WHERE id = $1`, [id]);
  return rows[0]?.owner_id ?? null;
}

/** Profile edits apply immediately, no re-approval (ADR 0005) — this never touches status. */
export async function updateBusiness(db: pg.Pool, id: string, input: BusinessInput): Promise<Business> {
  const { rows } = await db.query<BusinessRow>(
    `UPDATE businesses SET
       name = $1, description = $2, contact_phone = $3, contact_email = $4, website = $5,
       address = $6, social_links = $7, logo_url = $8, cover_url = $9
     WHERE id = $10
     RETURNING ${COLUMNS}`,
    [
      input.name,
      input.description ?? null,
      input.contactPhone ?? null,
      input.contactEmail ?? null,
      input.website ?? null,
      input.address ?? null,
      JSON.stringify(input.socialLinks ?? {}),
      input.logoUrl ?? null,
      input.coverUrl ?? null,
      id,
    ],
  );
  return toBusiness(requireRow(rows, "Business not found"));
}

/**
 * `rejectionReason` is tri-state: omit it to leave the column untouched (suspend/archive
 * shouldn't wipe a prior rejection's reason — that history stays until a re-approval),
 * pass a string to set it (reject), or pass `null` explicitly to clear it (approve).
 */
async function transitionStatus(
  db: pg.Pool,
  id: string,
  allowedFrom: BusinessStatus[],
  to: BusinessStatus,
  rejectionReason?: string | null,
): Promise<Business> {
  const current = await db.query<{ status: BusinessStatus }>(`SELECT status FROM businesses WHERE id = $1`, [id]);
  const row = current.rows[0];
  if (!row) {
    throw new NotFoundError("Business not found");
  }
  if (!allowedFrom.includes(row.status)) {
    throw new ConflictError(`Cannot move a "${row.status}" business to "${to}"`);
  }

  const touchRejectionReason = rejectionReason !== undefined;
  const { rows } = await db.query<BusinessRow>(
    `UPDATE businesses SET status = $1,
       rejection_reason = CASE WHEN $2 THEN $3 ELSE rejection_reason END
     WHERE id = $4
     RETURNING ${COLUMNS}`,
    [to, touchRejectionReason, rejectionReason ?? null, id],
  );
  return toBusiness(rows[0]);
}

/** Grants the Business Owner system role, idempotently — the concrete mechanism behind FR161. */
async function grantBusinessOwnerRole(db: pg.Pool, userId: string): Promise<void> {
  await db.query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT $1, id FROM roles WHERE name = 'Business Owner'
     ON CONFLICT (user_id, role_id) DO NOTHING`,
    [userId],
  );
}

export async function approveBusiness(db: pg.Pool, id: string): Promise<Business> {
  const business = await transitionStatus(db, id, ["pending", "rejected"], "approved", null);
  await grantBusinessOwnerRole(db, business.ownerId);
  return business;
}

export async function rejectBusiness(db: pg.Pool, id: string, reason: string): Promise<Business> {
  return transitionStatus(db, id, ["pending"], "rejected", reason);
}

export async function suspendBusiness(db: pg.Pool, id: string): Promise<Business> {
  return transitionStatus(db, id, ["approved"], "suspended");
}

export async function archiveBusiness(db: pg.Pool, id: string): Promise<Business> {
  return transitionStatus(db, id, ["pending", "approved", "rejected", "suspended"], "archived");
}
