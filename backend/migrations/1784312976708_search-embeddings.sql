-- Up Migration
--
-- The hybrid search engine (issue #11). Adds the semantic leg's storage to the
-- schema: one embedding vector per Listing and per Business, alongside the exact
-- composed text that produced it and a staleness flag. The lexical leg needs no
-- new columns — it reads the same content already stored — but it does need the
-- trigram extension for typo/prefix tolerance.
--
-- pgvector's `vector` type and pg_trgm both ship in the pgvector/pgvector:pg16
-- image (docker-compose). A plain postgres:16 image lacks `vector`; the image
-- swap is part of this change.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1536 is text-embedding-3-small's native dimensionality. The composed source
-- text lives beside the vector so the reconcile job can skip a row whose text is
-- unchanged, and so a match can be explained. `embedding_stale` is the single
-- source of truth for "needs (re)embedding": a fresh row starts stale (no vector
-- yet), and any content change flips it back to true.
ALTER TABLE listings
  ADD COLUMN embedding vector(1536),
  ADD COLUMN embedding_text text,
  ADD COLUMN embedding_stale boolean NOT NULL DEFAULT true;

ALTER TABLE businesses
  ADD COLUMN embedding vector(1536),
  ADD COLUMN embedding_text text,
  ADD COLUMN embedding_stale boolean NOT NULL DEFAULT true;

-- IVFFlat would need tuning and a populated table to build its lists; at this
-- directory's scale an exact cosine scan is fast and needs no maintenance. The
-- HNSW index is here so the query planner has an ordered-scan option as the
-- corpus grows — cosine distance (`<=>`) to match the query's operator.
CREATE INDEX listings_embedding_idx ON listings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX businesses_embedding_idx ON businesses USING hnsw (embedding vector_cosine_ops);

-- Trigram indexes back the lexical leg's fuzzy fallback (`name % $query` and
-- similarity()), so a typo'd or prefix query still produces candidates instead
-- of an empty FTS result.
CREATE INDEX listings_name_trgm_idx ON listings USING gin (name gin_trgm_ops);
CREATE INDEX businesses_name_trgm_idx ON businesses USING gin (name gin_trgm_ops);

-- --- Staleness marking ------------------------------------------------------
--
-- Writes never compute an embedding inline (an Azure round-trip in the write
-- path would couple every listing edit to an external service's uptime — spec).
-- They only flip embedding_stale = true, which the reconcile job later acts on.

-- A Listing's own content changed. BEFORE UPDATE so it rides the same row write,
-- and DISTINCT FROM guards against the reconcile job's own write (which sets the
-- embedding columns and would otherwise re-flip stale to true forever). Price and
-- badge are excluded: they don't appear in the composed document.
CREATE OR REPLACE FUNCTION mark_listing_self_stale() RETURNS trigger AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.category_id IS DISTINCT FROM OLD.category_id
     OR NEW.location_id IS DISTINCT FROM OLD.location_id THEN
    NEW.embedding_stale := true;
    -- A rename changes the owning Business's document too (it lists its
    -- Listings' names), so mark the Business stale as well.
    IF NEW.name IS DISTINCT FROM OLD.name THEN
      UPDATE businesses SET embedding_stale = true WHERE id = NEW.business_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER listings_self_stale
  BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION mark_listing_self_stale();

-- A Listing appearing or disappearing changes its Business's set of listing
-- names. (The new Listing itself already starts stale via the column default.)
CREATE OR REPLACE FUNCTION mark_business_stale_for_listing() RETURNS trigger AS $$
BEGIN
  UPDATE businesses SET embedding_stale = true
    WHERE id = COALESCE(NEW.business_id, OLD.business_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER listings_business_stale
  AFTER INSERT OR DELETE ON listings
  FOR EACH ROW EXECUTE FUNCTION mark_business_stale_for_listing();

-- A Business's own content changed (name/description/address are in its doc).
CREATE OR REPLACE FUNCTION mark_business_self_stale() RETURNS trigger AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.address IS DISTINCT FROM OLD.address THEN
    NEW.embedding_stale := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER businesses_self_stale
  BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION mark_business_self_stale();

-- A child table feeding a Listing's document changed. Every such table carries a
-- listing_id column, so one function serves them all. AFTER, and reads listing_id
-- from NEW (insert/update) or OLD (delete).
CREATE OR REPLACE FUNCTION mark_listing_stale_from_child() RETURNS trigger AS $$
BEGIN
  UPDATE listings SET embedding_stale = true
    WHERE id = COALESCE(NEW.listing_id, OLD.listing_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER listing_tags_stale AFTER INSERT OR UPDATE OR DELETE ON listing_tags
  FOR EACH ROW EXECUTE FUNCTION mark_listing_stale_from_child();
CREATE TRIGGER listing_amenities_stale AFTER INSERT OR UPDATE OR DELETE ON listing_amenities
  FOR EACH ROW EXECUTE FUNCTION mark_listing_stale_from_child();
CREATE TRIGGER hotel_details_stale AFTER INSERT OR UPDATE OR DELETE ON hotel_details
  FOR EACH ROW EXECUTE FUNCTION mark_listing_stale_from_child();
CREATE TRIGGER hotel_rooms_stale AFTER INSERT OR UPDATE OR DELETE ON hotel_rooms
  FOR EACH ROW EXECUTE FUNCTION mark_listing_stale_from_child();
CREATE TRIGGER restaurant_details_stale AFTER INSERT OR UPDATE OR DELETE ON restaurant_details
  FOR EACH ROW EXECUTE FUNCTION mark_listing_stale_from_child();
CREATE TRIGGER restaurant_menu_items_stale AFTER INSERT OR UPDATE OR DELETE ON restaurant_menu_items
  FOR EACH ROW EXECUTE FUNCTION mark_listing_stale_from_child();
CREATE TRIGGER activity_details_stale AFTER INSERT OR UPDATE OR DELETE ON activity_details
  FOR EACH ROW EXECUTE FUNCTION mark_listing_stale_from_child();
CREATE TRIGGER activity_itinerary_steps_stale AFTER INSERT OR UPDATE OR DELETE ON activity_itinerary_steps
  FOR EACH ROW EXECUTE FUNCTION mark_listing_stale_from_child();
CREATE TRIGGER activity_inclusions_stale AFTER INSERT OR UPDATE OR DELETE ON activity_inclusions
  FOR EACH ROW EXECUTE FUNCTION mark_listing_stale_from_child();
CREATE TRIGGER tour_details_stale AFTER INSERT OR UPDATE OR DELETE ON tour_details
  FOR EACH ROW EXECUTE FUNCTION mark_listing_stale_from_child();
CREATE TRIGGER tour_itinerary_steps_stale AFTER INSERT OR UPDATE OR DELETE ON tour_itinerary_steps
  FOR EACH ROW EXECUTE FUNCTION mark_listing_stale_from_child();
CREATE TRIGGER tour_inclusions_stale AFTER INSERT OR UPDATE OR DELETE ON tour_inclusions
  FOR EACH ROW EXECUTE FUNCTION mark_listing_stale_from_child();
CREATE TRIGGER tour_attractions_stale AFTER INSERT OR UPDATE OR DELETE ON tour_attractions
  FOR EACH ROW EXECUTE FUNCTION mark_listing_stale_from_child();


-- Down Migration

DROP TRIGGER IF EXISTS tour_attractions_stale ON tour_attractions;
DROP TRIGGER IF EXISTS tour_inclusions_stale ON tour_inclusions;
DROP TRIGGER IF EXISTS tour_itinerary_steps_stale ON tour_itinerary_steps;
DROP TRIGGER IF EXISTS tour_details_stale ON tour_details;
DROP TRIGGER IF EXISTS activity_inclusions_stale ON activity_inclusions;
DROP TRIGGER IF EXISTS activity_itinerary_steps_stale ON activity_itinerary_steps;
DROP TRIGGER IF EXISTS activity_details_stale ON activity_details;
DROP TRIGGER IF EXISTS restaurant_menu_items_stale ON restaurant_menu_items;
DROP TRIGGER IF EXISTS restaurant_details_stale ON restaurant_details;
DROP TRIGGER IF EXISTS hotel_rooms_stale ON hotel_rooms;
DROP TRIGGER IF EXISTS hotel_details_stale ON hotel_details;
DROP TRIGGER IF EXISTS listing_amenities_stale ON listing_amenities;
DROP TRIGGER IF EXISTS listing_tags_stale ON listing_tags;
DROP FUNCTION IF EXISTS mark_listing_stale_from_child();
DROP TRIGGER IF EXISTS businesses_self_stale ON businesses;
DROP FUNCTION IF EXISTS mark_business_self_stale();
DROP TRIGGER IF EXISTS listings_business_stale ON listings;
DROP FUNCTION IF EXISTS mark_business_stale_for_listing();
DROP TRIGGER IF EXISTS listings_self_stale ON listings;
DROP FUNCTION IF EXISTS mark_listing_self_stale();

DROP INDEX IF EXISTS businesses_name_trgm_idx;
DROP INDEX IF EXISTS listings_name_trgm_idx;
DROP INDEX IF EXISTS businesses_embedding_idx;
DROP INDEX IF EXISTS listings_embedding_idx;

ALTER TABLE businesses DROP COLUMN IF EXISTS embedding_stale, DROP COLUMN IF EXISTS embedding_text, DROP COLUMN IF EXISTS embedding;
ALTER TABLE listings DROP COLUMN IF EXISTS embedding_stale, DROP COLUMN IF EXISTS embedding_text, DROP COLUMN IF EXISTS embedding;

DROP EXTENSION IF EXISTS pg_trgm;
DROP EXTENSION IF EXISTS vector;
