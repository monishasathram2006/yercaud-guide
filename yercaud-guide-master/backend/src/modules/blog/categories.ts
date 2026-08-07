import type pg from "pg";
import { mapForeignKeyViolation, mapUniqueViolation, requireDeleted, requireRow } from "../../db-errors.js";
import { createSlugger } from "../../slug.js";

export interface BlogCategory {
  id: string;
  name: string;
  slug: string;
}

const uniqueSlug = createSlugger({ table: "blog_categories", fallback: "category" });

export async function listBlogCategories(db: pg.Pool): Promise<BlogCategory[]> {
  const { rows } = await db.query<BlogCategory>(`SELECT id, name, slug FROM blog_categories ORDER BY name`);
  return rows;
}

export async function getBlogCategory(db: pg.Pool, id: string): Promise<BlogCategory> {
  const { rows } = await db.query<BlogCategory>(`SELECT id, name, slug FROM blog_categories WHERE id = $1`, [id]);
  return requireRow(rows, "Blog category not found");
}

export async function createBlogCategory(db: pg.Pool, name: string): Promise<BlogCategory> {
  const slug = await uniqueSlug(db, name);
  return mapUniqueViolation(async () => {
    const { rows } = await db.query<BlogCategory>(
      `INSERT INTO blog_categories (name, slug) VALUES ($1, $2) RETURNING id, name, slug`,
      [name, slug],
    );
    return rows[0];
  }, `A blog category named "${name}" already exists`);
}

export async function updateBlogCategory(db: pg.Pool, id: string, name: string): Promise<BlogCategory> {
  const slug = await uniqueSlug(db, name, id);
  return mapUniqueViolation(async () => {
    const { rows } = await db.query<BlogCategory>(
      `UPDATE blog_categories SET name = $1, slug = $2 WHERE id = $3 RETURNING id, name, slug`,
      [name, slug, id],
    );
    return requireRow(rows, "Blog category not found");
  }, `A blog category named "${name}" already exists`);
}

/** blog_posts.category_id is ON DELETE RESTRICT (ADR 0009) — never silently orphan published content. */
export async function deleteBlogCategory(db: pg.Pool, id: string): Promise<void> {
  return mapForeignKeyViolation(async () => {
    const { rowCount } = await db.query(`DELETE FROM blog_categories WHERE id = $1`, [id]);
    requireDeleted(rowCount, "Blog category not found");
  }, "This category still has blog posts — reassign them before deleting it");
}
