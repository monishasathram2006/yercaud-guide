import type pg from "pg";
import { BadRequestError, NotFoundError } from "../../errors.js";
import { requireDeleted, requireRow } from "../../db-errors.js";
import { replaceJoinSet } from "../../join-set.js";
import { createSlugger } from "../../slug.js";
import { resolveTagIds } from "./tags.js";
// The four card types any platform actually honours — defined once, on the
// Listings service, and shared rather than re-declared here.
import type { TwitterCardType } from "../listings/service.js";

export type BlogPostStatus = "draft" | "pending" | "published";

export interface BlogPostSummary {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  coverImage: string | null;
  categoryId: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  authorBio: string | null;
  readingTimeMinutes: number | null;
  status: BlogPostStatus;
  publishedAt: string | null;
  createdAt: string;
  viewCount: number;
  tags: string[];
}

export interface BlogPost extends BlogPostSummary {
  body: string;
  seoTitle: string | null;
  seoDescription: string | null;
  /**
   * FR189, closed in Phase 10. Phase 9 exposed these on Listings — where the
   * columns already sat unused — and left Blog Posts out because they needed a
   * migration. A Blog Post is the thing most likely to be shared into WhatsApp,
   * so the asymmetry was backwards.
   */
  ogImage: string | null;
  twitterCard: TwitterCardType | null;
  relatedPostIds: string[];
  placeListingIds: string[];
}

interface BlogPostRow {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  cover_image: string | null;
  category_id: string;
  author_id: string;
  author_name: string;
  author_avatar_url: string | null;
  author_bio: string | null;
  reading_time_minutes: number | null;
  status: BlogPostStatus;
  published_at: string | null;
  created_at: string;
  view_count: string; // COUNT() comes back as string from pg — same as listings/service.ts's review_count
  tags: string[]; // ARRAY_AGG comes back as a native JS array already
  body: string;
  seo_title: string | null;
  seo_description: string | null;
  og_image: string | null;
  twitter_card: TwitterCardType | null;
}

// Aliased so joins/subqueries below can reference p.id without ambiguity —
// `users` has its own `status` column, so an unqualified `status` in
// listBlogPosts' filters would otherwise be ambiguous once `users` is joined.
const BASE_FROM = `blog_posts p LEFT JOIN users u ON u.id = p.author_id`;
const SUMMARY_COLUMNS = `p.id, p.title, p.slug, p.excerpt, p.cover_image, p.category_id, p.author_id,
  u.name AS author_name, u.avatar_url AS author_avatar_url, u.bio AS author_bio,
  p.reading_time_minutes, p.status, p.published_at, p.created_at,
  (SELECT COUNT(*) FROM blog_post_views v WHERE v.post_id = p.id) AS view_count,
  (SELECT COALESCE(ARRAY_AGG(t.name ORDER BY t.name), '{}')
     FROM blog_post_tags bpt JOIN blog_tags t ON t.id = bpt.tag_id
    WHERE bpt.post_id = p.id) AS tags`;
const FULL_COLUMNS = `${SUMMARY_COLUMNS}, p.body, p.seo_title, p.seo_description, p.og_image, p.twitter_card`;

function toSummary(row: BlogPostRow): BlogPostSummary {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    coverImage: row.cover_image,
    categoryId: row.category_id,
    authorId: row.author_id,
    authorName: row.author_name,
    authorAvatarUrl: row.author_avatar_url,
    authorBio: row.author_bio,
    readingTimeMinutes: row.reading_time_minutes,
    status: row.status,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    viewCount: Number(row.view_count),
    tags: row.tags,
  };
}

// `table`/`ownerColumn`/`column` are always fixed literals supplied by the
// calling code below (never derived from request input), so interpolating them
// is safe — same reasoning as join-set.ts and listings/service.ts's loadIds.
async function loadIds(db: pg.Pool, table: string, ownerColumn: string, column: string, postId: string): Promise<string[]> {
  const { rows } = await db.query<Record<string, string>>(
    `SELECT ${column} FROM ${table} WHERE ${ownerColumn} = $1`,
    [postId],
  );
  return rows.map((r) => r[column]);
}

async function toBlogPost(db: pg.Pool, row: BlogPostRow): Promise<BlogPost> {
  const [relatedPostIds, placeListingIds] = await Promise.all([
    loadIds(db, "blog_post_related", "from_post_id", "to_post_id", row.id),
    loadIds(db, "blog_post_places", "blog_post_id", "listing_id", row.id),
  ]);
  return {
    ...toSummary(row),
    body: row.body,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    ogImage: row.og_image,
    twitterCard: row.twitter_card,
    relatedPostIds,
    placeListingIds,
  };
}

const uniqueSlug = createSlugger({ table: "blog_posts", fallback: "post" });

const WORDS_PER_MINUTE = 200;

/** Computed server-side — reading_time_minutes isn't in the input contract, so this is the only way it's ever filled. */
function readingTimeMinutes(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

/** A post relating to itself is nonsense the schema's (from, to) PK happily allows. */
function assertNoSelfRelation(postId: string, relatedPostIds: string[]): void {
  if (relatedPostIds.includes(postId)) {
    throw new BadRequestError("A post cannot be related to itself");
  }
}

/**
 * A published article must not link somewhere readers can't go (FR114) —
 * same rule Phase 7 applied to marketing. Write-time only: a Listing
 * archived later isn't retroactively unlinked (same as Favorites).
 */
async function assertListingsApproved(db: pg.Pool, listingIds: string[]): Promise<void> {
  if (listingIds.length === 0) return;
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM listings WHERE id = ANY($1::uuid[]) AND status = 'approved'`,
    [listingIds],
  );
  const approved = new Set(rows.map((r) => r.id));
  const invalid = listingIds.filter((id) => !approved.has(id));
  if (invalid.length > 0) {
    throw new BadRequestError(`These Listings aren't approved, so they can't be mentioned: ${invalid.join(", ")}`);
  }
}

/**
 * Runs every check before any write happens. `replaceJoinSet` opens its own
 * transaction per call, so a mid-write throw can't be rolled back across the
 * post row and both join tables — validating up front is what keeps a
 * rejected request from leaving a partial edit behind.
 *
 * `postId` is optional because a brand-new post has no id to self-relate to
 * yet: the client can't name an id the server hasn't assigned.
 */
async function assertLinksValid(
  db: pg.Pool,
  postId: string | undefined,
  relatedPostIds?: string[],
  placeListingIds?: string[],
): Promise<void> {
  if (relatedPostIds !== undefined && postId !== undefined) {
    assertNoSelfRelation(postId, relatedPostIds);
  }
  if (placeListingIds !== undefined) {
    await assertListingsApproved(db, placeListingIds);
  }
}

/** Assumes assertLinksValid already passed. */
async function replaceLinks(db: pg.Pool, postId: string, relatedPostIds?: string[], placeListingIds?: string[]): Promise<void> {
  if (relatedPostIds !== undefined) {
    await replaceJoinSet(db, "blog_post_related", "from_post_id", postId, "to_post_id", relatedPostIds);
  }
  if (placeListingIds !== undefined) {
    await replaceJoinSet(db, "blog_post_places", "blog_post_id", postId, "listing_id", placeListingIds);
  }
}

export interface BlogPostInput {
  categoryId: string;
  title: string;
  excerpt?: string;
  body: string;
  coverImage?: string;
  seoTitle?: string;
  seoDescription?: string;
  /** A URL to an already-hosted image, not an upload — same as a Listing's. */
  ogImage?: string | null;
  twitterCard?: TwitterCardType | null;
  relatedPostIds?: string[];
  placeListingIds?: string[];
  /** Tag names (freeform) — resolved to ids via get-or-create, same shape as categoryId but many and unmoderated. */
  tags?: string[];
}

async function applyTags(db: pg.Pool, postId: string, tags: string[] | undefined): Promise<void> {
  if (tags === undefined) return;
  const tagIds = await resolveTagIds(db, tags);
  await replaceJoinSet(db, "blog_post_tags", "post_id", postId, "tag_id", tagIds);
}

/** Always starts at the column's `draft` default — status is never settable on create. */
export async function createBlogPost(db: pg.Pool, authorId: string, input: BlogPostInput): Promise<BlogPost> {
  await assertLinksValid(db, undefined, input.relatedPostIds, input.placeListingIds);
  const slug = await uniqueSlug(db, input.title);
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO blog_posts (author_id, category_id, title, slug, excerpt, body, cover_image,
       reading_time_minutes, seo_title, seo_description, og_image, twitter_card)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      authorId,
      input.categoryId,
      input.title,
      slug,
      input.excerpt ?? null,
      input.body,
      input.coverImage ?? null,
      readingTimeMinutes(input.body),
      input.seoTitle ?? null,
      input.seoDescription ?? null,
      input.ogImage ?? null,
      input.twitterCard ?? null,
    ],
  );
  const postId = rows[0].id;
  await replaceLinks(db, postId, input.relatedPostIds, input.placeListingIds);
  await applyTags(db, postId, input.tags);
  return getBlogPost(db, postId);
}

export async function getBlogPost(db: pg.Pool, id: string): Promise<BlogPost> {
  const { rows } = await db.query<BlogPostRow>(`SELECT ${FULL_COLUMNS} FROM ${BASE_FROM} WHERE p.id = $1`, [id]);
  return toBlogPost(db, requireRow(rows, "Blog post not found"));
}

/** The public site addresses Blog Posts by slug — same reasoning as Listings (listings/service.ts's getListingBySlug). */
export async function getBlogPostBySlug(db: pg.Pool, slug: string): Promise<BlogPost> {
  const { rows } = await db.query<BlogPostRow>(`SELECT ${FULL_COLUMNS} FROM ${BASE_FROM} WHERE p.slug = $1`, [slug]);
  return toBlogPost(db, requireRow(rows, "Blog post not found"));
}

/** Used by comments/ratings — a visitor can't interact with a post they can't read. */
export async function requirePublishedPost(db: pg.Pool, id: string): Promise<BlogPost> {
  const post = await getBlogPost(db, id);
  if (post.status !== "published") {
    throw new NotFoundError("Blog post not found");
  }
  return post;
}

export type UpdateBlogPostInput = Partial<BlogPostInput> & {
  status?: BlogPostStatus;
  /** Explicit publish date for scheduling — only meaningful when status is (becoming) 'published'. */
  publishedAt?: string;
};

export async function updateBlogPost(db: pg.Pool, id: string, input: UpdateBlogPostInput): Promise<BlogPost> {
  const current = await getBlogPost(db, id);
  await assertLinksValid(db, id, input.relatedPostIds, input.placeListingIds);
  const nextBody = input.body ?? current.body;
  const nextTitle = input.title ?? current.title;
  // Retitling re-slugs: the slug is derived from the title, so leaving it
  // stale would make it lie about its own post.
  const slug = input.title !== undefined ? await uniqueSlug(db, nextTitle, id) : current.slug;

  // Three cases for published_at, in order:
  //  1. Not becoming 'published' this write — leave it alone.
  //  2. Already live (set AND in the past) — never move it. An edit-then-
  //     republish must not silently reorder the reader-facing feed.
  //  3. Not yet live (first publish, or a still-future scheduled post being
  //     rescheduled) — honour an explicit publishedAt (scheduling), else NOW().
  await db.query(
    `UPDATE blog_posts SET category_id = $1, title = $2, slug = $3, excerpt = $4, body = $5,
       cover_image = $6, reading_time_minutes = $7, seo_title = $8, seo_description = $9,
       status = $10::text,
       published_at = CASE
         WHEN $10::text != 'published' THEN published_at
         WHEN published_at IS NOT NULL AND published_at <= NOW() THEN published_at
         ELSE COALESCE($14::timestamptz, NOW())
       END,
       og_image = $12, twitter_card = $13
     WHERE id = $11`,
    [
      input.categoryId ?? current.categoryId,
      nextTitle,
      slug,
      input.excerpt === undefined ? current.excerpt : input.excerpt,
      nextBody,
      input.coverImage === undefined ? current.coverImage : input.coverImage,
      readingTimeMinutes(nextBody),
      input.seoTitle === undefined ? current.seoTitle : input.seoTitle,
      input.seoDescription === undefined ? current.seoDescription : input.seoDescription,
      input.status ?? current.status,
      id,
      // undefined means "not in this PATCH" and keeps the stored value; null is
      // an explicit clear. Same rule as excerpt/coverImage above.
      input.ogImage === undefined ? current.ogImage : input.ogImage,
      input.twitterCard === undefined ? current.twitterCard : input.twitterCard,
      input.publishedAt ?? null,
    ],
  );
  await replaceLinks(db, id, input.relatedPostIds, input.placeListingIds);
  await applyTags(db, id, input.tags);
  return getBlogPost(db, id);
}

/**
 * `published_at` is stamped on the FIRST publish only — an edit-then-republish
 * must not silently reorder the reader-facing feed. Publishing an already-published
 * post is a no-op returning the unchanged post: the caller's intent is already met.
 */
export async function publishBlogPost(db: pg.Pool, id: string): Promise<BlogPost> {
  const current = await getBlogPost(db, id);
  if (current.status === "published") {
    return current;
  }
  await db.query(
    `UPDATE blog_posts SET status = 'published', published_at = COALESCE(published_at, NOW()) WHERE id = $1`,
    [id],
  );
  return getBlogPost(db, id);
}

/** Hard delete, cascading to comments and ratings — they're about the post and meaningless without it (ADR 0010 is about Businesses/Listings). No Trash/soft-delete — no precedent for it anywhere in this schema. */
export async function deleteBlogPost(db: pg.Pool, id: string): Promise<void> {
  const { rowCount } = await db.query(`DELETE FROM blog_posts WHERE id = $1`, [id]);
  requireDeleted(rowCount, "Blog post not found");
}

/**
 * Clones a post into a new draft — title suffixed " (Copy)", re-slugged,
 * status/published_at reset to the column defaults (draft/null). Attributed
 * to whoever clicked Duplicate, not the original author. Curated links
 * (relatedPostIds/placeListingIds) are deliberately NOT copied — a clean
 * copy shouldn't inherit editorial links to the post it was copied from.
 */
export async function duplicateBlogPost(db: pg.Pool, id: string, authorId: string): Promise<BlogPost> {
  const source = await getBlogPost(db, id);
  const title = `${source.title} (Copy)`;
  const slug = await uniqueSlug(db, title);
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO blog_posts (author_id, category_id, title, slug, excerpt, body, cover_image,
       reading_time_minutes, seo_title, seo_description, og_image, twitter_card)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      authorId,
      source.categoryId,
      title,
      slug,
      source.excerpt,
      source.body,
      source.coverImage,
      source.readingTimeMinutes,
      source.seoTitle,
      source.seoDescription,
      source.ogImage,
      source.twitterCard,
    ],
  );
  const newId = rows[0].id;
  await applyTags(db, newId, source.tags);
  return getBlogPost(db, newId);
}

export interface ListBlogPostsOptions {
  q?: string;
  category?: string;
  status?: string;
  /** Holds Content:view (Super Admin) — sees every status, not just published. */
  includeAll: boolean;
  page: number;
  pageSize: number;
}

export async function listBlogPosts(db: pg.Pool, options: ListBlogPostsOptions): Promise<BlogPostSummary[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.category) {
    const { rows } = await db.query<{ id: string }>(`SELECT id FROM blog_categories WHERE slug = $1`, [
      options.category,
    ]);
    if (!rows[0]) return [];
    params.push(rows[0].id);
    conditions.push(`p.category_id = $${params.length}`);
  }

  if (options.q) {
    // Plain ILIKE, not a GIN index — blog_posts has no search index, and at
    // this scale it doesn't need one (see Phase 8 spec).
    params.push(`%${options.q}%`);
    conditions.push(`(p.title ILIKE $${params.length} OR p.excerpt ILIKE $${params.length} OR p.body ILIKE $${params.length})`);
  }

  if (options.includeAll) {
    if (options.status) {
      params.push(options.status);
      conditions.push(`p.status = $${params.length}`);
    }
  } else {
    // A scheduled post (status='published', published_at in the future)
    // isn't actually live yet — same rule assertVisible enforces for GET by
    // id/slug. Pull-based site: this re-evaluates on every page load, no
    // cron needed for a scheduled post to "go live".
    conditions.push(`p.status = 'published' AND p.published_at <= NOW()`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(options.pageSize, (options.page - 1) * options.pageSize);
  const { rows } = await db.query<BlogPostRow>(
    `SELECT ${SUMMARY_COLUMNS} FROM ${BASE_FROM} ${where}
     ORDER BY p.published_at DESC NULLS LAST, p.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows.map(toSummary);
}

/**
 * Projects a set of Blog Post ids into BlogPostSummary cards, preserving the
 * given order — the same shape as listings/service.ts's summariesByIds,
 * used by GET /featured-sections' `blog` key (issue #21).
 */
export async function summariesByIds(db: pg.Pool, ids: string[]): Promise<BlogPostSummary[]> {
  if (ids.length === 0) return [];
  const { rows } = await db.query<BlogPostRow>(`SELECT ${SUMMARY_COLUMNS} FROM ${BASE_FROM} WHERE p.id = ANY($1)`, [ids]);
  const byId = new Map(rows.map((r) => [r.id, toSummary(r)]));
  return ids.map((id) => byId.get(id)).filter((s): s is BlogPostSummary => s !== undefined);
}
