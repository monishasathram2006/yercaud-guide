import type pg from "pg";
import { BadRequestError, NotFoundError } from "../../errors.js";

// ADR 0003 ties a rich category to its detail table only by convention, not
// by an explicit schema column — the category's slug is the de facto "kind"
// identifier (same convention GET /listings?category=<slug> already relies on).
async function categorySlugFor(db: pg.Pool, listingId: string): Promise<string | null> {
  const { rows } = await db.query<{ slug: string }>(
    `SELECT c.slug FROM listings l JOIN categories c ON c.id = l.category_id WHERE l.id = $1`,
    [listingId],
  );
  return rows[0]?.slug ?? null;
}

/** Read-time: a category mismatch (or missing Listing) is a 404 — don't confirm a Listing exists under a shape it doesn't have. */
export async function requireCategoryForRead(db: pg.Pool, listingId: string, expectedSlug: string): Promise<void> {
  const slug = await categorySlugFor(db, listingId);
  if (slug !== expectedSlug) {
    throw new NotFoundError("Listing not found");
  }
}

/** Write-time: the Listing's existence was already confirmed by the auth guard, so a category mismatch is a 400, not a 404. */
export async function requireCategoryForWrite(
  db: pg.Pool,
  listingId: string,
  expectedSlug: string,
  categoryLabel: string,
): Promise<void> {
  const slug = await categorySlugFor(db, listingId);
  if (slug !== expectedSlug) {
    throw new BadRequestError(`This Listing's category is not ${categoryLabel}`);
  }
}
