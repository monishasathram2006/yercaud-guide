-- Up Migration
--
-- FR30's promotional badge (Popular, Luxury, Best Seller, Budget) — Phase 10.
--
-- Nothing stored one. featured_listings is dates and a sort order;
-- promotions.title is a promotion's headline, not a badge. Meanwhile
-- BusinessCard styles badges with a switch on the string, so a free-text badge
-- means a typo renders unstyled and nobody notices until a customer does.
--
-- Modelled as a lookup rather than a column for that reason: a badge is the
-- same kind of thing as a price band or a property type — a small,
-- Super-Admin-curated, styled vocabulary — and this schema already has a
-- well-worn pattern for exactly that, including the categories.color precedent
-- for carrying presentation in the row instead of hardcoding it client-side.
--
-- FR178's list of master taxonomies does not name badges. This extends that
-- list by implication, which is noted here rather than left to be discovered.
CREATE TABLE badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label VARCHAR(100) NOT NULL UNIQUE,
  -- Hex, matching the categories.color convention.
  color VARCHAR(20),
  sort_order INT NOT NULL DEFAULT 0
);

-- ON DELETE SET NULL, not CASCADE: retiring a badge must not delete the
-- Listings wearing it.
ALTER TABLE listings
  ADD COLUMN badge_id UUID REFERENCES badges(id) ON DELETE SET NULL;

CREATE INDEX idx_listings_badge ON listings(badge_id);

-- Down Migration

DROP INDEX IF EXISTS idx_listings_badge;
ALTER TABLE listings DROP COLUMN IF EXISTS badge_id;
DROP TABLE IF EXISTS badges;
