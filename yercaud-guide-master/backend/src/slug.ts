import type pg from "pg";

/** URL-safe slug from a display name. Byte-identical across every consumer, so it lives here. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface SluggerConfig {
  /** Always a fixed literal from the calling module's own code, never request input — safe to interpolate. */
  table: string;
  /** Used when the name slugifies to nothing (e.g. a title of only punctuation). */
  fallback: string;
}

/**
 * Slug generation for a table with a UNIQUE slug column: derive from the name,
 * then suffix `-2`, `-3`… until it's free. Pass `excludeId` when renaming an
 * existing row so it doesn't collide with itself.
 *
 * Factored out at the fourth consumer (blog categories and posts joined
 * locations and listings), matching the threshold that justified
 * taxonomies/named-lookup.ts.
 */
export function createSlugger(config: SluggerConfig) {
  return async function uniqueSlug(db: pg.Pool, name: string, excludeId?: string): Promise<string> {
    const base = slugify(name) || config.fallback;
    let candidate = base;
    let suffix = 1;
    // Bounded in practice — a handful of collisions at most, not worth a
    // fancier approach on tables this size.
    while (true) {
      const { rows } = await db.query(`SELECT 1 FROM ${config.table} WHERE slug = $1 AND id IS DISTINCT FROM $2`, [
        candidate,
        excludeId ?? null,
      ]);
      if (rows.length === 0) return candidate;
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
  };
}
