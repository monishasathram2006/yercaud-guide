/**
 * The pure Featured Score ranking core (issue #17, part of the Featured
 * Sections epic — ADR-0011). No DB, no HTTP: given raw per-candidate signals
 * already aggregated by the caller, it decides who's eligible, how they rank,
 * and which of a wider pool get displayed today. Everything here is the
 * "should not be biased" logic — deliberately isolated so it's exhaustively
 * unit-testable without a database.
 */

export interface FeaturedCandidate {
  id: string;
  averageRating: number;
  reviewCount: number;
  views: number;
  favorites: number;
  contactReveals: number;
  enquiries: number;
  /** Unused by the ranking math itself (owner-exclusion already happened when the
   * underlying signals were recorded) — carried through for callers/future use. */
  ownerId: string | null;
}

export interface InteractionWeights {
  enquiry: number;
  favorite: number;
  contactReveal: number;
  view: number;
}

export interface FeaturedRankingConfig {
  /** The platform-wide average rating ("C") a low-review-count candidate's Bayesian rating is pulled toward. */
  platformAverageRating: number;
  /** Minimum reviews to be organically eligible at all. */
  minReviews: number;
  /** How many reviews' worth of weight the platform average carries ("m") in the Bayesian formula. Higher = slower to trust a candidate's own rating. */
  bayesianConfidence: number;
  interactionWeights: InteractionWeights;
  /** Size of the ranked pool computed before rotation — wider than displaySize. */
  poolSize: number;
  /** How many items are actually shown. */
  displaySize: number;
  /** Max Sponsored items allowed in the output. */
  sponsoredCap: number;
  /** Deterministic seed for today's rotation pick (e.g. the compute date) — same seed, same selection. */
  rotationSeed: string;
}

export interface FeaturedRankingItem {
  id: string;
  sponsored: boolean;
}

function bayesianRating(candidate: FeaturedCandidate, config: FeaturedRankingConfig): number {
  const { reviewCount, averageRating } = candidate;
  const { bayesianConfidence, platformAverageRating } = config;
  return (reviewCount * averageRating + bayesianConfidence * platformAverageRating) / (reviewCount + bayesianConfidence);
}

function interactionScore(candidate: FeaturedCandidate, weights: InteractionWeights): number {
  return (
    candidate.enquiries * weights.enquiry +
    candidate.favorites * weights.favorite +
    candidate.contactReveals * weights.contactReveal +
    candidate.views * weights.view
  );
}

/** A small deterministic PRNG (mulberry32) seeded from a string hash — same seed always produces the same sequence. */
function seededRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return function next() {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic Fisher-Yates shuffle using a seeded RNG — stable for a given seed + input order. */
function seededShuffle<T>(items: T[], seed: string): T[] {
  const result = [...items];
  const random = seededRandom(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * The organic ranked pool for one category — every eligible candidate,
 * scored and sorted, cut to `config.poolSize`. Exposed separately from
 * {@link computeFeaturedSection} so a caller (the daily job, issue #19) can
 * persist "how everyone in contention ranked", not just who's displayed.
 */
export function rankPool(candidates: FeaturedCandidate[], config: FeaturedRankingConfig): string[] {
  const eligible = candidates.filter((c) => c.reviewCount >= config.minReviews);

  const scored = eligible.map((c) => ({
    id: c.id,
    bayesianRating: bayesianRating(c, config),
    interactionScore: interactionScore(c, config.interactionWeights),
  }));

  scored.sort((a, b) => {
    if (b.bayesianRating !== a.bayesianRating) return b.bayesianRating - a.bayesianRating;
    if (b.interactionScore !== a.interactionScore) return b.interactionScore - a.interactionScore;
    // Final deterministic tiebreak so equally-scored candidates don't reorder run to run.
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return scored.slice(0, config.poolSize).map((s) => s.id);
}

/**
 * Ranks candidates for one category's Featured shelf. `sponsoredIds` bypass
 * eligibility entirely (a Sponsored placement needs no review history) and
 * are placed ahead of the organic selection, capped at `config.sponsoredCap`.
 * If a Sponsored id is also organically pool-worthy, it isn't shown twice —
 * the slot it would have taken is backfilled from the next pool candidate.
 */
export function computeFeaturedSection(
  candidates: FeaturedCandidate[],
  sponsoredIds: string[],
  config: FeaturedRankingConfig,
): FeaturedRankingItem[] {
  const pool = rankPool(candidates, config);

  const cappedSponsored = [...new Set(sponsoredIds)].slice(0, Math.max(config.sponsoredCap, 0));
  const organicPool = pool.filter((id) => !cappedSponsored.includes(id));

  const organicSlots = Math.max(config.displaySize - cappedSponsored.length, 0);
  const organicSelection = seededShuffle(organicPool, config.rotationSeed).slice(0, organicSlots);

  return [
    ...cappedSponsored.map((id) => ({ id, sponsored: true })),
    ...organicSelection.map((id) => ({ id, sponsored: false })),
  ];
}
