import type pg from "pg";

export interface ArticleRating {
  postId: string;
  userId: string;
  rating: number;
}

interface ArticleRatingRow {
  post_id: string;
  user_id: string;
  rating: number;
}

function toArticleRating(row: ArticleRatingRow): ArticleRating {
  return { postId: row.post_id, userId: row.user_id, rating: row.rating };
}

/**
 * Upserts on the existing UNIQUE (post_id, user_id) — re-rating replaces
 * rather than conflicting, which is why the contract specifies PUT.
 */
export async function rateArticle(db: pg.Pool, postId: string, userId: string, rating: number): Promise<ArticleRating> {
  const { rows } = await db.query<ArticleRatingRow>(
    `INSERT INTO article_ratings (post_id, user_id, rating)
     VALUES ($1, $2, $3)
     ON CONFLICT (post_id, user_id) DO UPDATE SET rating = EXCLUDED.rating
     RETURNING post_id, user_id, rating`,
    [postId, userId, rating],
  );
  return toArticleRating(rows[0]);
}
