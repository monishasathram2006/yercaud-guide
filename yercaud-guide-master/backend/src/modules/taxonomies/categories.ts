import type pg from "pg";
import { mapForeignKeyViolation, mapUniqueViolation, requireDeleted, requireRow } from "../../db-errors.js";

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  hasDetailTable: boolean;
  sortOrder: number;
}

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  has_detail_table: boolean;
  sort_order: number;
}

function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    icon: row.icon,
    color: row.color,
    hasDetailTable: row.has_detail_table,
    sortOrder: row.sort_order,
  };
}

const COLUMNS = "id, name, slug, icon, color, has_detail_table, sort_order";

export interface CategoryInput {
  name: string;
  slug: string;
  icon?: string;
  color?: string;
  sortOrder?: number;
}

function conflictMessage(input: CategoryInput): string {
  return `A category named "${input.name}" or slug "${input.slug}" already exists`;
}

export async function listCategories(db: pg.Pool): Promise<Category[]> {
  const { rows } = await db.query<CategoryRow>(`SELECT ${COLUMNS} FROM categories ORDER BY sort_order, name`);
  return rows.map(toCategory);
}

export async function createCategory(db: pg.Pool, input: CategoryInput): Promise<Category> {
  // has_detail_table is never accepted from the request — see ADR 0003. A
  // genuinely new rich category is a deliberate migration, not an API call.
  return mapUniqueViolation(async () => {
    const { rows } = await db.query<CategoryRow>(
      `INSERT INTO categories (name, slug, icon, color, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${COLUMNS}`,
      [input.name, input.slug, input.icon ?? null, input.color ?? null, input.sortOrder ?? 0],
    );
    return toCategory(rows[0]);
  }, conflictMessage(input));
}

export async function updateCategory(db: pg.Pool, id: string, input: CategoryInput): Promise<Category> {
  return mapUniqueViolation(async () => {
    const { rows } = await db.query<CategoryRow>(
      `UPDATE categories SET name = $1, slug = $2, icon = $3, color = $4, sort_order = $5
       WHERE id = $6
       RETURNING ${COLUMNS}`,
      [input.name, input.slug, input.icon ?? null, input.color ?? null, input.sortOrder ?? 0, id],
    );
    return toCategory(requireRow(rows, "Category not found"));
  }, conflictMessage(input));
}

export async function deleteCategory(db: pg.Pool, id: string): Promise<void> {
  return mapForeignKeyViolation(async () => {
    const { rowCount } = await db.query(`DELETE FROM categories WHERE id = $1`, [id]);
    requireDeleted(rowCount, "Category not found");
  }, "This category still has Listings — reassign them before deleting it");
}
