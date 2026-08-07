import type pg from "pg";

export interface ListingStats {
  views: number;
  favorites: number;
  contactReveals: number;
  enquiries: number;
  /** Currently in its category's displayed Featured selection, organically (not via Sponsored). */
  featured: boolean;
  /** Currently a paid Sponsored placement (issue #22) — mutually exclusive with `featured`. */
  sponsored: boolean;
}

/**
 * What a Business Owner sees about their own Listing's interaction volume
 * and Featured/Sponsored status (issue #24) — the same signals that feed
 * Featured Score (#17, #19), so an owner can see what's actually driving
 * (or not driving) their eligibility.
 */
export async function getListingStats(db: pg.Pool, listingId: string): Promise<ListingStats> {
  const [{ rows: countRows }, { rows: rankingRows }] = await Promise.all([
    db.query<{ views: string; favorites: string; contact_reveals: string; enquiries: string }>(
      `SELECT
         (SELECT COUNT(*) FROM listing_views WHERE listing_id = $1) AS views,
         (SELECT COUNT(*) FROM favorites WHERE listing_id = $1) AS favorites,
         (SELECT COUNT(*) FROM contact_reveals WHERE listing_id = $1) AS contact_reveals,
         (SELECT COUNT(*) FROM enquiries WHERE listing_id = $1) AS enquiries`,
      [listingId],
    ),
    // A Listing appears in at most one row: its category maps to exactly one
    // section (issue #19's LISTING_FEATURED_SECTIONS), so no section filter is needed.
    db.query<{ is_displayed: boolean; is_sponsored: boolean }>(
      `SELECT is_displayed, is_sponsored FROM featured_rankings WHERE entity_id = $1 LIMIT 1`,
      [listingId],
    ),
  ]);
  const counts = countRows[0];
  const ranking = rankingRows[0];
  const sponsored = ranking?.is_sponsored === true;
  return {
    views: Number(counts.views),
    favorites: Number(counts.favorites),
    contactReveals: Number(counts.contact_reveals),
    enquiries: Number(counts.enquiries),
    sponsored,
    featured: ranking?.is_displayed === true && !sponsored,
  };
}
