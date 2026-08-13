-- Up Migration
--
-- Gives a Listing a real, comparable, filterable price (Phase 10).
--
-- Until now no price existed on a Listing at all. price_bands was a standalone
-- lookup with no relationship to listings, so GET /listings?priceBand=X
-- validated the band and returned unfiltered results — Phase 4's plan promised
-- price-band filtering and never delivered it. Meanwhile FR14/21/24/28/30/81
-- all want a price on a card and a working price filter.

-- FR58 asks for a per-person price on the Activity and Tour enquiry widgets,
-- and nothing stored one. Hotels and Restaurants already had a price source
-- (hotel_rooms.rate_per_night, restaurant_details.avg_cost_for_two); these two
-- categories had none.
ALTER TABLE activity_details ADD COLUMN price_per_person INT;
ALTER TABLE tour_details ADD COLUMN price_per_person INT;

-- The Listing's headline price, denormalized onto the base table.
--
-- This is the schema's first cache, and the choice is deliberate. The
-- alternative — computing per-category with a LATERAL join across four detail
-- tables at query time — cannot use an index, and would land that cost on the
-- public directory, the hottest endpoint in the product.
--
-- ADR 0003 also makes the base table the only possible home: the four
-- detail-less categories (Travel, Shopping, Health & Wellness, Other Services)
-- have no detail table to derive from, yet FR24 still wants a price indicator
-- on every directory row. This is the one place all eight categories can carry
-- a price.
--
-- The unit is stored, not a formatted label. The mock's "₹3,500/night" mixes a
-- number and a unit into one presentational string, which cannot be filtered
-- on; clients format from the number and the unit.
ALTER TABLE listings
  ADD COLUMN price_from INT CHECK (price_from IS NULL OR price_from >= 0),
  ADD COLUMN price_unit VARCHAR(20)
    CHECK (price_unit IS NULL OR price_unit IN ('per_night', 'for_two', 'per_person', 'from'));

CREATE INDEX idx_listings_price_from ON listings(price_from);

-- Recomputes a Listing's cached price from whichever detail table owns the
-- truth for it.
--
-- Which source applies is decided by which detail row exists, not by the
-- category's slug. ADR 0003 ties a rich category to its detail table only by
-- convention and detail-category-guard.ts treats the slug as the de facto kind
-- identifier — but a slug is user-editable data a Super Admin can rename, and a
-- trigger that silently stopped deriving prices on a rename would be a bad way
-- to find that out. A detail row's existence is structural.
--
-- A rich-category Listing with no detail row yet resolves to NULL: it has no
-- price source, and it must not fall through to keeping a directly-written
-- value, which is what the service layer refuses to accept in the first place.
-- The unit is nulled alongside a null amount rather than left standing. A unit
-- with no price is meaningless, and keeping one would make the two routes to
-- "this Listing has no price" disagree: a Hotel that never had a room would
-- report no unit, while a Hotel whose last room was deleted would report
-- 'per_night' against a null price.
CREATE OR REPLACE FUNCTION recompute_listing_price(p_listing_id UUID)
RETURNS VOID AS $$
DECLARE
  v_amount INT;
  v_unit   VARCHAR(20);
BEGIN
  IF EXISTS (SELECT 1 FROM hotel_details WHERE listing_id = p_listing_id) THEN
    SELECT MIN(rate_per_night) INTO v_amount FROM hotel_rooms WHERE listing_id = p_listing_id;
    v_unit := 'per_night';

  ELSIF EXISTS (SELECT 1 FROM restaurant_details WHERE listing_id = p_listing_id) THEN
    SELECT avg_cost_for_two INTO v_amount FROM restaurant_details WHERE listing_id = p_listing_id;
    v_unit := 'for_two';

  ELSIF EXISTS (SELECT 1 FROM activity_details WHERE listing_id = p_listing_id) THEN
    SELECT price_per_person INTO v_amount FROM activity_details WHERE listing_id = p_listing_id;
    v_unit := 'per_person';

  ELSIF EXISTS (SELECT 1 FROM tour_details WHERE listing_id = p_listing_id) THEN
    SELECT price_per_person INTO v_amount FROM tour_details WHERE listing_id = p_listing_id;
    v_unit := 'per_person';

  ELSE
    RETURN;
  END IF;

  UPDATE listings
  SET price_from = v_amount,
      price_unit = CASE WHEN v_amount IS NULL THEN NULL ELSE v_unit END
  WHERE id = p_listing_id;
END;
$$ LANGUAGE plpgsql;

-- The trigger is the backstop, not the belt: the service layer derives on write
-- too. A cache whose only guard is "remember to call the right function" is a
-- cache that will eventually be wrong, and a directory that lies about price is
-- worse than one that has none.
CREATE OR REPLACE FUNCTION trg_recompute_listing_price()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM recompute_listing_price(COALESCE(NEW.listing_id, OLD.listing_id));
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_hotel_rooms_price
  AFTER INSERT OR UPDATE OR DELETE ON hotel_rooms
  FOR EACH ROW EXECUTE FUNCTION trg_recompute_listing_price();

CREATE TRIGGER trg_restaurant_details_price
  AFTER INSERT OR UPDATE ON restaurant_details
  FOR EACH ROW EXECUTE FUNCTION trg_recompute_listing_price();

CREATE TRIGGER trg_activity_details_price
  AFTER INSERT OR UPDATE ON activity_details
  FOR EACH ROW EXECUTE FUNCTION trg_recompute_listing_price();

CREATE TRIGGER trg_tour_details_price
  AFTER INSERT OR UPDATE ON tour_details
  FOR EACH ROW EXECUTE FUNCTION trg_recompute_listing_price();

-- Down Migration

DROP TRIGGER IF EXISTS trg_tour_details_price ON tour_details;
DROP TRIGGER IF EXISTS trg_activity_details_price ON activity_details;
DROP TRIGGER IF EXISTS trg_restaurant_details_price ON restaurant_details;
DROP TRIGGER IF EXISTS trg_hotel_rooms_price ON hotel_rooms;
DROP FUNCTION IF EXISTS trg_recompute_listing_price();
DROP FUNCTION IF EXISTS recompute_listing_price(UUID);
DROP INDEX IF EXISTS idx_listings_price_from;
ALTER TABLE listings DROP COLUMN IF EXISTS price_unit;
ALTER TABLE listings DROP COLUMN IF EXISTS price_from;
ALTER TABLE tour_details DROP COLUMN IF EXISTS price_per_person;
ALTER TABLE activity_details DROP COLUMN IF EXISTS price_per_person;
