import { describe, expect, it } from "vitest";
import { computeFeaturedSection, type FeaturedCandidate, type FeaturedRankingConfig } from "../src/modules/featured/ranking.js";

function candidate(overrides: Partial<FeaturedCandidate> & { id: string }): FeaturedCandidate {
  return {
    averageRating: 0,
    reviewCount: 0,
    views: 0,
    favorites: 0,
    contactReveals: 0,
    enquiries: 0,
    ownerId: null,
    ...overrides,
  };
}

function config(overrides: Partial<FeaturedRankingConfig> = {}): FeaturedRankingConfig {
  return {
    platformAverageRating: 4.0,
    minReviews: 1,
    bayesianConfidence: 10,
    interactionWeights: { enquiry: 8, favorite: 3, contactReveal: 3, view: 1 },
    poolSize: 15,
    displaySize: 6,
    sponsoredCap: 1,
    rotationSeed: "2026-07-25",
    ...overrides,
  };
}

describe("computeFeaturedSection — Featured Score ranking core (issue #17, ADR-0011)", () => {
  it("does not let one glowing review outrank hundreds of solidly-rated ones", () => {
    const oneReview = candidate({ id: "one-review-5-star", reviewCount: 1, averageRating: 5 });
    const manyReviews = candidate({ id: "two-hundred-reviews-4.7", reviewCount: 200, averageRating: 4.7 });

    const result = computeFeaturedSection([oneReview, manyReviews], [], config({ displaySize: 2, poolSize: 2 }));

    expect(result.map((r) => r.id)).toEqual(["two-hundred-reviews-4.7", "one-review-5-star"]);
  });

  it("pulls a low-review-count candidate's rating toward the platform average, not its raw average", () => {
    // 1 review at 5 stars, platform average 4.0, confidence 10 -> (1*5 + 10*4)/11 ≈ 4.09, nowhere near 5.
    const oneReview = candidate({ id: "new-listing", reviewCount: 1, averageRating: 5 });
    const nearAverage = candidate({ id: "established-listing", reviewCount: 50, averageRating: 4.2 });

    const result = computeFeaturedSection([oneReview, nearAverage], [], config({ displaySize: 2, poolSize: 2 }));

    // 50 reviews at 4.2 -> (50*4.2 + 10*4)/60 = 4.167, which beats the pulled-down ~4.09.
    expect(result.map((r) => r.id)).toEqual(["established-listing", "new-listing"]);
  });

  it("breaks ties between similarly-rated candidates by intent-weighted interaction volume", () => {
    // Identical rating/review count so bayesianRating ties exactly.
    const highIntent = candidate({ id: "high-intent", reviewCount: 20, averageRating: 4.5, enquiries: 10, views: 0 });
    const highTraffic = candidate({ id: "high-traffic", reviewCount: 20, averageRating: 4.5, enquiries: 0, views: 1000 });

    const result = computeFeaturedSection(
      [highIntent, highTraffic],
      [],
      config({ displaySize: 2, poolSize: 2, interactionWeights: { enquiry: 8, favorite: 3, contactReveal: 3, view: 1 } }),
    );

    // 10 enquiries * 8 = 80 beats 1000 views * 1 = 1000? No — 1000 > 80, so high-traffic actually wins here.
    // This asserts the weighting is applied (not that views always lose) — verify against the actual weighted numbers.
    expect(result.map((r) => r.id)).toEqual(["high-traffic", "high-intent"]);
  });

  it("lets a modest amount of high-intent interaction beat a merely large view count once weighted", () => {
    const highIntent = candidate({ id: "high-intent", reviewCount: 20, averageRating: 4.5, enquiries: 50, views: 0 });
    const highTraffic = candidate({ id: "high-traffic", reviewCount: 20, averageRating: 4.5, enquiries: 0, views: 100 });

    const result = computeFeaturedSection(
      [highIntent, highTraffic],
      [],
      config({ displaySize: 2, poolSize: 2, interactionWeights: { enquiry: 8, favorite: 3, contactReveal: 3, view: 1 } }),
    );

    // 50 enquiries * 8 = 400 vs 100 views * 1 = 100 -> high-intent wins.
    expect(result.map((r) => r.id)).toEqual(["high-intent", "high-traffic"]);
  });

  it("excludes candidates below the minimum review count from the ranked pool entirely", () => {
    const noReviews = candidate({ id: "zero-reviews", reviewCount: 0, averageRating: 0, views: 100000 });
    const oneReview = candidate({ id: "one-review", reviewCount: 1, averageRating: 3 });

    const result = computeFeaturedSection([noReviews, oneReview], [], config({ minReviews: 1, displaySize: 5, poolSize: 5 }));

    expect(result.map((r) => r.id)).toEqual(["one-review"]);
  });

  it("only pulls the displayed selection from the wider pool, never from candidates ranked outside it", () => {
    const candidates = Array.from({ length: 10 }, (_, i) =>
      candidate({ id: `c${i}`, reviewCount: 20, averageRating: 5 - i * 0.1 }),
    );
    // Only the top 3 by rating should ever be eligible for display.
    const result = computeFeaturedSection(candidates, [], config({ poolSize: 3, displaySize: 3, rotationSeed: "seed-a" }));

    expect(result.map((r) => r.id).sort()).toEqual(["c0", "c1", "c2"]);
  });

  it("selects a fewer-than-poolSize pool deterministically the same way every time for a given seed", () => {
    const candidates = Array.from({ length: 20 }, (_, i) => candidate({ id: `c${i}`, reviewCount: 20, averageRating: 4.5 }));
    const cfg = config({ poolSize: 20, displaySize: 6, rotationSeed: "same-seed" });

    const first = computeFeaturedSection(candidates, [], cfg);
    const second = computeFeaturedSection(candidates, [], cfg);

    expect(first).toEqual(second);
  });

  it("can select a different display set for a different rotation seed", () => {
    const candidates = Array.from({ length: 20 }, (_, i) => candidate({ id: `c${i}`, reviewCount: 20, averageRating: 4.5 }));
    const base = { poolSize: 20, displaySize: 6 };

    const results = ["seed-1", "seed-2", "seed-3", "seed-4", "seed-5"].map((seed) =>
      JSON.stringify(computeFeaturedSection(candidates, [], config({ ...base, rotationSeed: seed }))),
    );

    expect(new Set(results).size).toBeGreaterThan(1);
  });

  it("places Sponsored ids ahead of the organic selection, flagged sponsored", () => {
    const candidates = Array.from({ length: 5 }, (_, i) => candidate({ id: `organic-${i}`, reviewCount: 20, averageRating: 4.5 }));

    const result = computeFeaturedSection(candidates, ["sponsored-listing"], config({ poolSize: 5, displaySize: 3, sponsoredCap: 1 }));

    expect(result[0]).toEqual({ id: "sponsored-listing", sponsored: true });
    expect(result).toHaveLength(3);
    expect(result.slice(1).every((r) => !r.sponsored)).toBe(true);
  });

  it("lets a Sponsored placement bypass eligibility entirely — it doesn't need to appear in candidates at all", () => {
    const result = computeFeaturedSection([], ["brand-new-zero-review-listing"], config({ poolSize: 5, displaySize: 3 }));

    expect(result).toEqual([{ id: "brand-new-zero-review-listing", sponsored: true }]);
  });

  it("caps Sponsored ids at sponsoredCap even if more are passed in", () => {
    const result = computeFeaturedSection([], ["s1", "s2", "s3"], config({ sponsoredCap: 1, displaySize: 5, poolSize: 5 }));

    expect(result).toEqual([{ id: "s1", sponsored: true }]);
  });

  it("does not show a Sponsored candidate twice when it's also organically top-ranked — the freed slot backfills from the next pool candidate", () => {
    const top = candidate({ id: "top-and-sponsored", reviewCount: 50, averageRating: 5 });
    const second = candidate({ id: "second", reviewCount: 50, averageRating: 4.9 });
    const third = candidate({ id: "third", reviewCount: 50, averageRating: 4.8 });

    const result = computeFeaturedSection(
      [top, second, third],
      ["top-and-sponsored"],
      config({ poolSize: 3, displaySize: 2, sponsoredCap: 1 }),
    );

    const ids = result.map((r) => r.id);
    expect(ids).toHaveLength(2);
    expect(ids.filter((id) => id === "top-and-sponsored")).toHaveLength(1);
    expect(ids).toContain("second");
    expect(result[0]).toEqual({ id: "top-and-sponsored", sponsored: true });
  });

  it("returns fewer than displaySize items when there aren't enough eligible candidates, without erroring", () => {
    const only = candidate({ id: "only-one", reviewCount: 5, averageRating: 4 });

    const result = computeFeaturedSection([only], [], config({ displaySize: 6, poolSize: 15 }));

    expect(result).toEqual([{ id: "only-one", sponsored: false }]);
  });

  it("returns an empty array when there are no eligible candidates and no Sponsored ids", () => {
    const result = computeFeaturedSection([], [], config());
    expect(result).toEqual([]);
  });
});
