import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type pg from "pg";
import { requireDeleted } from "../../db-errors.js";
import { config } from "../../config.js";

const UPLOAD_ROOT = path.resolve(config.uploadDir);

export interface ListingImage {
  id: string;
  url: string;
  caption: string | null;
  sortOrder: number;
}

interface ListingImageRow {
  id: string;
  url: string;
  caption: string | null;
  sort_order: number;
}

function toImage(row: ListingImageRow): ListingImage {
  return { id: row.id, url: row.url, caption: row.caption, sortOrder: row.sort_order };
}

export async function insertListingImage(
  db: pg.Pool,
  listingId: string,
  url: string,
  caption?: string,
): Promise<ListingImage> {
  const { rows } = await db.query<ListingImageRow>(
    `INSERT INTO listing_images (listing_id, url, caption, sort_order)
     VALUES ($1, $2, $3, COALESCE((SELECT MAX(sort_order) + 1 FROM listing_images WHERE listing_id = $1), 0))
     RETURNING id, url, caption, sort_order`,
    [listingId, url, caption ?? null],
  );
  return toImage(rows[0]);
}

/** Returns the deleted row's URL (so the route can unlink the file), or throws 404. */
export async function deleteListingImage(db: pg.Pool, listingId: string, imageId: string): Promise<string> {
  const { rows } = await db.query<{ url: string }>(
    `DELETE FROM listing_images WHERE id = $1 AND listing_id = $2 RETURNING url`,
    [imageId, listingId],
  );
  requireDeleted(rows.length, "Listing image not found");
  return rows[0].url;
}

/** Writes the buffer to local disk (build plan's storage decision) and returns its served URL. */
export async function saveListingImageFile(listingId: string, originalFilename: string, buffer: Buffer): Promise<string> {
  const ext = path.extname(originalFilename);
  const filename = `${randomUUID()}${ext}`;
  const dir = path.join(UPLOAD_ROOT, "listings", listingId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), buffer);
  return `/uploads/listings/${listingId}/${filename}`;
}

/** Removes the file backing a served image URL. Tolerates the file already being gone. */
export async function deleteListingImageFile(url: string): Promise<void> {
  const filePath = path.join(UPLOAD_ROOT, url.replace(/^\/uploads\//, ""));
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}
