import type pg from "pg";
import { requireRow } from "../../db-errors.js";
import { attachListingSummaries, type ListingSummary } from "../listings/service.js";

export type EnquiryStatus = "sent" | "responded" | "closed";
export type SmsStatus = "not_sent" | "pending" | "sent" | "failed";

export interface Enquiry {
  id: string;
  listingId: string;
  userId: string | null;
  /** Only populated on GET /me/enquiries (issue #13) — a profile card needs it, the owner's inbox already knows its own Listing. */
  listing?: ListingSummary;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  status: EnquiryStatus;
  ownerResponse: string | null;
  smsStatus: SmsStatus;
  createdAt: string;
}

interface EnquiryRow {
  id: string;
  listing_id: string;
  user_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  status: EnquiryStatus;
  owner_response: string | null;
  sms_status: SmsStatus;
  created_at: string;
}

const COLUMNS = "id, listing_id, user_id, name, email, phone, message, status, owner_response, sms_status, created_at";

function toEnquiry(row: EnquiryRow): Enquiry {
  return {
    id: row.id,
    listingId: row.listing_id,
    userId: row.user_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    message: row.message,
    status: row.status,
    ownerResponse: row.owner_response,
    smsStatus: row.sms_status,
    createdAt: row.created_at,
  };
}

export interface EnquiryInput {
  name: string;
  email: string;
  phone?: string;
  message: string;
}

/** `userId` is null for an anonymous visitor (ADR 0001) — sms_status defaults to 'not_sent' (ADR 0008, no send call here). */
export async function submitEnquiry(
  db: pg.Pool,
  listingId: string,
  userId: string | null,
  input: EnquiryInput,
): Promise<Enquiry> {
  const { rows } = await db.query<EnquiryRow>(
    `INSERT INTO enquiries (listing_id, user_id, name, email, phone, message)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${COLUMNS}`,
    [listingId, userId, input.name, input.email, input.phone ?? null, input.message],
  );
  return toEnquiry(rows[0]);
}

async function getEnquiry(db: pg.Pool, id: string): Promise<Enquiry> {
  const { rows } = await db.query<EnquiryRow>(`SELECT ${COLUMNS} FROM enquiries WHERE id = $1`, [id]);
  return toEnquiry(requireRow(rows, "Enquiry not found"));
}

/** Used by requireOwnerOrPermission — returns null (never throws) when the Enquiry doesn't exist. */
export async function loadEnquiryOwnerId(db: pg.Pool, id: string): Promise<string | null> {
  const { rows } = await db.query<{ owner_id: string }>(
    `SELECT b.owner_id FROM enquiries e
     JOIN listings l ON l.id = e.listing_id
     JOIN businesses b ON b.id = l.business_id
     WHERE e.id = $1`,
    [id],
  );
  return rows[0]?.owner_id ?? null;
}

export async function listMyEnquiries(db: pg.Pool, userId: string): Promise<Enquiry[]> {
  const { rows } = await db.query<EnquiryRow>(
    `SELECT ${COLUMNS} FROM enquiries WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return attachListingSummaries(db, rows.map(toEnquiry));
}

/** For My Statistics (issue #13) — a plain count, no need to hydrate every row. */
export async function countMyEnquiries(db: pg.Pool, userId: string): Promise<number> {
  const { rows } = await db.query<{ count: string }>(`SELECT COUNT(*) FROM enquiries WHERE user_id = $1`, [userId]);
  return Number(rows[0].count);
}

export interface ListEnquiriesOptions {
  callerId: string;
  /** Holds Admins:view (Super Admin) — sees every Enquiry, not just their own Listings'. */
  includeAll: boolean;
  status?: string;
}

const QUALIFIED_COLUMNS =
  "e.id, e.listing_id, e.user_id, e.name, e.email, e.phone, e.message, e.status, e.owner_response, e.sms_status, e.created_at";

export async function listEnquiries(db: pg.Pool, options: ListEnquiriesOptions): Promise<Enquiry[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (!options.includeAll) {
    params.push(options.callerId);
    conditions.push(`b.owner_id = $${params.length}`);
  }

  if (options.status) {
    params.push(options.status);
    conditions.push(`e.status = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await db.query<EnquiryRow>(
    `SELECT ${QUALIFIED_COLUMNS}
     FROM enquiries e
     JOIN listings l ON l.id = e.listing_id
     JOIN businesses b ON b.id = l.business_id
     ${where} ORDER BY e.created_at DESC`,
    params,
  );
  return rows.map(toEnquiry);
}

/** Sets status to 'responded' unless already 'closed' — a reply on a closed Enquiry doesn't re-open it. */
export async function respondToEnquiry(db: pg.Pool, id: string, text: string): Promise<Enquiry> {
  const current = await getEnquiry(db, id);
  const nextStatus: EnquiryStatus = current.status === "closed" ? "closed" : "responded";
  const { rows } = await db.query<EnquiryRow>(
    `UPDATE enquiries SET owner_response = $1, responded_at = NOW(), status = $2 WHERE id = $3 RETURNING ${COLUMNS}`,
    [text, nextStatus, id],
  );
  return toEnquiry(rows[0]);
}

/**
 * Deliberately no allowed-from guard, unlike `respondToEnquiry`'s no-reopen
 * rule — this is the free-form manual override (close without a formal
 * reply, or reopen a closed Enquiry) the spec calls for; `respondToEnquiry`
 * has its own narrower, intentionally different rule for the same field.
 */
export async function setEnquiryStatus(db: pg.Pool, id: string, status: EnquiryStatus): Promise<Enquiry> {
  const { rows } = await db.query<EnquiryRow>(`UPDATE enquiries SET status = $1 WHERE id = $2 RETURNING ${COLUMNS}`, [
    status,
    id,
  ]);
  return toEnquiry(requireRow(rows, "Enquiry not found"));
}
