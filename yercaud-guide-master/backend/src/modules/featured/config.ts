import type { FeaturedRankingConfig } from "./ranking.js";

/**
 * Which of the four "core" category slugs feed each Listing Featured
 * section. Hardcoded, not read from the categories table: the home page
 * already treats these as fixed, known categories (separate route files per
 * category — hotels.tsx, restaurants.tsx, activities.tsx, tours.tsx,
 * travel.tsx — not a dynamic list), so this mapping matches that existing
 * assumption rather than inventing a new one. "toursAndTravels" spans two
 * category slugs (tour, travel) merged into one shelf, matching the home
 * page's existing "Tours & Travels" grouping.
 */
export const LISTING_FEATURED_SECTIONS = {
  hotels: ["hotel"],
  restaurants: ["restaurant"],
  activities: ["activity"],
  toursAndTravels: ["tour", "travel"],
} as const;

export type ListingFeaturedSection = keyof typeof LISTING_FEATURED_SECTIONS;

export const BLOG_FEATURED_SECTION = "blog" as const;

/**
 * Every section the daily job computes rankings for. Kept in one place
 * (rather than inlined magic numbers per call site) so the ranking's
 * behaviour can be tuned post-launch without hunting through the codebase —
 * see the Featured Sections spec's "Further Notes".
 */
export const FEATURED_RANKING_DEFAULTS: Omit<FeaturedRankingConfig, "rotationSeed"> = {
  minReviews: 1,
  bayesianConfidence: 10,
  interactionWeights: { enquiry: 8, favorite: 3, contactReveal: 3, view: 1 },
  poolSize: 15,
  displaySize: 6,
  sponsoredCap: 1,
  // Overwritten per run with the platform-wide average rating computed from live data.
  platformAverageRating: 0,
};

/** A neutral rating to fall back on if the platform has no approved Reviews at all yet. */
export const FALLBACK_PLATFORM_AVERAGE_RATING = 4.0;

/**
 * Featured Blog's ranking config (issue #21). Reuses the same pure ranking
 * function as Listings — Article Rating stands in for `averageRating`,
 * Article Rating count for `reviewCount` (the same "≥1 rating to be
 * eligible" floor, applied to Article Ratings), and approved comment count
 * is carried in the `favorites` slot as the interaction tiebreaker alongside
 * Views (see sync.ts's loadBlogPostCandidates for the exact mapping). No
 * `enquiry`/`contactReveal` signal exists for a Blog Post, so those weights
 * are zeroed. sponsoredCap is 0: Sponsored isn't available for Blog Posts,
 * which have no owning Business to attribute payment to (ADR-0012).
 */
export const BLOG_RANKING_DEFAULTS: Omit<FeaturedRankingConfig, "rotationSeed" | "platformAverageRating"> = {
  minReviews: 1,
  bayesianConfidence: 10,
  interactionWeights: { enquiry: 0, favorite: 5, contactReveal: 0, view: 1 },
  poolSize: 15,
  displaySize: 6,
  sponsoredCap: 0,
};

/** A neutral rating to fall back on if the platform has no Article Ratings at all yet. */
export const FALLBACK_PLATFORM_AVERAGE_ARTICLE_RATING = 4.0;
