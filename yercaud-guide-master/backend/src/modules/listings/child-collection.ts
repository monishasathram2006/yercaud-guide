import type pg from "pg";
import { mapForeignKeyViolation, requireDeleted, requireRow } from "../../db-errors.js";

export interface ChildFieldConfig {
  /** camelCase key in the API request/response shape. */
  api: string;
  /** snake_case column name in the DB. */
  db: string;
}

// `table`/field db-column names are always fixed literals supplied by the
// calling module's own code (never derived from request input), so
// string-interpolating them is safe — same reasoning as named-lookup.ts.
export interface ChildCollectionConfig {
  table: string;
  /** Excludes `id` and `listing_id`, which every child table has by convention. */
  fields: ChildFieldConfig[];
  orderBy: string;
  /** Shown when an INSERT fails its FK to the parent *_details row (owner hasn't created it yet). */
  parentMissingMessage: string;
}

type Row = Record<string, unknown> & { id: string };
type ApiShape = Record<string, unknown> & { id: string };

function toApi(row: Row, fields: ChildFieldConfig[]): ApiShape {
  const out: ApiShape = { id: row.id };
  for (const f of fields) out[f.api] = row[f.db];
  return out;
}

/**
 * Generic list/create/update/remove for the small, near-identical child
 * tables under each rich-category detail module (rooms, menu items,
 * itinerary steps, inclusions, attractions, availability blocks) — same
 * shape, different columns, so parameterized rather than duplicated 8 times.
 */
export function createChildCollectionService(config: ChildCollectionConfig) {
  const dbCols = config.fields.map((f) => f.db);
  const selectCols = ["id", ...dbCols].join(", ");

  async function list(db: pg.Pool, listingId: string): Promise<ApiShape[]> {
    const { rows } = await db.query<Row>(
      `SELECT ${selectCols} FROM ${config.table} WHERE listing_id = $1 ORDER BY ${config.orderBy}`,
      [listingId],
    );
    return rows.map((r) => toApi(r, config.fields));
  }

  async function create(db: pg.Pool, listingId: string, input: Record<string, unknown>): Promise<ApiShape> {
    return mapForeignKeyViolation(async () => {
      // Only provided fields go in the INSERT column list — an omitted field
      // (e.g. quantityAvailable) should fall through to the column's own DB
      // default (0), not get overwritten with an explicit NULL.
      const provided = config.fields.filter((f) => Object.prototype.hasOwnProperty.call(input, f.api));
      const cols = ["listing_id", ...provided.map((f) => f.db)];
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
      const values = [listingId, ...provided.map((f) => input[f.api])];
      const { rows } = await db.query<Row>(
        `INSERT INTO ${config.table} (${cols.join(", ")}) VALUES (${placeholders}) RETURNING ${selectCols}`,
        values,
      );
      return toApi(rows[0], config.fields);
    }, config.parentMissingMessage);
  }

  async function update(
    db: pg.Pool,
    listingId: string,
    id: string,
    input: Record<string, unknown>,
  ): Promise<ApiShape> {
    const provided = config.fields.filter((f) => Object.prototype.hasOwnProperty.call(input, f.api));
    if (provided.length === 0) {
      const { rows } = await db.query<Row>(
        `SELECT ${selectCols} FROM ${config.table} WHERE id = $1 AND listing_id = $2`,
        [id, listingId],
      );
      return toApi(requireRow(rows, "Not found"), config.fields);
    }

    const setClause = provided.map((f, i) => `${f.db} = $${i + 3}`).join(", ");
    const values = provided.map((f) => input[f.api]);
    const { rows } = await db.query<Row>(
      `UPDATE ${config.table} SET ${setClause} WHERE id = $1 AND listing_id = $2 RETURNING ${selectCols}`,
      [id, listingId, ...values],
    );
    return toApi(requireRow(rows, "Not found"), config.fields);
  }

  async function remove(db: pg.Pool, listingId: string, id: string): Promise<void> {
    const { rowCount } = await db.query(`DELETE FROM ${config.table} WHERE id = $1 AND listing_id = $2`, [
      id,
      listingId,
    ]);
    requireDeleted(rowCount, "Not found");
  }

  return { list, create, update, remove };
}
