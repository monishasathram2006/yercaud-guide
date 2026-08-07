import type pg from "pg";

export async function addFavorite(db: pg.Pool, userId: string, listingId: string): Promise<void> {
  await db.query(
    `INSERT INTO favorites (user_id, listing_id) VALUES ($1, $2) ON CONFLICT (user_id, listing_id) DO NOTHING`,
    [userId, listingId],
  );
}

export async function removeFavorite(db: pg.Pool, userId: string, listingId: string): Promise<void> {
  await db.query(`DELETE FROM favorites WHERE user_id = $1 AND listing_id = $2`, [userId, listingId]);
}

/** For My Statistics (issue #13). */
export async function countMyFavorites(db: pg.Pool, userId: string): Promise<number> {
  const { rows } = await db.query<{ count: string }>(`SELECT COUNT(*) FROM favorites WHERE user_id = $1`, [userId]);
  return Number(rows[0].count);
}
