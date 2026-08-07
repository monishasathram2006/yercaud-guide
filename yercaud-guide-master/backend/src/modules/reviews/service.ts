import type pg from "pg";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors.js";
import { mapUniqueViolation, requireRow } from "../../db-errors.js";
import { attachListingSummaries, type ListingSummary } from "../listings/service.js";

export type ReviewStatus = "pending" | "approved" | "rejected";

export interface Review {
  id: string;
  listingId: string;
  userId: string;
  rating: number;
  text: string;
  status: ReviewStatus;
  ownerReply: string | null;
  repliedAt: string | null;
  createdAt: string;
  /** Only populated on GET /me/reviews (issue #13) — every other Review-returning endpoint is already scoped to one known Listing. */
  listing?: ListingSummary;
  /**
   * Only populated on the public "reviews for this Listing" endpoint (issue
   * #14) — the surface where a Review is shown to someone other than its
   * author, rendered as "Name · @username". GET /me/reviews doesn't need
   * this: the viewer already knows who they are.
   */
  authorName?: string;
  authorUsername?: string;
}

interface ReviewRow {
  id: string;
  listing_id: string;
  user_id: string;
  rating: number;
  text: string;
  status: ReviewStatus;
  owner_reply: string | null;
  replied_at: string | null;
  created_at: string;
  author_name?: string;
  author_username?: string;
}

const COLUMNS = "id, listing_id, user_id, rating, text, status, owner_reply, replied_at, created_at";

function toReview(row: ReviewRow): Review {
  return {
    id: row.id,
    listingId: row.listing_id,
    userId: row.user_id,
    rating: row.rating,
    text: row.text,
    status: row.status,
    ownerReply: row.owner_reply,
    repliedAt: row.replied_at,
    createdAt: row.created_at,
    ...(row.author_name !== undefined ? { authorName: row.author_name, authorUsername: row.author_username } : {}),
  };
}

export interface ReviewInput {
  rating: number;
  text: string;
}

/** One review per (listing, user) — the DB UNIQUE constraint maps to a 409 pointing at editing the existing review. */
export async function submitReview(
  db: pg.Pool,
  listingId: string,
  userId: string,
  input: ReviewInput,
): Promise<Review> {
  return mapUniqueViolation(async () => {
    const { rows } = await db.query<ReviewRow>(
      `INSERT INTO reviews (listing_id, user_id, rating, text) VALUES ($1, $2, $3, $4) RETURNING ${COLUMNS}`,
      [listingId, userId, input.rating, input.text],
    );
    return toReview(rows[0]);
  }, "You've already reviewed this Listing — edit your existing review instead");
}

/** Exported for Phase 6's audit-log retrofit (route handlers fetch prior status before approve/reject). */
export async function getReview(db: pg.Pool, id: string): Promise<Review> {
  const { rows } = await db.query<ReviewRow>(`SELECT ${COLUMNS} FROM reviews WHERE id = $1`, [id]);
  return toReview(requireRow(rows, "Review not found"));
}

/** Self-only — a Review's "owner" is its author, not a Business owner, so requireOwnerOrPermission doesn't apply. Resets status to pending: an edited review is unmoderated content again (ADR 0006). */
export async function editOwnReview(
  db: pg.Pool,
  reviewId: string,
  callerId: string,
  input: ReviewInput,
): Promise<Review> {
  const current = await getReview(db, reviewId);
  if (current.userId !== callerId) {
    throw new ForbiddenError();
  }
  const { rows } = await db.query<ReviewRow>(
    `UPDATE reviews SET rating = $1, text = $2, status = 'pending' WHERE id = $3 RETURNING ${COLUMNS}`,
    [input.rating, input.text, reviewId],
  );
  return toReview(rows[0]);
}

/** Shown to visitors, not just the author — joins name/username so a review isn't anonymous ("Name · @username"). */
export async function listApprovedReviews(db: pg.Pool, listingId: string): Promise<Review[]> {
  const { rows } = await db.query<ReviewRow>(
    `SELECT rv.id, rv.listing_id, rv.user_id, rv.rating, rv.text, rv.status, rv.owner_reply, rv.replied_at, rv.created_at,
            u.name AS author_name, u.username AS author_username
     FROM reviews rv
     JOIN users u ON u.id = rv.user_id
     WHERE rv.listing_id = $1 AND rv.status = 'approved'
     ORDER BY rv.created_at DESC`,
    [listingId],
  );
  return rows.map(toReview);
}

export async function listReviews(db: pg.Pool, status?: string): Promise<Review[]> {
  if (status) {
    const { rows } = await db.query<ReviewRow>(
      `SELECT ${COLUMNS} FROM reviews WHERE status = $1 ORDER BY created_at DESC`,
      [status],
    );
    return rows.map(toReview);
  }
  const { rows } = await db.query<ReviewRow>(`SELECT ${COLUMNS} FROM reviews ORDER BY created_at DESC`);
  return rows.map(toReview);
}

/** The author's own view of what they wrote (issue #13) — every status, not just approved, since it's their own content. */
export async function listMyReviews(db: pg.Pool, userId: string): Promise<Review[]> {
  const { rows } = await db.query<ReviewRow>(
    `SELECT ${COLUMNS} FROM reviews WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return attachListingSummaries(db, rows.map(toReview));
}

/** For My Statistics (issue #13) — every status counts, same scope as listMyReviews. */
export async function countMyReviews(db: pg.Pool, userId: string): Promise<number> {
  const { rows } = await db.query<{ count: string }>(`SELECT COUNT(*) FROM reviews WHERE user_id = $1`, [userId]);
  return Number(rows[0].count);
}

/** Used by requireOwnerOrPermission — returns null (never throws) when the Review doesn't exist. */
export async function loadReviewOwnerId(db: pg.Pool, id: string): Promise<string | null> {
  const { rows } = await db.query<{ owner_id: string }>(
    `SELECT b.owner_id FROM reviews rv
     JOIN listings l ON l.id = rv.listing_id
     JOIN businesses b ON b.id = l.business_id
     WHERE rv.id = $1`,
    [id],
  );
  return rows[0]?.owner_id ?? null;
}

async function transitionStatus(
  db: pg.Pool,
  id: string,
  allowedFrom: ReviewStatus[],
  to: ReviewStatus,
): Promise<Review> {
  const current = await db.query<{ status: ReviewStatus }>(`SELECT status FROM reviews WHERE id = $1`, [id]);
  const row = current.rows[0];
  if (!row) {
    throw new NotFoundError("Review not found");
  }
  if (!allowedFrom.includes(row.status)) {
    throw new ConflictError(`Cannot move a "${row.status}" review to "${to}"`);
  }
  const { rows } = await db.query<ReviewRow>(`UPDATE reviews SET status = $1 WHERE id = $2 RETURNING ${COLUMNS}`, [
    to,
    id,
  ]);
  return toReview(rows[0]);
}

export async function approveReview(db: pg.Pool, id: string): Promise<Review> {
  return transitionStatus(db, id, ["pending"], "approved");
}

export async function rejectReview(db: pg.Pool, id: string): Promise<Review> {
  return transitionStatus(db, id, ["pending"], "rejected");
}

export async function replyToReview(db: pg.Pool, id: string, text: string): Promise<Review> {
  const current = await getReview(db, id);
  if (current.status !== "approved") {
    throw new ConflictError("Can only reply to an approved Review");
  }
  const { rows } = await db.query<ReviewRow>(
    `UPDATE reviews SET owner_reply = $1, replied_at = NOW() WHERE id = $2 RETURNING ${COLUMNS}`,
    [text, id],
  );
  return toReview(rows[0]);
}

export async function reportReview(db: pg.Pool, reviewId: string, reporterId: string, reason: string): Promise<void> {
  await getReview(db, reviewId); // 404 if the Review doesn't exist
  await db.query(`INSERT INTO reports (reporter_id, target_type, target_id, reason) VALUES ($1, 'review', $2, $3)`, [
    reporterId,
    reviewId,
    reason,
  ]);
}
