-- Up Migration
--
-- Anonymous-friendly page View tracking for Listing detail pages (issue #16,
-- part of the Featured Sections epic — see ADR-0013). Mirrors the shape of
-- contact_reveals: a business-analytics signal, not an audit_logs entry.
--
-- One row per (listing, visitor session, calendar day) — a visitor reloading
-- or revisiting the same Listing repeatedly in one day shouldn't inflate the
-- count, but a genuine return visit the next day does. session_id is the
-- opaque, server-minted visitor_id cookie value, not a user id: it identifies
-- the same visitor whether or not they're signed in, so dedup works
-- identically for anonymous and signed-in traffic. Write-only for now — no
-- reporting endpoint yet; that's future work (feeding Featured Score, #15).

CREATE TABLE listing_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  viewed_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (listing_id, session_id, viewed_on)
);
CREATE INDEX idx_listing_views_listing ON listing_views(listing_id);

-- Down Migration

DROP TABLE listing_views;
