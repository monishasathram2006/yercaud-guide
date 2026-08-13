import type pg from "pg";
import { requireDeleted, requireRow } from "../../db-errors.js";
import { ConflictError } from "../../errors.js";
import { FEATURED_RANKING_DEFAULTS } from "../featured/config.js";

/**
 * Sponsored placements (issue #22, ADR-0012) — repurposes the
 * featured_listings table and its date-range/sort-order shape, which
 * previously backed pure Super-Admin editorial curation (the old flat
 * "Featured in Yercaud" strip). Same table, same columns; the meaning is
 * now "paid, off-platform-arranged visibility", capped per category by
 * assertWithinCategoryCap below.
 */
export interface SponsoredPlacement {
  id: string;
  listingId: string;
  startDate: string;
  endDate: string | null;
  sortOrder: number;
}

interface SponsoredPlacementRow {
  id: string;
  listing_id: string;
  start_date: string;
  end_date: string | null;
  sort_order: number;
}

// DATE columns cast to text in-query — see the same note in promotions.ts.
const COLUMNS = `id, listing_id,
  to_char(start_date, 'YYYY-MM-DD') AS start_date,
  to_char(end_date, 'YYYY-MM-DD') AS end_date,
  sort_order`;

/**
 * No status column on featured_listings — visibility is date-range only.
 * A null end_date means open-ended (schema allows it; see Phase 7 spec).
 */
const PUBLIC_VISIBILITY = `start_date <= CURRENT_DATE AND (end_date IS NULL OR end_date >= CURRENT_DATE)`;

function toSponsoredPlacement(row: SponsoredPlacementRow): SponsoredPlacement {
  return {
    id: row.id,
    listingId: row.listing_id,
    startDate: row.start_date,
    endDate: row.end_date,
    sortOrder: row.sort_order,
  };
}

/**
 * Rejects a placement whose category would exceed FEATURED_RANKING_DEFAULTS'
 * sponsoredCap for the given date range — one source of truth shared with
 * the ranking job (#19), so admin validation and the job's own capping never
 * drift apart. `excludePlacementId` lets an update re-check itself without
 * counting its own prior row.
 */
async function assertWithinCategoryCap(
  db: pg.Pool,
  listingId: string,
  startDate: string,
  endDate: string | null,
  excludePlacementId?: string,
): Promise<void> {
  const { rows } = await db.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM featured_listings fl
     JOIN listings l ON l.id = fl.listing_id
     WHERE l.category_id = (SELECT category_id FROM listings WHERE id = $1)
       AND ($4::uuid IS NULL OR fl.id != $4)
       AND fl.start_date <= COALESCE($3::date, 'infinity')
       AND COALESCE(fl.end_date, 'infinity'::date) >= $2::date`,
    [listingId, startDate, endDate, excludePlacementId ?? null],
  );
  const count = Number(rows[0].count);
  if (count >= FEATURED_RANKING_DEFAULTS.sponsoredCap) {
    throw new ConflictError(
      `This Listing's category already has ${FEATURED_RANKING_DEFAULTS.sponsoredCap} Sponsored placement(s) active in that date range`,
    );
  }
}

export interface SponsoredPlacementInput {
  listingId: string;
  startDate: string;
  endDate?: string | null;
  sortOrder?: number;
}

export async function createSponsoredPlacement(db: pg.Pool, input: SponsoredPlacementInput): Promise<SponsoredPlacement> {
  await assertWithinCategoryCap(db, input.listingId, input.startDate, input.endDate ?? null);
  const { rows } = await db.query<SponsoredPlacementRow>(
    `INSERT INTO featured_listings (listing_id, start_date, end_date, sort_order)
     VALUES ($1, $2, $3, $4)
     RETURNING ${COLUMNS}`,
    [input.listingId, input.startDate, input.endDate ?? null, input.sortOrder ?? 0],
  );
  return toSponsoredPlacement(rows[0]);
}

/** Public list — only currently-live entries, in curated order. */
export async function listActiveSponsoredPlacements(db: pg.Pool): Promise<SponsoredPlacement[]> {
  const { rows } = await db.query<SponsoredPlacementRow>(
    `SELECT ${COLUMNS} FROM featured_listings WHERE ${PUBLIC_VISIBILITY} ORDER BY sort_order`,
  );
  return rows.map(toSponsoredPlacement);
}

/** Exported for the audit-log retrofit — route handlers capture prior state before update/delete. */
export async function getSponsoredPlacement(db: pg.Pool, id: string): Promise<SponsoredPlacement> {
  const { rows } = await db.query<SponsoredPlacementRow>(`SELECT ${COLUMNS} FROM featured_listings WHERE id = $1`, [id]);
  return toSponsoredPlacement(requireRow(rows, "Sponsored placement not found"));
}

export interface UpdateSponsoredPlacementInput {
  startDate?: string;
  endDate?: string | null;
  sortOrder?: number;
}

export async function updateSponsoredPlacement(
  db: pg.Pool,
  id: string,
  input: UpdateSponsoredPlacementInput,
): Promise<SponsoredPlacement> {
  const current = await getSponsoredPlacement(db, id);
  const startDate = input.startDate ?? current.startDate;
  const endDate = input.endDate === undefined ? current.endDate : input.endDate;
  await assertWithinCategoryCap(db, current.listingId, startDate, endDate, id);
  const { rows } = await db.query<SponsoredPlacementRow>(
    `UPDATE featured_listings SET start_date = $1, end_date = $2, sort_order = $3
     WHERE id = $4
     RETURNING ${COLUMNS}`,
    [startDate, endDate, input.sortOrder ?? current.sortOrder, id],
  );
  return toSponsoredPlacement(rows[0]);
}

export async function deleteSponsoredPlacement(db: pg.Pool, id: string): Promise<void> {
  const { rowCount } = await db.query(`DELETE FROM featured_listings WHERE id = $1`, [id]);
  requireDeleted(rowCount, "Sponsored placement not found");
}
