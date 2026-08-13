import type pg from "pg";
import { summariesByIds, type ListingSummary } from "../listings/service.js";
import { summariesByIds as blogSummariesByIds, type BlogPostSummary } from "../blog/posts.js";
import { BLOG_FEATURED_SECTION, LISTING_FEATURED_SECTIONS, type ListingFeaturedSection } from "./config.js";

export interface FeaturedListingItem extends ListingSummary {
  sponsored: boolean;
}

/**
 * Blog Post items carry no `sponsored` field at all — not even `false` —
 * since Sponsored isn't a concept that applies to Blog Posts (issue #21,
 * ADR-0012: no owning Business to attribute payment to). Omitting the field
 * says "not applicable"; a `sponsored: false` would misleadingly imply it
 * could be sponsored and simply isn't today.
 */
export type FeaturedSections = Record<ListingFeaturedSection, FeaturedListingItem[]> & {
  blog: BlogPostSummary[];
};

/**
 * Reads one section's displayed selection: Sponsored first, then the rest by
 * pool rank. Purely a read of the precomputed table — no live aggregation.
 */
async function loadSectionEntityIds(db: pg.Pool, section: string): Promise<{ id: string; sponsored: boolean }[]> {
  const { rows } = await db.query<{ entity_id: string; is_sponsored: boolean }>(
    `SELECT entity_id, is_sponsored FROM featured_rankings
     WHERE section = $1 AND is_displayed = true
     ORDER BY is_sponsored DESC, rank_position ASC NULLS LAST`,
    [section],
  );
  return rows.map((r) => ({ id: r.entity_id, sponsored: r.is_sponsored }));
}

/**
 * GET /featured-sections' data (issue #19, extended for Blog by #21). One
 * query per section, then one summariesByIds call to turn ids into full
 * cards in the same order — the home page's original N+1 (one
 * featuredListings() call, then one byId() per row) collapses into this
 * handful of queries instead.
 */
export async function getFeaturedSections(db: pg.Pool): Promise<FeaturedSections> {
  const entries = await Promise.all(
    Object.keys(LISTING_FEATURED_SECTIONS).map(async (section) => {
      const picks = await loadSectionEntityIds(db, section);
      const summaries = await summariesByIds(
        db,
        picks.map((p) => p.id),
      );
      const sponsoredById = new Map(picks.map((p) => [p.id, p.sponsored]));
      const items: FeaturedListingItem[] = summaries.map((s) => ({ ...s, sponsored: sponsoredById.get(s.id) ?? false }));
      return [section, items] as const;
    }),
  );

  const blogPicks = await loadSectionEntityIds(db, BLOG_FEATURED_SECTION);
  const blog = await blogSummariesByIds(
    db,
    blogPicks.map((p) => p.id),
  );

  return { ...Object.fromEntries(entries), blog } as FeaturedSections;
}
