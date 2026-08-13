import type pg from "pg";

export interface AuditEntry {
  actorId: string | null;
  /** Free-form "<table>.<verb>" convention (e.g. "businesses.approve") — the column has no enum constraint. */
  action: string;
  tableName: string;
  recordId: string;
  oldData?: unknown;
  newData?: unknown;
}

/**
 * FR162's privileged-action trail. Callers decide what counts as
 * "privileged" (see Phase 6 spec's audit-retrofit scope) — this just
 * writes the row. `actorId` is always resolved at the route-handler level,
 * never inside a service function, keeping services free of request context.
 */
export async function logAudit(db: pg.Pool, entry: AuditEntry): Promise<void> {
  await db.query(
    `INSERT INTO audit_logs (actor_id, action, table_name, record_id, old_data, new_data)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      entry.actorId,
      entry.action,
      entry.tableName,
      entry.recordId,
      entry.oldData !== undefined ? JSON.stringify(entry.oldData) : null,
      entry.newData !== undefined ? JSON.stringify(entry.newData) : null,
    ],
  );
}
