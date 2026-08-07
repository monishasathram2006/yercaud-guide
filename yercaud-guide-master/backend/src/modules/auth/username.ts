import type pg from "pg";

// Lowercase letters, digits, underscores, 3-20 chars, starting with a letter.
// The single source of truth for the format — the username column has no DB
// CHECK, on purpose, so this regex doesn't end up duplicated in SQL too.
export const USERNAME_FORMAT = /^[a-z][a-z0-9_]{2,19}$/;

export function isValidUsernameFormat(username: string): boolean {
  return USERNAME_FORMAT.test(username);
}

/** Slugifies a name into a syntactically valid (but not yet unique) username base. */
export function slugifyForUsername(name: string): string {
  let slug = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (slug.length < 3 || !/^[a-z]/.test(slug)) {
    slug = `user${slug}`;
  }
  return slug.slice(0, 20);
}

/**
 * Slugifies name and resolves collisions with a random numeric suffix (not a
 * sequential counter, so a username never leaks signup order). Used both by
 * registration and the Google sign-in upsert, so every account always has one.
 */
export async function generateUniqueUsername(db: pg.Pool, name: string): Promise<string> {
  const base = slugifyForUsername(name);
  let candidate = base;
  while (true) {
    const { rows } = await db.query(`SELECT 1 FROM users WHERE username = $1`, [candidate]);
    if (rows.length === 0) return candidate;
    const suffix = String(Math.floor(Math.random() * 100000)).padStart(5, "0");
    candidate = `${base.slice(0, 20 - suffix.length)}${suffix}`;
  }
}
