import type pg from "pg";
import { createSlugger } from "../../slug.js";

const uniqueSlug = createSlugger({ table: "blog_tags", fallback: "tag" });

/**
 * Get-or-create by name — the post form's tag input is freeform (type a
 * word, press Enter), so a name that doesn't exist yet just becomes a new
 * row. `ON CONFLICT` makes this safe under concurrent posts introducing the
 * same tag name at once.
 */
export async function resolveTagIds(db: pg.Pool, names: string[]): Promise<string[]> {
  const uniqueNames = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const ids: string[] = [];
  for (const name of uniqueNames) {
    const slug = await uniqueSlug(db, name);
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO blog_tags (name, slug) VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [name, slug],
    );
    ids.push(rows[0].id);
  }
  return ids;
}
