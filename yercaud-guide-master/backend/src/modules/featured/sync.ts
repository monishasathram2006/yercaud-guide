import type pg from "pg";
import { computeFeaturedSection, rankPool, type FeaturedCandidate, type FeaturedRankingConfig } from "./ranking.js";
import {
  BLOG_FEATURED_SECTION,
  BLOG_RANKING_DEFAULTS,
  FALLBACK_PLATFORM_AVERAGE_ARTICLE_RATING,
  FALLBACK_PLATFORM_AVERAGE_RATING,
  FEATURED_RANKING_DEFAULTS,
  LISTING_FEATURED_SECTIONS,
} from "./config.js";

interface CandidateRow {
  id: string;
  average_rating: string;
  review_count: string;
  views: string;
  favorites: string;
  contact_reveals: string;
  enquiries: string;
  owner_id: string;
}

function toCandidate(row: CandidateRow): FeaturedCandidate {
  return {
    id: row.id,
    averageRating: Number(row.average_rating),
    reviewCount: Number(row.review_count),
    views: Number(row.views),
    favorites: Number(row.favorites),
    contactReveals: Number(row.contact_reveals),
    enquiries: Number(row.enquiries),
    ownerId: row.owner_id,
  };
}

/**
 * Raw per-Listing signals for every approved Listing in the given category
 * slugs — the same rating/review-count shape as listings/service.ts's
 * AGGREGATE_COLUMNS, plus the interaction counts Featured Score needs.
 */
async function loadListingCandidates(db: pg.Pool, categorySlugs: readonly string[]): Promise<FeaturedCandidate[]> {
  const { rows } = await db.query<CandidateRow>(
    `SELECT
       l.id,
       COALESCE((SELECT AVG(r.rating) FROM reviews r WHERE r.listing_id = l.id AND r.status = 'approved'), 0) AS average_rating,
       (SELECT COUNT(*) FROM reviews r WHERE r.listing_id = l.id AND r.status = 'approved') AS review_count,
       (SELECT COUNT(*) FROM listing_views v WHERE v.listing_id = l.id) AS views,
       (SELECT COUNT(*) FROM favorites f WHERE f.listing_id = l.id) AS favorites,
       (SELECT COUNT(*) FROM contact_reveals cr WHERE cr.listing_id = l.id) AS contact_reveals,
       (SELECT COUNT(*) FROM enquiries e WHERE e.listing_id = l.id) AS enquiries,
       biz.owner_id AS owner_id
     FROM listings l
     JOIN categories c ON c.id = l.category_id
     JOIN businesses biz ON biz.id = l.business_id
     WHERE l.status = 'approved' AND c.slug = ANY($1)`,
    [categorySlugs],
  );
  return rows.map(toCandidate);
}

/** The rating every low-review-count Listing's Bayesian rating is pulled toward. Falls back to a neutral default if the platform has no approved Reviews yet. */
async function computePlatformAverageRating(db: pg.Pool): Promise<number> {
  const { rows } = await db.query<{ avg: string | null }>(`SELECT AVG(rating) AS avg FROM reviews WHERE status = 'approved'`);
  const avg = rows[0]?.avg;
  return avg === null || avg === undefined ? FALLBACK_PLATFORM_AVERAGE_RATING : Number(avg);
}

/**
 * Raw per-Blog-Post signals (issue #21) — Article Rating average/count stand
 * in for a Listing's rating/reviewCount, approved comment count rides in the
 * `favorites` slot (see config.ts's BLOG_RANKING_DEFAULTS), and there's no
 * owning Business, so ownerId is always null.
 */
async function loadBlogPostCandidates(db: pg.Pool): Promise<FeaturedCandidate[]> {
  const { rows } = await db.query<{ id: string; average_rating: string; rating_count: string; views: string; comment_count: string }>(
    `SELECT
       p.id,
       COALESCE((SELECT AVG(ar.rating) FROM article_ratings ar WHERE ar.post_id = p.id), 0) AS average_rating,
       (SELECT COUNT(*) FROM article_ratings ar WHERE ar.post_id = p.id) AS rating_count,
       (SELECT COUNT(*) FROM blog_post_views v WHERE v.post_id = p.id) AS views,
       (SELECT COUNT(*) FROM blog_comments c WHERE c.post_id = p.id AND c.status = 'approved') AS comment_count
     FROM blog_posts p
     WHERE p.status = 'published'`,
  );
  return rows.map((row) => ({
    id: row.id,
    averageRating: Number(row.average_rating),
    reviewCount: Number(row.rating_count),
    views: Number(row.views),
    favorites: Number(row.comment_count),
    contactReveals: 0,
    enquiries: 0,
    ownerId: null,
  }));
}

/** The Article Rating every low-rating-count Blog Post's Bayesian rating is pulled toward. Falls back to a neutral default if there are no Article Ratings yet. */
async function computePlatformAverageArticleRating(db: pg.Pool): Promise<number> {
  const { rows } = await db.query<{ avg: string | null }>(`SELECT AVG(rating) AS avg FROM article_ratings`);
  const avg = rows[0]?.avg;
  return avg === null || avg === undefined ? FALLBACK_PLATFORM_AVERAGE_ARTICLE_RATING : Number(avg);
}

interface RankingRow {
  entityId: string;
  rankPosition: number | null;
  isDisplayed: boolean;
  isSponsored: boolean;
}

/**
 * The full row set for one section: every pool member (ranked, whether or
 * not displayed today) plus any displayed entity that bypassed the pool
 * entirely (a Sponsored placement with no organic ranking) — forward
 * compatible with issue #22, which will pass real Sponsored ids in here.
 */
function buildRankingRows(candidates: FeaturedCandidate[], sponsoredIds: string[], config: FeaturedRankingConfig): RankingRow[] {
  const pool = rankPool(candidates, config);
  const displayed = computeFeaturedSection(candidates, sponsoredIds, config);
  const displayedById = new Map(displayed.map((d) => [d.id, d.sponsored]));

  const rows: RankingRow[] = pool.map((id, index) => ({
    entityId: id,
    rankPosition: index + 1,
    isDisplayed: displayedById.has(id),
    isSponsored: displayedById.get(id) ?? false,
  }));

  const poolIds = new Set(pool);
  for (const [id, sponsored] of displayedById) {
    if (!poolIds.has(id)) {
      rows.push({ entityId: id, rankPosition: null, isDisplayed: true, isSponsored: sponsored });
    }
  }
  return rows;
}

/** Replaces a section's rows wholesale — simpler than diffing a rotation, and the table is small. */
async function writeSectionRankings(db: pg.Pool, section: string, rows: RankingRow[]): Promise<void> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM featured_rankings WHERE section = $1`, [section]);
    for (const row of rows) {
      await client.query(
        `INSERT INTO featured_rankings (section, entity_id, rank_position, is_displayed, is_sponsored)
         VALUES ($1, $2, $3, $4, $5)`,
        [section, row.entityId, row.rankPosition, row.isDisplayed, row.isSponsored],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Which section a category slug feeds — the reverse of LISTING_FEATURED_SECTIONS.
 */
const SECTION_BY_CATEGORY_SLUG: Record<string, keyof typeof LISTING_FEATURED_SECTIONS> = Object.fromEntries(
  Object.entries(LISTING_FEATURED_SECTIONS).flatMap(([section, slugs]) =>
    slugs.map((slug) => [slug, section as keyof typeof LISTING_FEATURED_SECTIONS]),
  ),
);

/**
 * Currently-active Sponsored placements (issue #22), bucketed by the
 * Listing-section they belong to — the real data this job passes into
 * computeFeaturedSection's sponsoredIds parameter. Mirrors
 * marketing/featured-listings.ts's PUBLIC_VISIBILITY date-range check.
 */
async function loadActiveSponsoredIdsBySection(
  db: pg.Pool,
): Promise<Partial<Record<keyof typeof LISTING_FEATURED_SECTIONS, string[]>>> {
  const { rows } = await db.query<{ listing_id: string; category_slug: string }>(
    `SELECT fl.listing_id, c.slug AS category_slug
     FROM featured_listings fl
     JOIN listings l ON l.id = fl.listing_id
     JOIN categories c ON c.id = l.category_id
     WHERE fl.start_date <= CURRENT_DATE AND (fl.end_date IS NULL OR fl.end_date >= CURRENT_DATE)`,
  );
  const bySection: Partial<Record<keyof typeof LISTING_FEATURED_SECTIONS, string[]>> = {};
  for (const row of rows) {
    const section = SECTION_BY_CATEGORY_SLUG[row.category_slug];
    if (!section) continue;
    (bySection[section] ??= []).push(row.listing_id);
  }
  return bySection;
}

export interface FeaturedRankingSyncOptions {
  /** Overrides the default "today's date" rotation seed — tests use this for a fixed, predictable seed. */
  rotationSeed?: string;
  /**
   * Sponsored ids per section (issue #22). Defaults to querying currently-active
   * Sponsored placements from the database; tests can override this to control
   * exactly which ids are treated as Sponsored without depending on real dates.
   */
  sponsoredIdsBySection?: Partial<Record<keyof typeof LISTING_FEATURED_SECTIONS, string[]>>;
}

/**
 * The daily Featured ranking job's core (issue #19) — recomputes Featured
 * Score for every approved Listing in each of the four Listing sections and
 * replaces that section's featured_rankings rows. No DB dependency beyond
 * the pool passed in, so tests can invoke this directly against a seeded
 * test database rather than shelling out to the npm script.
 */
export async function runFeaturedRankingSync(db: pg.Pool, options: FeaturedRankingSyncOptions = {}): Promise<void> {
  const rotationSeed = options.rotationSeed ?? new Date().toISOString().slice(0, 10);
  const platformAverageRating = await computePlatformAverageRating(db);
  const sponsoredIdsBySection = options.sponsoredIdsBySection ?? (await loadActiveSponsoredIdsBySection(db));

  for (const [section, categorySlugs] of Object.entries(LISTING_FEATURED_SECTIONS)) {
    const candidates = await loadListingCandidates(db, categorySlugs);
    const config: FeaturedRankingConfig = { ...FEATURED_RANKING_DEFAULTS, platformAverageRating, rotationSeed };
    const sponsoredIds = sponsoredIdsBySection[section as keyof typeof LISTING_FEATURED_SECTIONS] ?? [];
    const rows = buildRankingRows(candidates, sponsoredIds, config);
    await writeSectionRankings(db, section, rows);
  }

  const platformAverageArticleRating = await computePlatformAverageArticleRating(db);
  const blogCandidates = await loadBlogPostCandidates(db);
  const blogConfig: FeaturedRankingConfig = {
    ...BLOG_RANKING_DEFAULTS,
    platformAverageRating: platformAverageArticleRating,
    rotationSeed,
  };
  // No Sponsored ids ever — Sponsored isn't available for Blog Posts (ADR-0012).
  const blogRows = buildRankingRows(blogCandidates, [], blogConfig);
  await writeSectionRankings(db, BLOG_FEATURED_SECTION, blogRows);
}
