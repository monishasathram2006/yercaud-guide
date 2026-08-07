import type pg from "pg";
import { BadRequestError } from "../../errors.js";
import { requireRow } from "../../db-errors.js";
import { replaceJoinSet } from "../../join-set.js";

export async function replaceListingAmenities(db: pg.Pool, listingId: string, amenityIds: string[]): Promise<void> {
  return replaceJoinSet(db, "listing_amenities", "listing_id", listingId, "amenity_id", amenityIds);
}

export async function replaceListingTags(db: pg.Pool, listingId: string, tagIds: string[]): Promise<void> {
  return replaceJoinSet(db, "listing_tags", "listing_id", listingId, "tag_id", tagIds);
}

export type AttributeValues = Record<string, string>;

/**
 * Full replace-set, same PUT semantics as amenities/tags: any existing value
 * for this Listing not present in `values` is cleared. Validates every key
 * belongs to the Listing's own category before writing anything — the DB
 * trigger on listing_attribute_values (ADR 0004) is the type-shape backstop,
 * this is the friendlier "wrong category" 400.
 */
export async function setListingAttributes(db: pg.Pool, listingId: string, values: AttributeValues): Promise<void> {
  const { rows: listingRows } = await db.query<{ category_id: string }>(
    `SELECT category_id FROM listings WHERE id = $1`,
    [listingId],
  );
  const listing = requireRow(listingRows, "Listing not found");

  const attributeIds = Object.keys(values);
  if (attributeIds.length > 0) {
    const { rows: attrRows } = await db.query<{ id: string }>(
      `SELECT id FROM category_attributes WHERE id = ANY($1::uuid[]) AND category_id = $2`,
      [attributeIds, listing.category_id],
    );
    const validIds = new Set(attrRows.map((r) => r.id));
    const invalid = attributeIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      throw new BadRequestError(`These attributes don't belong to this Listing's category: ${invalid.join(", ")}`);
    }
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM listing_attribute_values WHERE listing_id = $1`, [listingId]);
    for (const [categoryAttributeId, value] of Object.entries(values)) {
      await client.query(
        `INSERT INTO listing_attribute_values (listing_id, category_attribute_id, value) VALUES ($1, $2, $3)`,
        [listingId, categoryAttributeId, value],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
