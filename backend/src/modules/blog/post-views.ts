import type pg from "pg";

/**
 * The write side of anonymous-friendly page View tracking on Blog Post
 * detail pages (issue #18, part of the Featured Sections epic — ADR-0013).
 * Deduped per (post, visitor session, calendar day) via the table's unique
 * constraint, exactly like listing-views.ts. No owner-skip check here —
 * unlike a Listing, a Blog Post has no owning Business to exclude.
 *
 * sessionId is the visitor_id cookie value (see lib/visitor-id.ts), shared
 * with Listing View tracking so the same visitor dedupes consistently
 * whether they're on a Listing or a Blog Post page.
 */
export async function recordBlogPostView(db: pg.Pool, postId: string, sessionId: string): Promise<void> {
  await db.query(
    `INSERT INTO blog_post_views (post_id, session_id) VALUES ($1, $2)
     ON CONFLICT (post_id, session_id, viewed_on) DO NOTHING`,
    [postId, sessionId],
  );
}
