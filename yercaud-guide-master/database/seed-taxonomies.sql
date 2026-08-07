-- Master taxonomies — reference data every environment needs (Phase 10).
--
-- The build plan's Phase 2 said it plainly: "the categories and Yercaud
-- locations already present in frontend/src/lib/data.ts and Admin/src/mock/data.ts
-- — this becomes the real source of truth." A fresh database had roles and
-- permissions and nothing else, so a perfectly wired site rendered empty.
--
-- Fully idempotent — run after `npm run migrate:up`, on every deploy, via
-- `npm run seed:reference`.
--
-- This is production reference data, NOT demo content. Demo Businesses and
-- Listings are a dev-only script (scripts/seed-demo.ts) precisely so they can't
-- be mounted into a production init chain by accident.

-- ---------------------------------------------------------------------------
-- Categories (FR178)
--
-- All eight, with the icons and colours currently hardcoded in the frontend's
-- categoryColors map and directoryCategories list — categories.icon/color exist
-- for exactly this, so the map can be deleted rather than maintained.
--
-- has_detail_table follows ADR 0003 exactly: Hotel, Restaurant, Activity and
-- Tour & Travel have bespoke detail tables; Travel, Shopping, Health & Wellness
-- and Other Services use the base listings table alone. The public site routes
-- on this column — the four rich types get their bespoke pages, the rest get the
-- generic one.
--
-- Slugs are load-bearing beyond URLs: detail-category-guard.ts matches a
-- Listing's category slug against a literal ('hotel', 'restaurant', 'activity',
-- 'tour') to decide which detail table it may write. These four must not be
-- renamed casually.
-- ---------------------------------------------------------------------------
INSERT INTO categories (name, slug, icon, color, has_detail_table, sort_order) VALUES
  ('Hotels',            'hotel',           'Hotel',           '#1E7A46', true,  1),
  ('Restaurants',       'restaurant',      'UtensilsCrossed', '#F97316', true,  2),
  ('Activities',        'activity',        'Activity',        '#3B82F6', true,  3),
  ('Tours & Travels',   'tour',            'Briefcase',       '#14B8A6', true,  4),
  ('Travel',            'travel',          'Car',             '#8B5CF6', false, 5),
  ('Shopping',          'shopping',        'ShoppingBag',     '#EC4899', false, 6),
  ('Health & Wellness', 'health-wellness', 'Leaf',            '#10B981', false, 7),
  ('Other Services',    'other-services',  'Grid3x3',         '#6B7280', false, 8)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  has_detail_table = EXCLUDED.has_detail_table,
  sort_order = EXCLUDED.sort_order;

-- ---------------------------------------------------------------------------
-- Locations — flat areas/landmarks within Yercaud, not hierarchical (CONTEXT.md)
-- ---------------------------------------------------------------------------
INSERT INTO locations (name, slug) VALUES
  ('Near Lake',        'near-lake'),
  ('Anna Salai',       'anna-salai'),
  ('Kottachedu',       'kottachedu'),
  ('Shevaroy Hills',   'shevaroy-hills'),
  ('Botanical Garden', 'botanical-garden'),
  ('Yercaud Ghat',     'yercaud-ghat')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;

-- ---------------------------------------------------------------------------
-- Amenities/Facilities (FR28's Hotel filter, FR178)
-- ---------------------------------------------------------------------------
INSERT INTO amenities (name, icon) VALUES
  ('Free Wi-Fi',     'Wifi'),
  ('Parking',        'Car'),
  ('Restaurant',     'Utensils'),
  ('Room Service',   'Bell'),
  ('Swimming Pool',  'Waves'),
  ('Spa',            'Waves'),
  ('Gym',            'Dumbbell'),
  ('Bar',            'Wine'),
  ('Air Conditioning', 'Snowflake'),
  ('Pet Friendly',   'PawPrint')
ON CONFLICT (name) DO UPDATE SET icon = EXCLUDED.icon;

-- ---------------------------------------------------------------------------
-- Attribute tags — the chips a directory card renders (FR24)
-- ---------------------------------------------------------------------------
INSERT INTO attribute_tags (name) VALUES
  ('Free Wi-Fi'), ('Parking'), ('Restaurant'), ('Room Service'), ('Pool'), ('Spa'),
  ('Outdoor Seating'), ('Safety Gear'), ('Guide'), ('All Ages'),
  ('AC Vehicles'), ('Verified Drivers'), ('24/7 Service'), ('Sightseeing'),
  ('Custom Packages'), ('Family Friendly'), ('Pure Veg'), ('Multi Cuisine')
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Property types — Hotel-only (FR28)
-- ---------------------------------------------------------------------------
INSERT INTO property_types (name) VALUES
  ('Hotel'), ('Resort'), ('Homestay'), ('Villa'), ('Budget Stay')
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Languages — Tour & Travel guide languages (FR178)
-- ---------------------------------------------------------------------------
INSERT INTO languages (name) VALUES
  ('Tamil'), ('English'), ('Hindi'), ('Malayalam'), ('Kannada'), ('Telugu')
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Price bands (FR21's Price Range filter)
--
-- Amounts in rupees, matched as a range against a Listing's price_from — there
-- is no FK from listings to price_bands and none is wanted. The frontend derives
-- the 1–4 "₹₹₹" tier from this list's order, which is why the ranges tile
-- without gaps: a Listing must fall in exactly one band.
--
-- The open-ended top band has a NULL max_amount, which the filter treats as
-- unbounded.
-- ---------------------------------------------------------------------------
INSERT INTO price_bands (label, min_amount, max_amount) VALUES
  ('Budget',   0,    1500),
  ('Mid',      1501, 3000),
  ('Premium',  3001, 6000),
  ('Luxury',   6001, NULL)
ON CONFLICT (label) DO UPDATE SET
  min_amount = EXCLUDED.min_amount,
  max_amount = EXCLUDED.max_amount;

-- ---------------------------------------------------------------------------
-- Badges (FR30) — the four the mock renders, with the colours it renders them in
-- ---------------------------------------------------------------------------
INSERT INTO badges (label, color, sort_order) VALUES
  ('Popular',     '#F97316', 1),
  ('Luxury',      '#8B5CF6', 2),
  ('Best Seller', '#1E7A46', 3),
  ('Budget',      '#3B82F6', 4)
ON CONFLICT (label) DO UPDATE SET
  color = EXCLUDED.color,
  sort_order = EXCLUDED.sort_order;
