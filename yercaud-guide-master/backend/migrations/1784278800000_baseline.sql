-- Up Migration
--
-- Baseline: the schema as it stood at the end of Phase 9, frozen verbatim from
-- the former database/schema.sql. From here on, migrations are the source of
-- truth for the schema (Phase 10) — the Postgres container no longer builds it
-- from a mounted .sql file, and test/global-setup.ts runs migrations too.
--
-- Deliberately irreversible: there is no Down Migration marker, because the
-- only honest "down" for a baseline is dropping the database.

-- Yercaud Business Directory — PostgreSQL schema
-- Raw SQL, no ORM (see docs/adr/0007-postgres-node-raw-sql-docker.md).
-- Terminology matches /CONTEXT.md. Design decisions are recorded in /docs/adr/.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===========================================================================
-- Users & RBAC (ADR: single users table, roles/permissions are data not code)
-- ===========================================================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  email_verified_at TIMESTAMPTZ,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(30),
  avatar_url TEXT,
  bio VARCHAR(500),
  date_of_birth DATE,
  gender VARCHAR(20),
  language VARCHAR(50),
  address TEXT,
  postal_code VARCHAR(20),
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_users_status ON users(status) WHERE status = 'active';
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Server-side session store (auth is httpOnly session cookies, not JWT —
-- revocation just deletes the row).
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  user_agent TEXT,
  ip_address INET,
  -- Set when this session was created via Super Admin impersonation ("view
  -- as", FR160) — the admin who started it. SET NULL, not RESTRICT/CASCADE:
  -- an impersonation session shouldn't become invalid just because the
  -- admin who started it is later deleted (ADR 0009's administrative bucket).
  impersonated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- One-time password-reset tokens (FR: password reset flow, Phase 1 spec).
CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_password_reset_tokens_user ON password_reset_tokens(user_id);

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module VARCHAR(100) NOT NULL,
  action VARCHAR(20) NOT NULL
    CHECK (action IN ('view', 'create', 'edit', 'delete', 'approve', 'publish')),
  UNIQUE (module, action)
);

CREATE TABLE role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);
CREATE INDEX idx_role_permissions_permission ON role_permissions(permission_id);

-- ===========================================================================
-- Businesses & staff (Business = owner entity; can hold Listings across
-- categories — see CONTEXT.md)
-- ===========================================================================

CREATE TABLE businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  contact_phone VARCHAR(30),
  contact_email VARCHAR(255),
  website VARCHAR(255),
  address TEXT,
  social_links JSONB NOT NULL DEFAULT '{}',
  logo_url TEXT,
  cover_url TEXT,
  -- 'archived' = owner/admin removed it from the public site; the row and
  -- its history (reviews, enquiries) are kept. Hard DELETE is reserved for
  -- rare, deliberate purges (ADR 0010).
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'suspended', 'archived')),
  -- Set on reject, cleared on a subsequent approve (re-application flow).
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_businesses_owner ON businesses(owner_id);
CREATE INDEX idx_businesses_status_pending ON businesses(created_at) WHERE status = 'pending';
CREATE TRIGGER trg_businesses_updated_at BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Business Owner-invited staff, scoped to one business only (FR163)
CREATE TABLE business_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  permissions JSONB NOT NULL DEFAULT '{}', -- module -> bool grants, scoped to this business
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, user_id)
);
CREATE INDEX idx_business_staff_user ON business_staff(user_id);

-- ===========================================================================
-- Taxonomies (Super Admin-managed master data — FR178)
-- ===========================================================================

-- Category is a lookup table (editable name/icon/color), but only categories
-- with has_detail_table = true have a matching *_details table (ADR 0003/0004).
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  icon VARCHAR(100),
  color VARCHAR(20),
  has_detail_table BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0
);

-- Flat lookup of areas/landmarks within Yercaud (not hierarchical — CONTEXT.md)
CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  slug VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE amenities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  icon VARCHAR(100)
);

CREATE TABLE attribute_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE
);

-- Hotel-only: Hotels, Resorts, Homestays, Villas, Budget Stays (FR28)
CREATE TABLE property_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE price_bands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label VARCHAR(100) NOT NULL UNIQUE,
  min_amount INT NOT NULL,
  max_amount INT
);

-- Partial dynamism (ADR 0004): Super Admin adds simple scalar fields to any
-- category, existing or new, without a deploy.
CREATE TABLE category_attributes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  field_type VARCHAR(20) NOT NULL
    CHECK (field_type IN ('text', 'number', 'boolean', 'select')),
  options JSONB, -- for field_type = 'select'
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE (category_id, name)
);

-- ===========================================================================
-- Listings (Listing = one publicly-visible item under a Business — CONTEXT.md)
-- ===========================================================================

CREATE TABLE listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  -- 'archived' = removed from the public site, row and history kept (ADR 0010)
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'suspended', 'archived')),
  -- Set on reject, cleared on a subsequent approve (mirrors businesses.rejection_reason).
  rejection_reason TEXT,

  -- SEO/meta (FR189) — 1:1 with the listing, plain columns not a side table
  seo_title VARCHAR(255),
  seo_description VARCHAR(500),
  og_image TEXT,
  twitter_card VARCHAR(50),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- No pending_changes/draft column: edits to a published listing apply
  -- immediately and are reviewed after the fact (ADR 0005). Only a listing's
  -- first publish is gated by `status`.
);
CREATE INDEX idx_listings_business ON listings(business_id);
CREATE INDEX idx_listings_category_status ON listings(category_id, status) WHERE status = 'approved';
CREATE INDEX idx_listings_location ON listings(location_id) WHERE status = 'approved';
CREATE INDEX idx_listings_status_pending ON listings(created_at) WHERE status = 'pending';
CREATE INDEX idx_listings_search ON listings USING gin(to_tsvector('english', name || ' ' || COALESCE(description, '')));
CREATE TRIGGER trg_listings_updated_at BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE listing_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  caption VARCHAR(255),
  sort_order INT NOT NULL DEFAULT 0
);
CREATE INDEX idx_listing_images_listing ON listing_images(listing_id);

CREATE TABLE listing_amenities (
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  amenity_id UUID NOT NULL REFERENCES amenities(id) ON DELETE CASCADE,
  PRIMARY KEY (listing_id, amenity_id)
);
CREATE INDEX idx_listing_amenities_amenity ON listing_amenities(amenity_id);

CREATE TABLE listing_tags (
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES attribute_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (listing_id, tag_id)
);
CREATE INDEX idx_listing_tags_tag ON listing_tags(tag_id);

CREATE TABLE listing_attribute_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  category_attribute_id UUID NOT NULL REFERENCES category_attributes(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  UNIQUE (listing_id, category_attribute_id)
);

-- value is TEXT regardless of field_type (ADR 0004 keeps this feature cheap),
-- so enforce shape at write time instead of relying on the app alone.
CREATE OR REPLACE FUNCTION validate_listing_attribute_value()
RETURNS TRIGGER AS $$
DECLARE
  attr_type VARCHAR(20);
  attr_options JSONB;
BEGIN
  SELECT field_type, options INTO attr_type, attr_options
  FROM category_attributes WHERE id = NEW.category_attribute_id;

  IF attr_type = 'number' AND NEW.value !~ '^-?[0-9]+(\.[0-9]+)?$' THEN
    RAISE EXCEPTION 'listing_attribute_values.value must be numeric for field_type=number, got %', NEW.value;
  ELSIF attr_type = 'boolean' AND NEW.value NOT IN ('true', 'false') THEN
    RAISE EXCEPTION 'listing_attribute_values.value must be true/false for field_type=boolean, got %', NEW.value;
  ELSIF attr_type = 'select' AND attr_options IS NOT NULL
        AND NOT (attr_options ? NEW.value) THEN
    RAISE EXCEPTION 'listing_attribute_values.value must be one of the defined options for field_type=select, got %', NEW.value;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_listing_attribute_value
  BEFORE INSERT OR UPDATE ON listing_attribute_values
  FOR EACH ROW EXECUTE FUNCTION validate_listing_attribute_value();

-- ===========================================================================
-- Hotel details (ADR 0003: class-table inheritance for rich categories)
-- Room Inventory / Rates / Availability are informational only — no
-- reservation is ever created from them (ADR 0001).
-- ===========================================================================

CREATE TABLE hotel_details (
  listing_id UUID PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
  property_type_id UUID REFERENCES property_types(id) ON DELETE SET NULL,
  star_rating SMALLINT CHECK (star_rating BETWEEN 1 AND 5),
  check_in_time VARCHAR(20),
  check_out_time VARCHAR(20),
  guests_capacity_note VARCHAR(100),
  cancellation_policy VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_hotel_details_updated_at BEFORE UPDATE ON hotel_details
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE hotel_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES hotel_details(listing_id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  rate_per_night INT NOT NULL,
  quantity_available INT NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_hotel_rooms_listing ON hotel_rooms(listing_id);

-- Blocked/open date ranges the owner maintains for display (not a calendar
-- of individual reservations — there are none).
CREATE TABLE hotel_availability_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES hotel_details(listing_id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  note VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date)
);
CREATE INDEX idx_hotel_availability_listing ON hotel_availability_blocks(listing_id);

-- ===========================================================================
-- Restaurant details
-- ===========================================================================

CREATE TABLE restaurant_details (
  listing_id UUID PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
  cuisine_type VARCHAR(255),
  avg_cost_for_two INT,
  best_for VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_restaurant_details_updated_at BEFORE UPDATE ON restaurant_details
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE restaurant_opening_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES restaurant_details(listing_id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0 = Sunday
  open_time TIME,
  close_time TIME,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (listing_id, day_of_week)
);

CREATE TABLE restaurant_menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES restaurant_details(listing_id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  price INT,
  image_url TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_restaurant_menu_items_listing ON restaurant_menu_items(listing_id);

-- ===========================================================================
-- Activity details
-- ===========================================================================

CREATE TABLE activity_details (
  listing_id UUID PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
  duration VARCHAR(100),
  max_height VARCHAR(100),
  total_distance VARCHAR(100),
  difficulty_level VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_activity_details_updated_at BEFORE UPDATE ON activity_details
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE activity_itinerary_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES activity_details(listing_id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  duration VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_activity_itinerary_listing ON activity_itinerary_steps(listing_id);

CREATE TABLE activity_inclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES activity_details(listing_id) ON DELETE CASCADE,
  item VARCHAR(255) NOT NULL,
  is_included BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_activity_inclusions_listing ON activity_inclusions(listing_id);

-- ===========================================================================
-- Tour & Travel details
-- ===========================================================================

CREATE TABLE tour_details (
  listing_id UUID PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
  tour_type VARCHAR(100),
  best_for VARCHAR(255),
  duration VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_tour_details_updated_at BEFORE UPDATE ON tour_details
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE tour_itinerary_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES tour_details(listing_id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  stop_name VARCHAR(255) NOT NULL,
  description TEXT,
  duration VARCHAR(100),
  step_type VARCHAR(20) NOT NULL DEFAULT 'stop'
    CHECK (step_type IN ('pickup', 'stop', 'dropoff')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tour_itinerary_listing ON tour_itinerary_steps(listing_id);

CREATE TABLE tour_inclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES tour_details(listing_id) ON DELETE CASCADE,
  item VARCHAR(255) NOT NULL,
  is_included BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tour_inclusions_listing ON tour_inclusions(listing_id);

CREATE TABLE tour_attractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES tour_details(listing_id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tour_attractions_listing ON tour_attractions(listing_id);

-- Spoken languages (1NF fix — was a comma-separated VARCHAR on hotel_details
-- / tour_details). Shared lookup, many-to-many per listing type.
CREATE TABLE languages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE hotel_languages (
  listing_id UUID NOT NULL REFERENCES hotel_details(listing_id) ON DELETE CASCADE,
  language_id UUID NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
  PRIMARY KEY (listing_id, language_id)
);
CREATE INDEX idx_hotel_languages_language ON hotel_languages(language_id);

CREATE TABLE tour_languages (
  listing_id UUID NOT NULL REFERENCES tour_details(listing_id) ON DELETE CASCADE,
  language_id UUID NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
  PRIMARY KEY (listing_id, language_id)
);
CREATE INDEX idx_tour_languages_language ON tour_languages(language_id);

-- ===========================================================================
-- Reviews, Favorites, Enquiries, Reports
-- ===========================================================================

-- Pre-approved, unlike listing edits (ADR 0006). One per user per listing.
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  owner_reply TEXT,
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (listing_id, user_id)
);
CREATE INDEX idx_reviews_listing_approved ON reviews(listing_id) WHERE status = 'approved';
CREATE INDEX idx_reviews_status_pending ON reviews(created_at) WHERE status = 'pending';
CREATE INDEX idx_reviews_user ON reviews(user_id);

CREATE TABLE favorites (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, listing_id)
);
CREATE INDEX idx_favorites_user_created ON favorites(user_id, created_at DESC);

-- Sole conversion mechanism on the platform (ADR 0001). user_id is nullable —
-- a visitor doesn't have to be signed in to send one, only to see it under
-- "My Enquiries" later.
CREATE TABLE enquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(30),
  message TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'responded', 'closed')),
  owner_response TEXT,
  responded_at TIMESTAMPTZ,
  -- Fast2SMS delivery to the Business Owner, wired up later (ADR 0008)
  sms_status VARCHAR(20) NOT NULL DEFAULT 'not_sent'
    CHECK (sms_status IN ('not_sent', 'pending', 'sent', 'failed')),
  sms_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_enquiries_listing ON enquiries(listing_id, created_at DESC);
CREATE INDEX idx_enquiries_user ON enquiries(user_id, created_at DESC) WHERE user_id IS NOT NULL;

-- Polymorphic, discriminated-union style (no FK on target_id — see
-- schema-patterns.md "Polymorphic Associations, Approach 2")
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('review', 'blog_comment')),
  target_id UUID NOT NULL,
  reason VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'resolved', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_reports_target ON reports(target_type, target_id);

-- ===========================================================================
-- Marketing
-- ===========================================================================

CREATE TABLE promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  discount_percent SMALLINT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending', 'active', 'expired')),
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date)
);
CREATE INDEX idx_promotions_listing ON promotions(listing_id);

CREATE TABLE featured_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE,
  sort_order INT NOT NULL DEFAULT 0
);
CREATE INDEX idx_featured_listings_listing ON featured_listings(listing_id);

CREATE TABLE banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  image_url TEXT NOT NULL,
  link_url TEXT,
  placement VARCHAR(100) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'expired')),
  start_date DATE,
  end_date DATE
);

-- ===========================================================================
-- Blog / Content Management
-- ===========================================================================

CREATE TABLE blog_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  category_id UUID NOT NULL REFERENCES blog_categories(id) ON DELETE RESTRICT,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  excerpt VARCHAR(500),
  body TEXT NOT NULL,
  cover_image TEXT,
  reading_time_minutes SMALLINT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending', 'published')),
  published_at TIMESTAMPTZ,
  seo_title VARCHAR(255),
  seo_description VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_blog_posts_published ON blog_posts(published_at DESC) WHERE status = 'published';
CREATE INDEX idx_blog_posts_category ON blog_posts(category_id) WHERE status = 'published';
CREATE INDEX idx_blog_posts_author ON blog_posts(author_id);
CREATE TRIGGER trg_blog_posts_updated_at BEFORE UPDATE ON blog_posts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE blog_post_related (
  from_post_id UUID NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  to_post_id UUID NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  PRIMARY KEY (from_post_id, to_post_id)
);

-- "Popular Places Mentioned" (FR114)
CREATE TABLE blog_post_places (
  blog_post_id UUID NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  PRIMARY KEY (blog_post_id, listing_id)
);

-- Flat (non-threaded), pre-approved — same moderation shape as Review
CREATE TABLE blog_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  like_count INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_blog_comments_post_approved ON blog_comments(post_id) WHERE status = 'approved';

CREATE TABLE article_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, user_id)
);

-- ===========================================================================
-- FAQ
-- ===========================================================================

CREATE TABLE faq_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES faq_categories(id) ON DELETE CASCADE,
  question VARCHAR(500) NOT NULL,
  answer TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);
CREATE INDEX idx_faqs_category ON faqs(category_id);

-- ===========================================================================
-- Static content, newsletter, audit log
-- ===========================================================================

-- Freeform editorial copy for Home/About/Contact sections — JSONB, not
-- queried/joined, edited rarely by a Super Admin.
CREATE TABLE content_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_slug VARCHAR(100) NOT NULL,
  block_key VARCHAR(100) NOT NULL,
  content JSONB NOT NULL DEFAULT '{}',
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (page_slug, block_key)
);
CREATE TRIGGER trg_content_blocks_updated_at BEFORE UPDATE ON content_blocks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  source VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'unsubscribed')),
  subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Every privileged admin action (FR162) — standard audit trail pattern
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  table_name VARCHAR(100) NOT NULL,
  record_id UUID NOT NULL,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_logs_target ON audit_logs(table_name, record_id);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id, created_at DESC);

-- ===========================================================================
-- Static reference data: the full module x action permission matrix.
-- Never truncated/reseeded by application behavior or test resets — see
-- seed-roles.sql for the two system roles, which tests DO reset per-run.
-- ===========================================================================

INSERT INTO permissions (module, action)
SELECT m.module, a.action
FROM unnest(ARRAY['Businesses', 'Listings', 'Categories', 'Enquiries', 'Reviews', 'Users', 'Admins', 'Marketing', 'Content', 'Settings']) AS m(module)
CROSS JOIN unnest(ARRAY['view', 'create', 'edit', 'delete', 'approve', 'publish']) AS a(action);
