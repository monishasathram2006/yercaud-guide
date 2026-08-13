import type pg from "pg";

export type SubscriberStatus = "active" | "unsubscribed";

export interface NewsletterSubscriber {
  id: string;
  email: string;
  source: string | null;
  status: SubscriberStatus;
  subscribedAt: string;
}

interface SubscriberRow {
  id: string;
  email: string;
  source: string | null;
  status: SubscriberStatus;
  subscribed_at: string;
}

const COLUMNS = "id, email, source, status, subscribed_at";

function toSubscriber(row: SubscriberRow): NewsletterSubscriber {
  return {
    id: row.id,
    email: row.email,
    source: row.source,
    status: row.status,
    subscribedAt: row.subscribed_at,
  };
}

export interface SubscribeInput {
  email: string;
  source?: string;
}

/**
 * What a subscribe call tells an anonymous caller. Deliberately not the whole
 * row: `subscribedAt` is preserved across a re-subscribe, so echoing it back
 * would let anyone POST an address and read a months-old date to learn it was
 * already on the list — the same enumeration oracle unsubscribe's flat 204
 * exists to deny. Both fields here are already known to whoever sent the
 * request, so they reveal nothing: `status` is always 'active' after a
 * subscribe, and `email` is their own input echoed back.
 */
export interface SubscribeAck {
  email: string;
  status: SubscriberStatus;
}

/**
 * Idempotent by construction. Written as an upsert rather than check-then-insert
 * because two visitors submitting the footer form at the same moment would both
 * pass an existence check and one would then hit the unique constraint.
 *
 * `subscribed_at` is deliberately left untouched on conflict: the row is a
 * person's relationship with the newsletter, not a signup event, so resetting it
 * on every duplicate footer submission would destroy the only record of when
 * they actually joined. `source` is overwritten only when the caller supplies
 * one, so a re-subscribe from the blog widget reattributes a footer signup while
 * a sourceless re-subscribe doesn't blank out what was already known.
 *
 * Email is stored as submitted. The unique constraint is on the raw column, so
 * normalizing case in application code alone would imply a deduplication the
 * database doesn't actually enforce — see the spec's follow-up note.
 */
export async function subscribe(db: pg.Pool, input: SubscribeInput): Promise<SubscribeAck> {
  const { rows } = await db.query<SubscriberRow>(
    `INSERT INTO newsletter_subscribers (email, source)
     VALUES ($1, $2)
     ON CONFLICT (email)
     DO UPDATE SET status = 'active', source = COALESCE(EXCLUDED.source, newsletter_subscribers.source)
     RETURNING ${COLUMNS}`,
    [input.email, input.source ?? null],
  );
  const subscriber = toSubscriber(rows[0]!);
  return { email: subscriber.email, status: subscriber.status };
}

/**
 * Silent about whether the email was on the list. Reporting a miss would turn a
 * public endpoint into an oracle for testing whether any given address is
 * subscribed. Sets a status rather than deleting the row (ADR 0010), which also
 * means the next footer submission can't silently resurrect a departed subscriber
 * as a brand-new one.
 */
export async function unsubscribe(db: pg.Pool, email: string): Promise<void> {
  await db.query(`UPDATE newsletter_subscribers SET status = 'unsubscribed' WHERE email = $1`, [email]);
}

export interface SubscriberFilters {
  search?: string;
  status?: SubscriberStatus;
}

/**
 * Unpaginated: the point of this endpoint per FR188 is export, and a paginated
 * export is a worse export. Revisit if the list outgrows one response.
 */
export async function listSubscribers(db: pg.Pool, filters: SubscriberFilters): Promise<NewsletterSubscriber[]> {
  const { rows } = await db.query<SubscriberRow>(
    `SELECT ${COLUMNS} FROM newsletter_subscribers
     WHERE ($1::text IS NULL OR email ILIKE '%' || $1 || '%')
       AND ($2::text IS NULL OR status = $2)
     ORDER BY subscribed_at DESC`,
    [filters.search ?? null, filters.status ?? null],
  );
  return rows.map(toSubscriber);
}
