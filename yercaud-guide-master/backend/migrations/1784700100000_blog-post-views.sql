-- Up Migration
--
-- Anonymous-friendly page View tracking for Blog Post detail pages (issue
-- #18, part of the Featured Sections epic — see ADR-0013). Same shape as
-- listing_views: a dedicated table per subject rather than one polymorphic
-- table, matching this codebase's existing class-table-inheritance
-- convention (ADR-0003) over a polymorphic-association pattern.
--
-- One row per (blog post, visitor session, calendar day) — session_id is the
-- shared visitor_id cookie value from lib/visitor-id.ts, the same dedup key
-- used for Listing views, whether or not the visitor is signed in. Unlike
-- listing_views there's no owner-skip check: blog_posts has no Business
-- ownership to exclude (author_id references users, not a business).

CREATE TABLE blog_post_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  viewed_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, session_id, viewed_on)
);
CREATE INDEX idx_blog_post_views_post ON blog_post_views(post_id);

-- Down Migration

DROP TABLE blog_post_views;
