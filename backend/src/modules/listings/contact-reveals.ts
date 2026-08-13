import type pg from "pg";

/**
 * True when userId owns, or is accepted staff on, the Business behind this
 * Listing. Exported for reuse by listing-views.ts (issue #16), which needs
 * the identical owner-skip check.
 */
export async function isBusinessOwnerOrStaff(db: pg.Pool, listingId: string, userId: string): Promise<boolean> {
  const { rows } = await db.query<{ match: boolean }>(
    `SELECT (
       b.owner_id = $2
       OR EXISTS (
         SELECT 1 FROM business_staff bs
         WHERE bs.business_id = b.id AND bs.user_id = $2 AND bs.status = 'accepted'
       )
     ) AS match
     FROM listings l JOIN businesses b ON b.id = l.business_id
     WHERE l.id = $1`,
    [listingId, userId],
  );
  return rows[0]?.match ?? false;
}

/**
 * The lead signal behind the contact-info gate (issue #15): a signed-in
 * visitor actually seeing a Listing's real (unblurred) contact info on its
 * detail page. Deduped per (listing, user) per calendar day via the table's
 * unique constraint — a reload or revisit the same day is not a new lead.
 *
 * Skips the Listing's own Business Owner/staff: them viewing their own
 * listing isn't interest from a prospective customer, and counting it would
 * inflate their own future "N people viewed your contact info" metric.
 *
 * Fire-and-forget by design (see the route) — never blocks or fails the page
 * that's actually showing the contact info.
 */
export async function logContactReveal(db: pg.Pool, listingId: string, userId: string): Promise<void> {
  if (await isBusinessOwnerOrStaff(db, listingId, userId)) {
    return;
  }
  await db.query(
    `INSERT INTO contact_reveals (listing_id, user_id) VALUES ($1, $2)
     ON CONFLICT (listing_id, user_id, revealed_on) DO NOTHING`,
    [listingId, userId],
  );
}
