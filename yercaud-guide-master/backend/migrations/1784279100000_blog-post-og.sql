-- Up Migration
--
-- FR189's Open Graph / Twitter Card fields on Blog Posts — Phase 10.
--
-- Phase 9 exposed these on Listings, where the columns already existed unused,
-- and deliberately stopped there: blog_posts never had them, and Phase 9 was
-- the zero-migration slice. Its spec left them outstanding, noting the
-- asymmetry it created — Listings share as a preview card, Blog Posts share as
-- a bare URL.
--
-- Which is backwards for how this platform is actually used: a Blog Post is the
-- thing most likely to be shared into WhatsApp.
ALTER TABLE blog_posts
  ADD COLUMN og_image TEXT,
  ADD COLUMN twitter_card VARCHAR(50);

-- Down Migration

ALTER TABLE blog_posts
  DROP COLUMN IF EXISTS twitter_card,
  DROP COLUMN IF EXISTS og_image;
