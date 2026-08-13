import type pg from "pg";

/**
 * Composes the rich text document embedded for each entity (issue #11).
 *
 * One document per Listing/Business, assembled from everything that describes
 * it — not just name and description, which is all the old lexical search saw.
 * `concat_ws(' | ', …)` drops NULL fields, so a detail-less category
 * (travel/shopping/health-wellness/other-services, ADR 0003) simply composes
 * from its base fields. Detail-table content (menus, itineraries, rooms) is why
 * "spice garden" matches a restaurant's menu and "guided trek" matches a tour's
 * itinerary. All statuses are composed; the search query filters by visibility,
 * so approving a Listing never requires re-embedding.
 */

export interface StaleDocument {
  id: string;
  text: string;
  /** The text last embedded (null if never). When it equals `text`, the row was
   *  marked stale by a change that didn't alter its document — the reconcile job
   *  clears the flag without spending an embedding call. */
  previous: string | null;
}

/** A Listing's document: base fields + tags/amenities + price band + per-category detail. */
const LISTING_DOCUMENT_SQL = `
  SELECT l.id,
    concat_ws(' | ',
      l.name,
      c.name,
      loc.name,
      l.description,
      (SELECT string_agg(at.name, ', ') FROM listing_tags lt JOIN attribute_tags at ON at.id = lt.tag_id WHERE lt.listing_id = l.id),
      (SELECT string_agg(a.name, ', ') FROM listing_amenities la JOIN amenities a ON a.id = la.amenity_id WHERE la.listing_id = l.id),
      (SELECT pb.label FROM price_bands pb
         WHERE l.price_from IS NOT NULL AND l.price_from >= pb.min_amount
           AND (pb.max_amount IS NULL OR l.price_from <= pb.max_amount)
         ORDER BY pb.min_amount DESC LIMIT 1),
      -- Hotel
      (SELECT concat_ws(' ', pt.name, hd.guests_capacity_note)
         FROM hotel_details hd LEFT JOIN property_types pt ON pt.id = hd.property_type_id WHERE hd.listing_id = l.id),
      (SELECT string_agg(hr.name, ', ') FROM hotel_rooms hr WHERE hr.listing_id = l.id),
      -- Restaurant
      (SELECT concat_ws(' ', rd.cuisine_type, rd.best_for) FROM restaurant_details rd WHERE rd.listing_id = l.id),
      (SELECT string_agg(mi.name, ', ') FROM restaurant_menu_items mi WHERE mi.listing_id = l.id),
      -- Activity
      (SELECT concat_ws(' ', ad.difficulty_level, ad.duration) FROM activity_details ad WHERE ad.listing_id = l.id),
      (SELECT string_agg(s.title, ', ') FROM activity_itinerary_steps s WHERE s.listing_id = l.id),
      (SELECT string_agg(i.item, ', ') FROM activity_inclusions i WHERE i.listing_id = l.id AND i.is_included),
      -- Tour
      (SELECT concat_ws(' ', td.tour_type, td.best_for, td.duration) FROM tour_details td WHERE td.listing_id = l.id),
      (SELECT string_agg(s.stop_name, ', ') FROM tour_itinerary_steps s WHERE s.listing_id = l.id),
      (SELECT string_agg(i.item, ', ') FROM tour_inclusions i WHERE i.listing_id = l.id AND i.is_included),
      (SELECT string_agg(ta.name, ', ') FROM tour_attractions ta WHERE ta.listing_id = l.id)
    ) AS text,
    l.embedding_text AS previous
  FROM listings l
  JOIN categories c ON c.id = l.category_id
  LEFT JOIN locations loc ON loc.id = l.location_id
`;

/** A Business's document: base fields + the names of its Listings. */
const BUSINESS_DOCUMENT_SQL = `
  SELECT b.id,
    concat_ws(' | ',
      b.name,
      b.description,
      b.address,
      (SELECT string_agg(l.name, ', ') FROM listings l WHERE l.business_id = b.id)
    ) AS text,
    b.embedding_text AS previous
  FROM businesses b
`;

export async function staleListingDocuments(db: pg.Pool, limit: number): Promise<StaleDocument[]> {
  const { rows } = await db.query<StaleDocument>(
    `${LISTING_DOCUMENT_SQL} WHERE l.embedding_stale = true ORDER BY l.id LIMIT $1`,
    [limit],
  );
  return rows;
}

export async function staleBusinessDocuments(db: pg.Pool, limit: number): Promise<StaleDocument[]> {
  const { rows } = await db.query<StaleDocument>(
    `${BUSINESS_DOCUMENT_SQL} WHERE b.embedding_stale = true ORDER BY b.id LIMIT $1`,
    [limit],
  );
  return rows;
}
