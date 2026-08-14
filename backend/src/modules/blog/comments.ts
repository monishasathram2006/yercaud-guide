import type pg from "pg";
import { ConflictError, NotFoundError } from "../../errors.js";
import { requireRow } from "../../db-errors.js";

export type BlogCommentStatus = "pending" | "approved" | "rejected";

export interface BlogComment {
  id: string;
  postId: string;
  userId: string;
  body: string;
  likeCount: number;
  status: BlogCommentStatus;
  createdAt: string;
}

interface BlogCommentRow {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  like_count: number;
  status: BlogCommentStatus;
  created_at: string;
}

const COLUMNS = "id, post_id, user_id, body, like_count, status, created_at";

function toBlogComment(row: BlogCommentRow): BlogComment {
  return {
    id: row.id,
    postId: row.post_id,
    userId: row.user_id,
    body: row.body,
    // Read-only: nothing in the contract or build plan likes a comment, so
    // this stays at its 0 default (see Phase 8 spec's Out of Scope).
    likeCount: row.like_count,
    status: row.status,
    createdAt: row.created_at,
  };
}

/** Starts `pending` per the column default — ADR 0006's reasoning, applied to comments. */
export async function submitComment(db: pg.Pool, postId: string, userId: string, body: string): Promise<BlogComment> {
  const { rows } = await db.query<BlogCommentRow>(
    `INSERT INTO blog_comments (post_id, user_id, body) VALUES ($1, $2, $3) RETURNING ${COLUMNS}`,
    [postId, userId, body],
  );
  return toBlogComment(rows[0]);
}

export async function listApprovedComments(db: pg.Pool, postId: string): Promise<BlogComment[]> {
  const { rows } = await db.query<BlogCommentRow>(
    `SELECT ${COLUMNS} FROM blog_comments WHERE post_id = $1 AND status = 'approved' ORDER BY created_at DESC`,
    [postId],
  );
  return rows.map(toBlogComment);
}

/** Cross-post moderation queue, mirroring GET /reviews. */
export async function listComments(db: pg.Pool, status?: string): Promise<BlogComment[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await db.query<BlogCommentRow>(
    `SELECT ${COLUMNS} FROM blog_comments ${where} ORDER BY created_at DESC`,
    params,
  );
  return rows.map(toBlogComment);
}

export async function getComment(db: pg.Pool, id: string): Promise<BlogComment> {
  const { rows } = await db.query<BlogCommentRow>(`SELECT ${COLUMNS} FROM blog_comments WHERE id = $1`, [id]);
  return toBlogComment(requireRow(rows, "Comment not found"));
}

async function transitionStatus(
  db: pg.Pool,
  id: string,
  allowedFrom: BlogCommentStatus[],
  to: BlogCommentStatus,
): Promise<BlogComment> {
  const current = await db.query<{ status: BlogCommentStatus }>(`SELECT status FROM blog_comments WHERE id = $1`, [id]);
  const row = current.rows[0];
  if (!row) {
    throw new NotFoundError("Comment not found");
  }
  if (!allowedFrom.includes(row.status)) {
    throw new ConflictError(`Cannot move a "${row.status}" comment to "${to}"`);
  }
  const { rows } = await db.query<BlogCommentRow>(
    `UPDATE blog_comments SET status = $1 WHERE id = $2 RETURNING ${COLUMNS}`,
    [to, id],
  );
  return toBlogComment(rows[0]);
}

// A moderator can reverse their own earlier call (approved -> rejected, or
// rejected -> approved) — the admin UI offers both actions regardless of the
// comment's current status, so the backend needs to actually honor a reversal
// rather than 409 on the exact case the UI invites. Re-applying the same
// status is still blocked (a true no-op, not a reversal).
export async function approveComment(db: pg.Pool, id: string): Promise<BlogComment> {
  return transitionStatus(db, id, ["pending", "rejected"], "approved");
}

export async function rejectComment(db: pg.Pool, id: string): Promise<BlogComment> {
  return transitionStatus(db, id, ["pending", "approved"], "rejected");
}
