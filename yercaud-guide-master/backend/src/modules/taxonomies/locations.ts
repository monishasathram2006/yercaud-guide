import type pg from "pg";
import { mapUniqueViolation, requireDeleted, requireRow } from "../../db-errors.js";
import { createSlugger } from "../../slug.js";

export interface Location {
  id: string;
  name: string;
  slug: string;
}

const uniqueSlug = createSlugger({ table: "locations", fallback: "location" });

export async function listLocations(db: pg.Pool): Promise<Location[]> {
  const { rows } = await db.query<Location>(`SELECT id, name, slug FROM locations ORDER BY name`);
  return rows;
}

export async function createLocation(db: pg.Pool, name: string): Promise<Location> {
  const slug = await uniqueSlug(db, name);
  return mapUniqueViolation(async () => {
    const { rows } = await db.query<Location>(
      `INSERT INTO locations (name, slug) VALUES ($1, $2) RETURNING id, name, slug`,
      [name, slug],
    );
    return rows[0];
  }, `A location named "${name}" already exists`);
}

export async function updateLocation(db: pg.Pool, id: string, name: string): Promise<Location> {
  const slug = await uniqueSlug(db, name, id);
  return mapUniqueViolation(async () => {
    const { rows } = await db.query<Location>(
      `UPDATE locations SET name = $1, slug = $2 WHERE id = $3 RETURNING id, name, slug`,
      [name, slug, id],
    );
    return requireRow(rows, "Location not found");
  }, `A location named "${name}" already exists`);
}

export async function deleteLocation(db: pg.Pool, id: string): Promise<void> {
  const { rowCount } = await db.query(`DELETE FROM locations WHERE id = $1`, [id]);
  requireDeleted(rowCount, "Location not found");
}
