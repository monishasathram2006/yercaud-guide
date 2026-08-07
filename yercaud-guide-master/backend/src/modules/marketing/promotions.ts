import type pg from "pg";
import { BadRequestError } from "../../errors.js";
import { requireDeleted, requireRow } from "../../db-errors.js";

export type PromotionStatus = "draft" | "pending" | "active" | "expired";

export interface Promotion {
  id: string;
  listingId: string;
  title: string;
  discountPercent: number | null;
  startDate: string;
  endDate: string;
  status: PromotionStatus;
  imageUrl: string | null;
}

interface PromotionRow {
  id: string;
  listing_id: string;
  title: string;
  discount_percent: number | null;
  start_date: string;
  end_date: string;
  status: PromotionStatus;
  image_url: string | null;
}

/**
 * The DATE columns are cast to text in-query rather than mapped from pg's
 * JS Date. A DATE has no timezone, but node-pg hands it back as a Date at
 * *local* midnight — so `.toISOString()` shifts it a day backwards anywhere
 * east of UTC, and a read-modify-write PATCH would walk the date back one
 * day per edit. Casting keeps 'YYYY-MM-DD' exactly as stored.
 */
function columns(alias = ""): string {
  return `${alias}id, ${alias}listing_id, ${alias}title, ${alias}discount_percent,
    to_char(${alias}start_date, 'YYYY-MM-DD') AS start_date,
    to_char(${alias}end_date, 'YYYY-MM-DD') AS end_date,
    ${alias}status, ${alias}image_url`;
}

const COLUMNS = columns();

function toPromotion(row: PromotionRow): Promotion {
  return {
    id: row.id,
    listingId: row.listing_id,
    title: row.title,
    discountPercent: row.discount_percent,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    imageUrl: row.image_url,
  };
}

/**
 * Publicly visible = explicitly activated AND currently within its window.
 * Both are independently-settable real columns, so both are checked — an
 * `active` promotion whose end_date has passed is not public, and neither is
 * an in-range one still sitting in draft (see Phase 7 spec). `alias` is an
 * optional "table." prefix for queries that join.
 */
function publicVisibilityClause(alias = ""): string {
  return `${alias}status = 'active' AND CURRENT_DATE BETWEEN ${alias}start_date AND ${alias}end_date`;
}

export interface PromotionInput {
  listingId: string;
  title: string;
  discountPercent?: number;
  startDate: string;
  endDate: string;
  imageUrl?: string;
}

/** Status is never settable on create — a new Promotion always starts at the column's `draft` default. */
export async function createPromotion(db: pg.Pool, input: PromotionInput): Promise<Promotion> {
  const { rows } = await db.query<PromotionRow>(
    `INSERT INTO promotions (listing_id, title, discount_percent, start_date, end_date, image_url)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${COLUMNS}`,
    [input.listingId, input.title, input.discountPercent ?? null, input.startDate, input.endDate, input.imageUrl ?? null],
  );
  return toPromotion(rows[0]);
}

export async function getPromotion(db: pg.Pool, id: string): Promise<Promotion> {
  const { rows } = await db.query<PromotionRow>(`SELECT ${COLUMNS} FROM promotions WHERE id = $1`, [id]);
  return toPromotion(requireRow(rows, "Promotion not found"));
}

/** Used by requireOwnerOrPermission — returns null (never throws) when the Promotion doesn't exist. */
export async function loadPromotionOwnerId(db: pg.Pool, id: string): Promise<string | null> {
  const { rows } = await db.query<{ owner_id: string }>(
    `SELECT b.owner_id FROM promotions p
     JOIN listings l ON l.id = p.listing_id
     JOIN businesses b ON b.id = l.business_id
     WHERE p.id = $1`,
    [id],
  );
  return rows[0]?.owner_id ?? null;
}

export interface ListPromotionsOptions {
  listingId?: string;
  callerId?: string;
  /** Holds Marketing:view (Super Admin) — sees every Promotion in every status. */
  includeAll: boolean;
}

export async function listPromotions(db: pg.Pool, options: ListPromotionsOptions): Promise<Promotion[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.listingId) {
    params.push(options.listingId);
    conditions.push(`p.listing_id = $${params.length}`);
  }

  if (!options.includeAll) {
    if (options.callerId) {
      // A signed-in caller sees every status on their own Listings' Promotions,
      // plus everyone else's publicly-visible ones.
      params.push(options.callerId);
      conditions.push(`(b.owner_id = $${params.length} OR (${publicVisibilityClause("p.")}))`);
    } else {
      conditions.push(publicVisibilityClause("p."));
    }
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await db.query<PromotionRow>(
    `SELECT ${columns("p.")}
     FROM promotions p
     JOIN listings l ON l.id = p.listing_id
     JOIN businesses b ON b.id = l.business_id
     ${where} ORDER BY p.created_at DESC`,
    params,
  );
  return rows.map(toPromotion);
}

export async function isPromotionPubliclyVisible(db: pg.Pool, id: string): Promise<boolean> {
  const { rows } = await db.query(`SELECT 1 FROM promotions WHERE id = $1 AND ${publicVisibilityClause()}`, [id]);
  return rows.length > 0;
}

export interface UpdatePromotionInput {
  title?: string;
  discountPercent?: number | null;
  startDate?: string;
  endDate?: string;
  imageUrl?: string | null;
  status?: PromotionStatus;
}

/**
 * One PATCH serves both callers, with different allowed status moves: an
 * owner may submit for review (draft -> pending) and retire a finished
 * campaign (active -> expired); an admin can do everything an owner can,
 * plus approve (pending -> active) and send back for changes
 * (pending -> draft). The `promotions.status` enum has no `rejected` value,
 * so "reject" is a move back to draft, not a terminal state.
 *
 * `expired` is only reachable from `active` — expiring a campaign that was
 * never live is meaningless. Nothing sets it automatically; there's no
 * scheduled job in this codebase, and public visibility already excludes
 * out-of-range promotions regardless of status (see Phase 7 spec).
 */
const OWNER_TRANSITIONS: Record<PromotionStatus, PromotionStatus[]> = {
  draft: ["pending"],
  pending: [],
  active: ["expired"],
  expired: [],
};

/** Derived, not hand-maintained: an admin is strictly an owner plus the two moderation moves. */
const ADMIN_TRANSITIONS: Record<PromotionStatus, PromotionStatus[]> = {
  ...OWNER_TRANSITIONS,
  pending: [...OWNER_TRANSITIONS.pending, "active", "draft"],
};

export async function updatePromotion(
  db: pg.Pool,
  id: string,
  input: UpdatePromotionInput,
  isAdmin: boolean,
): Promise<Promotion> {
  const current = await getPromotion(db, id);

  if (input.status !== undefined && input.status !== current.status) {
    const allowed = (isAdmin ? ADMIN_TRANSITIONS : OWNER_TRANSITIONS)[current.status];
    if (!allowed.includes(input.status)) {
      throw new BadRequestError(
        `Cannot move a "${current.status}" promotion to "${input.status}"${isAdmin ? "" : " — only a Super Admin can approve a promotion"}`,
      );
    }
  }

  const next = {
    title: input.title ?? current.title,
    discountPercent: input.discountPercent === undefined ? current.discountPercent : input.discountPercent,
    startDate: input.startDate ?? current.startDate,
    endDate: input.endDate ?? current.endDate,
    imageUrl: input.imageUrl === undefined ? current.imageUrl : input.imageUrl,
    status: input.status ?? current.status,
  };

  const { rows } = await db.query<PromotionRow>(
    `UPDATE promotions SET title = $1, discount_percent = $2, start_date = $3, end_date = $4, image_url = $5, status = $6
     WHERE id = $7
     RETURNING ${COLUMNS}`,
    [next.title, next.discountPercent, next.startDate, next.endDate, next.imageUrl, next.status, id],
  );
  // getPromotion above already 404'd if it didn't exist.
  return toPromotion(rows[0]);
}

/** Hard delete, not archive — a Promotion carries no dependent history worth keeping (unlike ADR 0010's Businesses/Listings). */
export async function deletePromotion(db: pg.Pool, id: string): Promise<void> {
  const { rowCount } = await db.query(`DELETE FROM promotions WHERE id = $1`, [id]);
  requireDeleted(rowCount, "Promotion not found");
}
