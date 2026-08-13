import type pg from "pg";
import { BadRequestError, ConflictError, NotFoundError } from "../../errors.js";
import { requireRow } from "../../db-errors.js";
import { createSlugger } from "../../slug.js";
import { LISTING_TSVECTOR, WORD_SIMILARITY_THRESHOLD } from "../search/lexical.js";

export type ListingStatus = "pending" | "approved" | "rejected" | "suspended" | "archived";

/**
 * How a Listing's price is quoted. Stored alongside the number rather than
 * baked into a formatted label: the mock's "₹3,500/night" mixes the two into
 * one presentational string, which can't be filtered on. Clients format.
 *
 * 'from' is the generic unit for the four categories ADR 0003 gives no detail
 * table, which have no per-night/per-person semantics of their own.
 */
export const PRICE_UNITS = ["per_night", "for_two", "per_person", "from"] as const;

export type PriceUnit = (typeof PRICE_UNITS)[number];

export interface ListingSummary {
  id: string;
  businessId: string;
  categoryId: string;
  locationId: string | null;
  name: string;
  slug: string;
  status: ListingStatus;
  primaryImageUrl: string | null;
  averageRating: number | null;
  /**
   * The Listing's headline price — derived from the owning detail table for the
   * four categories that have one, written directly for the four that don't
   * (ADR 0003). Null is a real answer: a Listing need not have a price.
   */
  priceFrom: number | null;
  priceUnit: PriceUnit | null;
  /**
   * FR30's promotional badge. Label and colour travel with the Listing because
   * every card renders it and the colour must not be a hardcoded client map.
   * Assigned by Super Admin only — see PUT /listings/{id}/badge.
   */
  badge: ListingBadge | null;
  /**
   * Display-ready fields, embedded rather than left as UUIDs for the client to
   * resolve. This denormalizes display concerns into the API and couples the
   * card to the endpoint — the right trade for a read-heavy public directory,
   * because it is what makes a grid one request instead of one-plus-N, and it
   * is the SSR path a crawler sees. Admin ignores them.
   */
  categoryName: string;
  categorySlug: string;
  locationName: string | null;
  /** Approved Reviews only — the count beside a rating must match the Reviews a visitor can read (ADR 0006). */
  reviewCount: number;
  tags: string[];
  /** The owning Business's, not the Listing's: contacting a Business is the point of the directory. */
  phone: string | null;
  website: string | null;
}

export interface ListingBadge {
  id: string;
  label: string;
  color: string | null;
}

/**
 * The card types any platform actually honours. Validated at the route, not the
 * database: the `twitter_card` column carries no CHECK constraint. Rejecting an
 * unknown type on write beats discovering at share time that the meta tag was
 * silently ignored. The union derives from this list, so a fifth type is a
 * one-line edit.
 */
export const TWITTER_CARD_TYPES = ["summary", "summary_large_image", "app", "player"] as const;

export type TwitterCardType = (typeof TWITTER_CARD_TYPES)[number];

export interface Listing extends ListingSummary {
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  // FR189. Deliberately absent from ListingSummary: a directory card never
  // renders a share preview, and the search query would pay for the columns.
  ogImage: string | null;
  twitterCard: TwitterCardType | null;
  rejectionReason: string | null;
  /**
   * When the Listing first went live. Null means it never has — which is what
   * lets the slug still track the name (ADR 0005 gates only the first publish).
   */
  firstPublishedAt: string | null;
  images: { id: string; url: string; caption: string | null; sortOrder: number }[];
  amenityIds: string[];
  tagIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface ListingRow {
  id: string;
  business_id: string;
  category_id: string;
  location_id: string | null;
  name: string;
  slug: string;
  status: ListingStatus;
  description: string | null;
  seo_title: string | null;
  seo_description: string | null;
  og_image: string | null;
  twitter_card: TwitterCardType | null;
  rejection_reason: string | null;
  first_published_at: string | null;
  average_rating: string | null; // numeric comes back as string from pg
  price_from: number | null;
  price_unit: PriceUnit | null;
  badge_id: string | null;
  badge_label: string | null;
  badge_color: string | null;
  category_name: string;
  category_slug: string;
  location_name: string | null;
  review_count: string; // COUNT() comes back as string from pg
  tags: string[] | null;
  phone: string | null;
  website: string | null;
  primary_image_url: string | null;
  created_at: string;
  updated_at: string;
}

// Aliased `bg`, not `b`: the search query below already binds `b` to businesses.
const BADGE_COLUMNS = `
  bg.id AS badge_id, bg.label AS badge_label, bg.color AS badge_color
`;

const AGGREGATE_COLUMNS = `
  (SELECT AVG(r.rating) FROM reviews r WHERE r.listing_id = l.id AND r.status = 'approved') AS average_rating,
  (SELECT COUNT(*) FROM reviews r WHERE r.listing_id = l.id AND r.status = 'approved') AS review_count,
  (SELECT li.url FROM listing_images li WHERE li.listing_id = l.id ORDER BY li.sort_order LIMIT 1) AS primary_image_url,
  (SELECT COALESCE(ARRAY_AGG(at.name ORDER BY at.name), '{}')
     FROM listing_tags lt JOIN attribute_tags at ON at.id = lt.tag_id
    WHERE lt.listing_id = l.id) AS tags
`;

/**
 * Category and Location names, and the owning Business's contact details.
 *
 * businesses is an INNER join because a Listing can't exist without one — and
 * the search query already makes it for owner-scoping, so this costs columns,
 * not a join. locations is LEFT: locationId is nullable.
 */
const DISPLAY_COLUMNS = `
  c.name AS category_name, c.slug AS category_slug,
  loc.name AS location_name,
  biz.contact_phone AS phone, biz.website AS website
`;

const DISPLAY_JOINS = `
  JOIN categories c ON c.id = l.category_id
  LEFT JOIN locations loc ON loc.id = l.location_id
  JOIN businesses biz ON biz.id = l.business_id
`;

const SUMMARY_COLUMNS = `
  l.id, l.business_id, l.category_id, l.location_id, l.name, l.slug, l.status,
  l.price_from, l.price_unit,
  ${BADGE_COLUMNS},
  ${DISPLAY_COLUMNS},
  ${AGGREGATE_COLUMNS}
`;

const FULL_COLUMNS = `
  l.id, l.business_id, l.category_id, l.location_id, l.name, l.slug, l.status,
  l.description, l.seo_title, l.seo_description, l.og_image, l.twitter_card,
  l.rejection_reason, l.price_from, l.price_unit, l.first_published_at, l.created_at, l.updated_at,
  ${BADGE_COLUMNS},
  ${DISPLAY_COLUMNS},
  ${AGGREGATE_COLUMNS}
`;

/** LEFT JOIN: a Listing usually has no badge, and must not vanish for lack of one. */
const BADGE_JOIN = `LEFT JOIN badges bg ON bg.id = l.badge_id`;

function toBadge(row: ListingRow): ListingBadge | null {
  return row.badge_id === null ? null : { id: row.badge_id, label: row.badge_label!, color: row.badge_color };
}

function toSummary(row: ListingRow): ListingSummary {
  return {
    id: row.id,
    businessId: row.business_id,
    categoryId: row.category_id,
    locationId: row.location_id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    primaryImageUrl: row.primary_image_url,
    averageRating: row.average_rating === null ? null : Number(row.average_rating),
    priceFrom: row.price_from,
    priceUnit: row.price_unit,
    badge: toBadge(row),
    categoryName: row.category_name,
    categorySlug: row.category_slug,
    locationName: row.location_name,
    reviewCount: Number(row.review_count),
    tags: row.tags ?? [],
    phone: row.phone,
    website: row.website,
  };
}

async function loadImages(db: pg.Pool, listingId: string): Promise<Listing["images"]> {
  const { rows } = await db.query<{ id: string; url: string; caption: string | null; sort_order: number }>(
    `SELECT id, url, caption, sort_order FROM listing_images WHERE listing_id = $1 ORDER BY sort_order`,
    [listingId],
  );
  return rows.map((r) => ({ id: r.id, url: r.url, caption: r.caption, sortOrder: r.sort_order }));
}

// `table`/`column` are always fixed literals supplied by the calling code
// below (never derived from request input), so string-interpolating them is
// safe — same reasoning as child-collection.ts/join-set.ts/named-lookup.ts.
async function loadIds(db: pg.Pool, table: string, column: string, listingId: string): Promise<string[]> {
  const { rows } = await db.query<Record<string, string>>(
    `SELECT ${column} FROM ${table} WHERE listing_id = $1`,
    [listingId],
  );
  return rows.map((r) => r[column]);
}

async function toListing(db: pg.Pool, row: ListingRow): Promise<Listing> {
  const [images, amenityIds, tagIds] = await Promise.all([
    loadImages(db, row.id),
    loadIds(db, "listing_amenities", "amenity_id", row.id),
    loadIds(db, "listing_tags", "tag_id", row.id),
  ]);
  return {
    id: row.id,
    businessId: row.business_id,
    categoryId: row.category_id,
    locationId: row.location_id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    description: row.description,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    ogImage: row.og_image,
    twitterCard: row.twitter_card,
    rejectionReason: row.rejection_reason,
    firstPublishedAt: row.first_published_at,
    primaryImageUrl: row.primary_image_url,
    averageRating: row.average_rating === null ? null : Number(row.average_rating),
    priceFrom: row.price_from,
    priceUnit: row.price_unit,
    badge: toBadge(row),
    categoryName: row.category_name,
    categorySlug: row.category_slug,
    locationName: row.location_name,
    reviewCount: Number(row.review_count),
    tags: row.tags ?? [],
    phone: row.phone,
    website: row.website,
    images,
    amenityIds,
    tagIds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const uniqueSlug = createSlugger({ table: "listings", fallback: "listing" });

export interface ListingInput {
  businessId: string;
  categoryId: string;
  locationId?: string;
  name: string;
  description?: string;
  seoTitle?: string;
  seoDescription?: string;
  ogImage?: string;
  twitterCard?: TwitterCardType;
  /**
   * Accepted only for the four categories ADR 0003 gives no detail table.
   * For the rest the price is derived and a direct write is refused — see
   * assertPriceIsWritable.
   */
  priceFrom?: number | null;
  priceUnit?: PriceUnit | null;
}

/** True when the category owns a detail table, and therefore derives its price. */
async function categoryDerivesPrice(db: pg.Pool, categoryId: string): Promise<boolean> {
  const { rows } = await db.query<{ has_detail_table: boolean }>(
    `SELECT has_detail_table FROM categories WHERE id = $1`,
    [categoryId],
  );
  return rows[0]?.has_detail_table ?? false;
}

/**
 * A Listing in a category with a detail table takes its price from that table
 * (cheapest room, cost for two, per-person rate) — never from the Listing input.
 *
 * Refusing the write rather than ignoring it is the point: a silently-dropped
 * price would leave an owner believing they'd set something that the next room
 * edit was always going to overwrite anyway.
 */
async function assertPriceIsWritable(db: pg.Pool, input: ListingInput): Promise<void> {
  if (input.priceFrom === undefined && input.priceUnit === undefined) return;
  if (await categoryDerivesPrice(db, input.categoryId)) {
    throw new BadRequestError(
      "This Listing's category derives its price from its details — set it there, not on the Listing",
    );
  }
}

export async function createListing(db: pg.Pool, input: ListingInput): Promise<Listing> {
  await assertPriceIsWritable(db, input);
  const slug = await uniqueSlug(db, input.name);
  const { rows } = await db.query<ListingRow>(
    `WITH inserted AS (
       INSERT INTO listings (business_id, category_id, location_id, name, slug, description,
                             seo_title, seo_description, og_image, twitter_card,
                             price_from, price_unit)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *
     )
     SELECT ${FULL_COLUMNS} FROM inserted l ${BADGE_JOIN} ${DISPLAY_JOINS}`,
    [
      input.businessId,
      input.categoryId,
      input.locationId ?? null,
      input.name,
      slug,
      input.description ?? null,
      input.seoTitle ?? null,
      input.seoDescription ?? null,
      input.ogImage ?? null,
      input.twitterCard ?? null,
      input.priceFrom ?? null,
      input.priceUnit ?? null,
    ],
  );
  return toListing(db, rows[0]);
}

/**
 * A Listing's slug tracks its name until the Listing first goes live, then
 * freezes forever.
 *
 * Before first publish there's no public URL to break, so an owner can fix a
 * typo. After it, ADR 0005 applies edits immediately with no staging — so
 * regenerating the slug on a rename would silently rewrite a live URL and break
 * every link to it. The alternative, a slug-history table and 301s, is real work
 * for a directory whose Listings rarely rename; an owner who needs a new URL
 * needs a new Listing.
 */
async function nextSlug(db: pg.Pool, id: string, name: string): Promise<string | null> {
  const { rows } = await db.query<{ slug: string; first_published_at: string | null }>(
    `SELECT slug, first_published_at FROM listings WHERE id = $1`,
    [id],
  );
  const current = requireRow(rows, "Listing not found");
  if (current.first_published_at !== null) return null;
  // excludeId, so renaming to the same name doesn't collide with itself and
  // walk the slug to "-2".
  return uniqueSlug(db, name, id);
}

export async function updateListing(db: pg.Pool, id: string, input: ListingInput): Promise<Listing> {
  await assertPriceIsWritable(db, input);
  const slug = await nextSlug(db, id, input.name);
  // price_from/price_unit are left alone for a derived-price category: the
  // columns are maintained by recompute_listing_price, and this statement must
  // not clobber them back to null on an unrelated edit.
  const derives = await categoryDerivesPrice(db, input.categoryId);
  const { rows } = await db.query<ListingRow>(
    `WITH updated AS (
       UPDATE listings SET
         business_id = $1, category_id = $2, location_id = $3, name = $4,
         description = $5, seo_title = $6, seo_description = $7,
         og_image = $8, twitter_card = $9,
         price_from = CASE WHEN $10 THEN price_from ELSE $11 END,
         price_unit = CASE WHEN $10 THEN price_unit ELSE $12 END,
         slug = COALESCE($14, slug)
       WHERE id = $13
       RETURNING *
     )
     SELECT ${FULL_COLUMNS} FROM updated l ${BADGE_JOIN} ${DISPLAY_JOINS}`,
    [
      input.businessId,
      input.categoryId,
      input.locationId ?? null,
      input.name,
      input.description ?? null,
      input.seoTitle ?? null,
      input.seoDescription ?? null,
      input.ogImage ?? null,
      input.twitterCard ?? null,
      derives,
      input.priceFrom ?? null,
      input.priceUnit ?? null,
      id,
      slug,
    ],
  );
  return toListing(db, requireRow(rows, "Listing not found"));
}

/**
 * Sets or clears a Listing's promotional badge (FR30).
 *
 * Deliberately not part of ListingInput. Badging is a marketing act guarded by
 * Marketing:edit, which a Business Owner does not hold — and a field inside the
 * owner-writable input that owners may not write would have to be either
 * silently ignored or specially rejected. Both are worse than an endpoint whose
 * permission states the rule.
 */
export async function setListingBadge(db: pg.Pool, id: string, badgeId: string | null): Promise<Listing> {
  if (badgeId !== null) {
    const { rows } = await db.query(`SELECT 1 FROM badges WHERE id = $1`, [badgeId]);
    if (rows.length === 0) throw new BadRequestError("Badge not found");
  }
  const { rowCount } = await db.query(`UPDATE listings SET badge_id = $1 WHERE id = $2`, [badgeId, id]);
  if (rowCount === 0) throw new NotFoundError("Listing not found");
  return getListing(db, id);
}

/** The public site addresses Listings by slug; Admin keeps using the id. */
export async function getListingBySlug(db: pg.Pool, slug: string): Promise<Listing> {
  const { rows } = await db.query<ListingRow>(
    `SELECT ${FULL_COLUMNS} FROM listings l ${BADGE_JOIN} ${DISPLAY_JOINS} WHERE l.slug = $1`,
    [slug],
  );
  return toListing(db, requireRow(rows, "Listing not found"));
}

export async function getListing(db: pg.Pool, id: string): Promise<Listing> {
  const { rows } = await db.query<ListingRow>(
    `SELECT ${FULL_COLUMNS} FROM listings l ${BADGE_JOIN} ${DISPLAY_JOINS} WHERE l.id = $1`,
    [id],
  );
  return toListing(db, requireRow(rows, "Listing not found"));
}

/**
 * "Similar Listings" (CONTEXT.md): the nearest other approved Listings in the
 * same Category, by embedding distance — content-based, not the
 * view-co-occurrence approach `listing_views` would also support (ADR-0014).
 */
export async function getSimilarListings(db: pg.Pool, id: string, limit = 4): Promise<ListingSummary[]> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT l2.id
       FROM listings l1
       JOIN listings l2 ON l2.category_id = l1.category_id AND l2.id != l1.id
      WHERE l1.id = $1
        AND l1.embedding IS NOT NULL
        AND l2.status = 'approved'
        AND l2.embedding IS NOT NULL
      ORDER BY l2.embedding <=> l1.embedding
      LIMIT $2`,
    [id, limit],
  );
  return summariesByIds(db, rows.map((r) => r.id));
}

/**
 * Used by Favorites/Reviews/Enquiries submission (Phase 5) — a visitor has
 * no legitimate reason to interact with a Listing that isn't yet publicly
 * visible. Unlike the owner-aware visibility check on GET /listings/{id},
 * this is a plain status check with no ownership branch.
 */
export async function requireApprovedListing(db: pg.Pool, id: string): Promise<Listing> {
  const listing = await getListing(db, id);
  if (listing.status !== "approved") {
    throw new NotFoundError("Listing not found");
  }
  return listing;
}

/** Favorites (Phase 5) — preserves "most recently favorited first" order, not Listing creation order. */
export async function listFavoriteListingSummaries(db: pg.Pool, userId: string): Promise<ListingSummary[]> {
  const { rows } = await db.query<ListingRow>(
    `SELECT ${SUMMARY_COLUMNS} FROM favorites f JOIN listings l ON l.id = f.listing_id ${BADGE_JOIN} ${DISPLAY_JOINS}
     WHERE f.user_id = $1 ORDER BY f.created_at DESC`,
    [userId],
  );
  return rows.map(toSummary);
}

/** For My Statistics (issue #13) — a plain visitor with no Business owns 0, same as a Business Owner with none yet. */
export async function countOwnedListings(db: pg.Pool, ownerId: string): Promise<number> {
  const { rows } = await db.query<{ count: string }>(
    `SELECT COUNT(*) FROM listings l JOIN businesses b ON b.id = l.business_id WHERE b.owner_id = $1`,
    [ownerId],
  );
  return Number(rows[0].count);
}

/** Used by requireOwnerOrPermission — returns null (never throws) when the Listing doesn't exist. */
export async function loadListingOwnerId(db: pg.Pool, id: string): Promise<string | null> {
  const { rows } = await db.query<{ owner_id: string }>(
    `SELECT b.owner_id FROM listings l JOIN businesses b ON b.id = l.business_id WHERE l.id = $1`,
    [id],
  );
  return rows[0]?.owner_id ?? null;
}

/**
 * `rejectionReason` is tri-state, same shape as businesses.service.transitionStatus:
 * omit to leave the column untouched, pass a string to set it, `null` to clear it.
 */
async function transitionStatus(
  db: pg.Pool,
  id: string,
  allowedFrom: ListingStatus[],
  to: ListingStatus,
  rejectionReason?: string | null,
): Promise<Listing> {
  const current = await db.query<{ status: ListingStatus }>(`SELECT status FROM listings WHERE id = $1`, [id]);
  const row = current.rows[0];
  if (!row) {
    throw new NotFoundError("Listing not found");
  }
  if (!allowedFrom.includes(row.status)) {
    throw new ConflictError(`Cannot move a "${row.status}" listing to "${to}"`);
  }

  const touchRejectionReason = rejectionReason !== undefined;
  await db.query(
    `UPDATE listings SET status = $1,
       rejection_reason = CASE WHEN $2 THEN $3 ELSE rejection_reason END
     WHERE id = $4`,
    [to, touchRejectionReason, rejectionReason ?? null, id],
  );
  return getListing(db, id);
}

export async function approveListing(db: pg.Pool, id: string): Promise<Listing> {
  const listing = await transitionStatus(db, id, ["pending", "rejected"], "approved", null);
  // COALESCE, not assignment: this is the *first* publish, and a Listing that
  // was archived and re-approved has already had one — the slug froze then.
  await db.query(`UPDATE listings SET first_published_at = COALESCE(first_published_at, NOW()) WHERE id = $1`, [id]);
  return getListing(db, listing.id);
}

export async function rejectListing(db: pg.Pool, id: string, reason: string): Promise<Listing> {
  return transitionStatus(db, id, ["pending"], "rejected", reason);
}

export async function archiveListing(db: pg.Pool, id: string): Promise<Listing> {
  return transitionStatus(db, id, ["pending", "approved", "rejected", "suspended"], "archived");
}

export interface SearchListingsOptions {
  q?: string;
  category?: string;
  location?: string;
  businessId?: string;
  minRating?: number;
  priceBand?: string;
  minPrice?: number;
  maxPrice?: number;
  /** AND semantics: a Listing must carry every named amenity to match. */
  amenities?: string[];
  /** hotel_details.star_rating — only Hotel Listings have a row to match against. */
  minStarRating?: number;
  /** Matched by property_types.name, same reasoning as priceBand: no slug column. */
  propertyType?: string;
  status?: string;
  page: number;
  pageSize: number;
  callerId?: string;
  /** Holds Listings:view — sees every status across every Business. */
  includeAll: boolean;
}

export async function searchListings(
  db: pg.Pool,
  options: SearchListingsOptions,
): Promise<{ items: ListingSummary[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.category) {
    const { rows } = await db.query<{ id: string }>(`SELECT id FROM categories WHERE slug = $1`, [options.category]);
    if (!rows[0]) return { items: [], total: 0 };
    params.push(rows[0].id);
    conditions.push(`l.category_id = $${params.length}`);
  }

  if (options.location) {
    const { rows } = await db.query<{ id: string }>(`SELECT id FROM locations WHERE slug = $1`, [options.location]);
    if (!rows[0]) return { items: [], total: 0 };
    params.push(rows[0].id);
    conditions.push(`l.location_id = $${params.length}`);
  }

  if (options.businessId) {
    params.push(options.businessId);
    conditions.push(`l.business_id = $${params.length}`);
  }

  // Phase 4 accepted this parameter, validated the band existed, and then never
  // used it — so the filter silently returned everything. price_bands carries
  // min_amount/max_amount, so a band is a range comparison against the Listing's
  // cached price_from; no FK from listings to price_bands is needed or wanted.
  // (Matched by label: price_bands has no slug column.)
  if (options.priceBand) {
    const { rows } = await db.query<{ min_amount: number; max_amount: number | null }>(
      `SELECT min_amount, max_amount FROM price_bands WHERE label = $1`,
      [options.priceBand],
    );
    const band = rows[0];
    if (!band) return { items: [], total: 0 };
    params.push(band.min_amount);
    conditions.push(`l.price_from >= $${params.length}`);
    if (band.max_amount !== null) {
      params.push(band.max_amount);
      conditions.push(`l.price_from <= $${params.length}`);
    }
  }

  // FR21's Price Range filter and FR28's price-per-night slider are ranges, not
  // bands. A Listing with no price is excluded from either: it can't honestly
  // satisfy "under ₹2,000". It stays visible in an unfiltered directory, which
  // is what `price_from IS NOT NULL` being scoped to these branches preserves.
  if (options.minPrice !== undefined) {
    params.push(options.minPrice);
    conditions.push(`l.price_from >= $${params.length}`);
  }
  if (options.maxPrice !== undefined) {
    params.push(options.maxPrice);
    conditions.push(`l.price_from <= $${params.length}`);
  }

  // The lexical upgrade (issue #11): weighted full-text over name/category/
  // location/tags/description/amenities via websearch_to_tsquery, plus a
  // trigram fallback (`l.name % q`) so a typo'd or prefix query still produces
  // candidates instead of an empty page. When q is present, results order by
  // relevance (below) rather than recency.
  let qParamIdx: number | null = null;
  if (options.q) {
    params.push(options.q);
    qParamIdx = params.length;
    conditions.push(
      `(${LISTING_TSVECTOR} @@ websearch_to_tsquery('english', $${qParamIdx}) OR word_similarity($${qParamIdx}, l.name) > ${WORD_SIMILARITY_THRESHOLD})`,
    );
  }

  if (options.includeAll) {
    if (options.status) {
      params.push(options.status);
      conditions.push(`l.status = $${params.length}`);
    }
  } else if (options.callerId) {
    params.push(options.callerId);
    const ownerParamIdx = params.length;
    if (options.status) {
      params.push(options.status);
      conditions.push(`(l.status = 'approved' OR (biz.owner_id = $${ownerParamIdx} AND l.status = $${params.length}))`);
    } else {
      conditions.push(`(l.status = 'approved' OR biz.owner_id = $${ownerParamIdx})`);
    }
  } else {
    conditions.push(`l.status = 'approved'`);
  }

  if (options.minRating !== undefined) {
    params.push(options.minRating);
    conditions.push(
      `(SELECT AVG(r.rating) FROM reviews r WHERE r.listing_id = l.id AND r.status = 'approved') >= $${params.length}`,
    );
  }

  // AND semantics: one EXISTS per requested amenity, so a Listing must carry
  // every one of them — narrowing, the way a directory filter is expected to.
  for (const amenity of options.amenities ?? []) {
    params.push(amenity);
    conditions.push(
      `EXISTS (SELECT 1 FROM listing_amenities la JOIN amenities am ON am.id = la.amenity_id WHERE la.listing_id = l.id AND am.name = $${params.length})`,
    );
  }

  // hotel_details has no row for a non-Hotel Listing, so hd.star_rating/pt.name
  // are NULL there and these conditions correctly exclude them — no need to
  // also filter on category.
  if (options.minStarRating !== undefined) {
    params.push(options.minStarRating);
    conditions.push(`hd.star_rating >= $${params.length}`);
  }
  if (options.propertyType) {
    params.push(options.propertyType);
    conditions.push(`pt.name = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  // DISPLAY_JOINS already joins businesses (as `biz`) for the card's phone and
  // website, so owner-scoping reuses it rather than joining the same table twice.
  // hotel_details/property_types are LEFT JOINed unconditionally (cheap at this
  // scale) rather than only when a Hotel-only filter is active, to keep the
  // query assembly simple.
  const from = `FROM listings l ${BADGE_JOIN} ${DISPLAY_JOINS}
    LEFT JOIN hotel_details hd ON hd.listing_id = l.id
    LEFT JOIN property_types pt ON pt.id = hd.property_type_id
    ${where}`;

  const countResult = await db.query<{ count: string }>(`SELECT COUNT(*) ${from}`, params);
  const total = Number(countResult.rows[0].count);

  // Relevance-ordered when searching, recency-ordered when just browsing. The
  // trigram similarity is the tiebreaker so a fuzzy-only match (no FTS hit)
  // still gets a sensible order.
  const orderBy =
    qParamIdx === null
      ? "l.created_at DESC"
      : `ts_rank(${LISTING_TSVECTOR}, websearch_to_tsquery('english', $${qParamIdx})) DESC, word_similarity($${qParamIdx}, l.name) DESC, l.created_at DESC`;

  const listParams = [...params, options.pageSize, (options.page - 1) * options.pageSize];
  const { rows } = await db.query<ListingRow>(
    `SELECT ${SUMMARY_COLUMNS} ${from} ORDER BY ${orderBy} LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  );

  return { items: rows.map(toSummary), total };
}

/**
 * Project a set of Listing ids into ListingSummary cards, preserving the given
 * order (issue #11). The search engine ranks ids with RRF, then hands them here
 * to be rendered as the same cards the directory uses — visibility is the
 * caller's responsibility (search already applied it when ranking).
 */
export async function summariesByIds(db: pg.Pool, ids: string[]): Promise<ListingSummary[]> {
  if (ids.length === 0) return [];
  const { rows } = await db.query<ListingRow>(
    `SELECT ${SUMMARY_COLUMNS} FROM listings l ${BADGE_JOIN} ${DISPLAY_JOINS} WHERE l.id = ANY($1)`,
    [ids],
  );
  const byId = new Map(rows.map((r) => [r.id, toSummary(r)]));
  return ids.map((id) => byId.get(id)).filter((s): s is ListingSummary => s !== undefined);
}

/**
 * Joins each row's Listing summary onto it in one batch (issue #13) — shared
 * by GET /me/enquiries and GET /me/reviews, which both need "here's what I
 * sent/wrote, and which Listing it was about" without an N+1 fetch per row.
 */
export async function attachListingSummaries<T extends { listingId: string }>(
  db: pg.Pool,
  rows: T[],
): Promise<(T & { listing?: ListingSummary })[]> {
  const listingsById = new Map(
    (await summariesByIds(db, [...new Set(rows.map((r) => r.listingId))])).map((l) => [l.id, l]),
  );
  return rows.map((r) => ({ ...r, listing: listingsById.get(r.listingId) }));
}
