-- Up Migration
--
-- Full-page Blog Post editor: on-page SEO fields the drawer never exposed
-- (focus keyword, canonical URL), plus a second, independent visibility gate
-- alongside `status` — a published post can still be marked private (like an
-- unlisted video): reachable by an admin, absent from public listing/detail.

ALTER TABLE blog_posts
  ADD COLUMN focus_keyword VARCHAR(100),
  ADD COLUMN canonical_url TEXT,
  ADD COLUMN visibility VARCHAR(20) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private'));

-- Down Migration

ALTER TABLE blog_posts
  DROP COLUMN IF EXISTS focus_keyword,
  DROP COLUMN IF EXISTS canonical_url,
  DROP COLUMN IF EXISTS visibility;
