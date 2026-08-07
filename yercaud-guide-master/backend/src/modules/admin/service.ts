import type pg from "pg";

export interface ApprovalQueueItem {
  kind: "business" | "listing" | "review" | "blog_comment";
  id: string;
  subject: string;
  submittedAt: string;
}

/**
 * Union of every pending moderated entity, oldest first. `blog_comments`
 * already exists in the schema even though Phase 8 hasn't built its module
 * yet — this just returns zero rows for that kind until then, same pattern
 * as Phase 4 reading the not-yet-populated `reviews` table.
 */
export async function getApprovalQueue(db: pg.Pool): Promise<ApprovalQueueItem[]> {
  const { rows } = await db.query<{ kind: ApprovalQueueItem["kind"]; id: string; subject: string; submitted_at: string }>(
    `SELECT 'business' AS kind, id, name AS subject, created_at AS submitted_at
       FROM businesses WHERE status = 'pending'
     UNION ALL
     SELECT 'listing' AS kind, id, name AS subject, created_at AS submitted_at
       FROM listings WHERE status = 'pending'
     UNION ALL
     SELECT 'review' AS kind, r.id, (r.rating || '★ review on ' || l.name) AS subject, r.created_at AS submitted_at
       FROM reviews r JOIN listings l ON l.id = r.listing_id WHERE r.status = 'pending'
     UNION ALL
     SELECT 'blog_comment' AS kind, bc.id, bp.title AS subject, bc.created_at AS submitted_at
       FROM blog_comments bc JOIN blog_posts bp ON bp.id = bc.post_id WHERE bc.status = 'pending'
     ORDER BY submitted_at ASC`,
  );
  return rows.map((r) => ({ kind: r.kind, id: r.id, subject: r.subject, submittedAt: r.submitted_at }));
}

export interface DashboardScope {
  callerId: string;
  /** Holds Admins:view (Super Admin) — platform-wide, not just the caller's own Businesses. */
  includeAll: boolean;
}

export interface DashboardKpis {
  totalBusinesses: number;
  totalUsers: number;
  totalListings: number;
  totalEnquiries: number;
  totalViews: number;
  averageRating: number;
}

/**
 * Every caller here builds its own `params` array starting with `[from, to]`
 * before pushing anything else, so `$1`/`$2` are always the range bounds —
 * `alias` is an optional "table." prefix (e.g. "l.") for queries that join.
 */
function rangeClause(alias = ""): string {
  return `${alias}created_at BETWEEN COALESCE($1::timestamptz, '-infinity') AND COALESCE($2::timestamptz, 'infinity')`;
}

async function countBusinesses(db: pg.Pool, scope: DashboardScope, from?: string, to?: string): Promise<number> {
  const conditions = [rangeClause()];
  const params: unknown[] = [from ?? null, to ?? null];
  if (!scope.includeAll) {
    params.push(scope.callerId);
    conditions.push(`owner_id = $${params.length}`);
  }
  const { rows } = await db.query<{ count: string }>(
    `SELECT COUNT(*) FROM businesses WHERE ${conditions.join(" AND ")}`,
    params,
  );
  return Number(rows[0].count);
}

async function countListings(db: pg.Pool, scope: DashboardScope, from?: string, to?: string): Promise<number> {
  const conditions = [rangeClause("l.")];
  const params: unknown[] = [from ?? null, to ?? null];
  if (!scope.includeAll) {
    params.push(scope.callerId);
    conditions.push(`b.owner_id = $${params.length}`);
  }
  const { rows } = await db.query<{ count: string }>(
    `SELECT COUNT(*) FROM listings l JOIN businesses b ON b.id = l.business_id WHERE ${conditions.join(" AND ")}`,
    params,
  );
  return Number(rows[0].count);
}

async function countEnquiries(db: pg.Pool, scope: DashboardScope, from?: string, to?: string): Promise<number> {
  const conditions = [rangeClause("e.")];
  const params: unknown[] = [from ?? null, to ?? null];
  if (!scope.includeAll) {
    params.push(scope.callerId);
    conditions.push(`b.owner_id = $${params.length}`);
  }
  const { rows } = await db.query<{ count: string }>(
    `SELECT COUNT(*) FROM enquiries e
     JOIN listings l ON l.id = e.listing_id
     JOIN businesses b ON b.id = l.business_id
     WHERE ${conditions.join(" AND ")}`,
    params,
  );
  return Number(rows[0].count);
}

async function computeAverageRating(db: pg.Pool, scope: DashboardScope, from?: string, to?: string): Promise<number> {
  const conditions = [`r.status = 'approved'`, rangeClause("r.")];
  const params: unknown[] = [from ?? null, to ?? null];
  if (!scope.includeAll) {
    params.push(scope.callerId);
    conditions.push(`b.owner_id = $${params.length}`);
  }
  const { rows } = await db.query<{ avg: string | null }>(
    `SELECT AVG(r.rating) AS avg FROM reviews r
     JOIN listings l ON l.id = r.listing_id
     JOIN businesses b ON b.id = l.business_id
     WHERE ${conditions.join(" AND ")}`,
    params,
  );
  return rows[0].avg === null ? 0 : Number(rows[0].avg);
}

async function countUsers(db: pg.Pool, from?: string, to?: string): Promise<number> {
  const { rows } = await db.query<{ count: string }>(`SELECT COUNT(*) FROM users WHERE ${rangeClause()}`, [
    from ?? null,
    to ?? null,
  ]);
  return Number(rows[0].count);
}

export async function getDashboardKpis(
  db: pg.Pool,
  scope: DashboardScope,
  from?: string,
  to?: string,
): Promise<DashboardKpis> {
  const [totalBusinesses, totalListings, totalEnquiries, averageRating, totalUsers] = await Promise.all([
    countBusinesses(db, scope, from, to),
    countListings(db, scope, from, to),
    countEnquiries(db, scope, from, to),
    computeAverageRating(db, scope, from, to),
    // A Business Owner doesn't "have" Users — no meaningful per-owner analog,
    // and skips a query entirely rather than computing a number that's
    // always discarded.
    scope.includeAll ? countUsers(db, from, to) : Promise.resolve(0),
  ]);
  // No page-view tracking anywhere in the schema (no listing_views table, no
  // counter column) — documented no-op, not a query, same category as the
  // priceBand gap from Phase 4. See Phase 6 spec's Further Notes.
  return { totalBusinesses, totalListings, totalEnquiries, averageRating, totalUsers, totalViews: 0 };
}

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  action: string;
  tableName: string;
  recordId: string;
  oldData: unknown;
  newData: unknown;
  createdAt: string;
}

export interface ListAuditLogsOptions {
  tableName?: string;
  recordId?: string;
  page: number;
  pageSize: number;
}

export async function listAuditLogs(db: pg.Pool, options: ListAuditLogsOptions): Promise<AuditLogEntry[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.tableName) {
    params.push(options.tableName);
    conditions.push(`table_name = $${params.length}`);
  }
  if (options.recordId) {
    params.push(options.recordId);
    conditions.push(`record_id = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(options.pageSize, (options.page - 1) * options.pageSize);
  const { rows } = await db.query<{
    id: string;
    actor_id: string | null;
    action: string;
    table_name: string;
    record_id: string;
    old_data: unknown;
    new_data: unknown;
    created_at: string;
  }>(
    `SELECT id, actor_id, action, table_name, record_id, old_data, new_data, created_at
     FROM audit_logs ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows.map((r) => ({
    id: r.id,
    actorId: r.actor_id,
    action: r.action,
    tableName: r.table_name,
    recordId: r.record_id,
    oldData: r.old_data,
    newData: r.new_data,
    createdAt: r.created_at,
  }));
}
