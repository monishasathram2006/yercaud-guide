-- Up Migration
--
-- Precomputed Featured Score ranking (issue #19, part of the Featured
-- Sections epic — ADR-0011). Written only by the daily ranking job
-- (scripts/featured-ranking-sync.ts); GET /featured-sections reads this
-- table only — it never aggregates rating/interaction signals live.
--
-- One row per (section, entity_id): section is one of the home page's
-- Featured shelves ('hotels', 'restaurants', 'activities',
-- 'toursAndTravels', 'blog' — the last added by issue #21). entity_id is a
-- Listing id for every section except 'blog', where it's a Blog Post id; no
-- FK, since which table it references depends on the section.
--
-- Every row in the day's wider ranked pool is kept, not just the displayed
-- subset (rank_position orders the whole pool; is_displayed flags which of
-- it is actually shown) — this is what lets a future ticket answer "how
-- close was I to Featured" without recomputing. is_sponsored is always
-- false until issue #22 wires in real Sponsored placements; a Sponsored
-- entity can be displayed with no pool rank at all (rank_position NULL),
-- since Sponsored bypasses organic eligibility entirely.
--
-- The job replaces a section's rows wholesale on each run (delete + insert
-- in one transaction) rather than upserting — simpler than diffing a
-- rotation, and the whole table is small.

CREATE TABLE featured_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section VARCHAR(20) NOT NULL
    CHECK (section IN ('hotels', 'restaurants', 'activities', 'toursAndTravels', 'blog')),
  entity_id UUID NOT NULL,
  rank_position INTEGER,
  is_displayed BOOLEAN NOT NULL DEFAULT false,
  is_sponsored BOOLEAN NOT NULL DEFAULT false,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (section, entity_id)
);
CREATE INDEX idx_featured_rankings_section_displayed ON featured_rankings(section) WHERE is_displayed = true;

-- Down Migration

DROP TABLE featured_rankings;
