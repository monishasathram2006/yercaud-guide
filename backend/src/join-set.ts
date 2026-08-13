import type pg from "pg";

// `table`/`ownerColumn`/`otherColumn` are always fixed literals supplied by
// the calling module's own code (never derived from request input), so
// string-interpolating them is safe — same reasoning as the taxonomies
// module's named-lookup `table` config.
/**
 * Atomically replaces every row for `ownerId` in a two-column join table
 * with `otherIds`. Lived in `modules/listings/` until Phase 8's blog module
 * became a third consumer outside it — it was only ever there because that's
 * where it was first needed, not because it's about Listings.
 */
export async function replaceJoinSet(
  pool: pg.Pool,
  table: string,
  ownerColumn: string,
  ownerId: string,
  otherColumn: string,
  otherIds: string[],
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM ${table} WHERE ${ownerColumn} = $1`, [ownerId]);
    if (otherIds.length > 0) {
      await client.query(
        `INSERT INTO ${table} (${ownerColumn}, ${otherColumn}) SELECT $1, unnest($2::uuid[])`,
        [ownerId, otherIds],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
