-- Up Migration
--
-- Freeform WordPress-style tags for Blog Posts. A join table + lookup table,
-- not a native array column — matching this codebase's one established
-- convention for multi-valued fields (listing_tags/attribute_tags, joined
-- via ARRAY_AGG in listings/service.ts), not a TEXT[] column, which has no
-- precedent anywhere in this schema. Same two-table shape as
-- blog_categories + blog_post_related, just unordered (no PK ordering
-- semantics needed for tags the way relatedPostIds/placeListingIds care
-- about link direction).

CREATE TABLE blog_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(60) NOT NULL UNIQUE,
  slug VARCHAR(60) NOT NULL UNIQUE
);

CREATE TABLE blog_post_tags (
  post_id UUID NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES blog_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);
CREATE INDEX idx_blog_post_tags_tag ON blog_post_tags(tag_id);

-- Down Migration

DROP TABLE blog_post_tags;
DROP TABLE blog_tags;
