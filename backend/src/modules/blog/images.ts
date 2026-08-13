import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type pg from "pg";
import { requireDeleted } from "../../db-errors.js";
import { config } from "../../config.js";

const UPLOAD_ROOT = path.resolve(config.uploadDir);

/**
 * Blog Posts have exactly one cover image (a `cover_image` column on the
 * post row), not a gallery — unlike Listings' `listing_images` table, there's
 * no separate images table here. Mirrors listings/images.ts's file-handling
 * (randomUUID+ext filename, /uploads/<kind>/<id>/<file> URL shape) without
 * the gallery bookkeeping that module needs and this one doesn't.
 */
export async function saveBlogCoverImageFile(postId: string, originalFilename: string, buffer: Buffer): Promise<string> {
  const ext = path.extname(originalFilename);
  const filename = `${randomUUID()}${ext}`;
  const dir = path.join(UPLOAD_ROOT, "blog-posts", postId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), buffer);
  return `/uploads/blog-posts/${postId}/${filename}`;
}

/** Removes the file backing a served image URL. Tolerates the file already being gone. */
export async function deleteBlogCoverImageFile(url: string): Promise<void> {
  const filePath = path.join(UPLOAD_ROOT, url.replace(/^\/uploads\//, ""));
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

export async function setBlogPostCoverImage(db: pg.Pool, postId: string, url: string): Promise<void> {
  const { rowCount } = await db.query(`UPDATE blog_posts SET cover_image = $1 WHERE id = $2`, [url, postId]);
  requireDeleted(rowCount, "Blog post not found");
}
