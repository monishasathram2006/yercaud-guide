import type pg from "pg";
import { isBusinessOwnerOrStaff } from "./contact-reveals.js";

/**
 * The write side of anonymous-friendly page View tracking on Listing detail
 * pages (issue #16, part of the Featured Sections epic — ADR-0013). Deduped
 * per (listing, visitor session, calendar day) via the table's unique
 * constraint — a reload or revisit the same day is not a new View, but a
 * genuine return visit the next day is.
 *
 * sessionId is the visitor_id cookie value (see lib/visitor-id.ts) — the same
 * dedup key whether or not the caller is signed in, since most directory
 * traffic is anonymous. Skips the Listing's own Business Owner/staff, exactly
 * like contact-reveals.ts's isBusinessOwnerOrStaff check: their own views of
 * their own Listing shouldn't inflate its interaction volume.
 *
 * Fire-and-forget by design (see the route) — never blocks or fails the page
 * that's actually being viewed.
 */
export async function recordListingView(
  db: pg.Pool,
  listingId: string,
  sessionId: string,
  currentUserId: string | null,
): Promise<void> {
  if (currentUserId !== null && (await isBusinessOwnerOrStaff(db, listingId, currentUserId))) {
    return;
  }
  await db.query(
    `INSERT INTO listing_views (listing_id, session_id) VALUES ($1, $2)
     ON CONFLICT (listing_id, session_id, viewed_on) DO NOTHING`,
    [listingId, sessionId],
  );
}
