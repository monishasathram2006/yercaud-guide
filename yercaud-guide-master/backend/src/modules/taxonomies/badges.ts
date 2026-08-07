import type pg from "pg";
import { mapUniqueViolation, requireDeleted, requireRow } from "../../db-errors.js";

/**
 * FR30's promotional badge vocabulary (Popular, Luxury, Best Seller, Budget).
 *
 * A lookup rather than a free-text column on listings: BusinessCard styles a
 * badge by switching on its string, so free text means a typo renders unstyled
 * and nobody notices until a customer does. The colour lives in the row — the
 * same precedent as categories.color — so the public site never hardcodes a
 * badge-to-colour map.
 *
 * Assigning a badge to a Listing is a Marketing act and lives with the Listing
 * routes, not here; this module only owns the vocabulary.
 */
export interface Badge {
  id: string;
  label: string;
  color: string | null;
  sortOrder: number;
}

interface BadgeRow {
  id: string;
  label: string;
  color: string | null;
  sort_order: number;
}

function toBadge(row: BadgeRow): Badge {
  return { id: row.id, label: row.label, color: row.color, sortOrder: row.sort_order };
}

export interface BadgeInput {
  label: string;
  color?: string | null;
  sortOrder?: number;
}

export async function listBadges(db: pg.Pool): Promise<Badge[]> {
  const { rows } = await db.query<BadgeRow>(
    `SELECT id, label, color, sort_order FROM badges ORDER BY sort_order, label`,
  );
  return rows.map(toBadge);
}

export async function createBadge(db: pg.Pool, input: BadgeInput): Promise<Badge> {
  return mapUniqueViolation(async () => {
    const { rows } = await db.query<BadgeRow>(
      `INSERT INTO badges (label, color, sort_order) VALUES ($1, $2, $3)
       RETURNING id, label, color, sort_order`,
      [input.label, input.color ?? null, input.sortOrder ?? 0],
    );
    return toBadge(rows[0]);
  }, `A badge labelled "${input.label}" already exists`);
}

export async function updateBadge(db: pg.Pool, id: string, input: BadgeInput): Promise<Badge> {
  return mapUniqueViolation(async () => {
    const { rows } = await db.query<BadgeRow>(
      `UPDATE badges SET label = $1, color = $2, sort_order = $3 WHERE id = $4
       RETURNING id, label, color, sort_order`,
      [input.label, input.color ?? null, input.sortOrder ?? 0, id],
    );
    return toBadge(requireRow(rows, "Badge not found"));
  }, `A badge labelled "${input.label}" already exists`);
}

export async function deleteBadge(db: pg.Pool, id: string): Promise<void> {
  const { rowCount } = await db.query(`DELETE FROM badges WHERE id = $1`, [id]);
  requireDeleted(rowCount, "Badge not found");
}
