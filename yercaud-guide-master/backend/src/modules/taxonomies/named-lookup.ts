import type pg from "pg";
import { mapUniqueViolation, requireDeleted, requireRow } from "../../db-errors.js";

export interface NamedLookup {
  id: string;
  name: string;
  icon?: string | null;
}

// `table` is always a fixed literal supplied by the calling module's own code
// (never derived from request input), so string-interpolating it is safe —
// this is a config value, not attacker-controlled data.
export interface NamedLookupTableConfig {
  table: "amenities" | "attribute_tags" | "property_types" | "languages";
  hasIcon: boolean;
}

export function createNamedLookupService(config: NamedLookupTableConfig) {
  const selectColumns = config.hasIcon ? "id, name, icon" : "id, name";
  const writableColumns = config.hasIcon ? "name, icon" : "name";

  // Single source of truth for how an input maps to query values — computed
  // once, not re-branched separately in both create() and update().
  function writableValues(input: { name: string; icon?: string }): unknown[] {
    return config.hasIcon ? [input.name, input.icon ?? null] : [input.name];
  }

  function conflictMessage(name: string): string {
    return `An entry named "${name}" already exists`;
  }

  async function list(db: pg.Pool): Promise<NamedLookup[]> {
    const { rows } = await db.query<NamedLookup>(`SELECT ${selectColumns} FROM ${config.table} ORDER BY name`);
    return rows;
  }

  async function create(db: pg.Pool, input: { name: string; icon?: string }): Promise<NamedLookup> {
    return mapUniqueViolation(async () => {
      const placeholders = config.hasIcon ? "$1, $2" : "$1";
      const { rows } = await db.query<NamedLookup>(
        `INSERT INTO ${config.table} (${writableColumns}) VALUES (${placeholders}) RETURNING ${selectColumns}`,
        writableValues(input),
      );
      return rows[0];
    }, conflictMessage(input.name));
  }

  async function update(db: pg.Pool, id: string, input: { name: string; icon?: string }): Promise<NamedLookup> {
    return mapUniqueViolation(async () => {
      const setClause = config.hasIcon ? "name = $1, icon = $2" : "name = $1";
      const idPlaceholder = config.hasIcon ? "$3" : "$2";
      const { rows } = await db.query<NamedLookup>(
        `UPDATE ${config.table} SET ${setClause} WHERE id = ${idPlaceholder} RETURNING ${selectColumns}`,
        [...writableValues(input), id],
      );
      return requireRow(rows, "Not found");
    }, conflictMessage(input.name));
  }

  async function remove(db: pg.Pool, id: string): Promise<void> {
    const { rowCount } = await db.query(`DELETE FROM ${config.table} WHERE id = $1`, [id]);
    requireDeleted(rowCount, "Not found");
  }

  return { list, create, update, remove };
}
