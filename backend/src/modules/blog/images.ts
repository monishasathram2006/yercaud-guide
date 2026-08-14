import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type pg from "pg";
import { requireDeleted } from "../../db-errors.js";
import { config } from "../../config.js";
import { BadRequestError } from "../../errors.js";

const UPLOAD_ROOT = path.resolve(config.uploadDir);

/** Same allow-list as auth/avatar.ts's assertValidAvatarFile — the extension comes from the validated mimetype, not the client-supplied filename. */
const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

// Below the global multipart limit (app.ts, 5 MB) so this throws its own clean
// 400 first — same reasoning as avatar.ts's 2 MB cap under that same ceiling.
const MAX_COVER_IMAGE_BYTES = 4 * 1024 * 1024;

export function assertValidBlogCoverImageFile(mimetype: string, buffer: Buffer): void {
  if (!(mimetype in ALLOWED_MIME_TYPES)) {
    throw new BadRequestError("Only JPG, PNG or WEBP images are allowed");
  }
  if (buffer.byteLength > MAX_COVER_IMAGE_BYTES) {
    throw new BadRequestError("Image must be 4 MB or smaller");
  }
}

/**
 * Blog Posts have exactly one cover image (a `cover_image` column on the
 * post row), not a gallery — unlike Listings' `listing_images` table, there's
 * no separate images table here. Mirrors listings/images.ts's file-handling
 * (randomUUID+ext filename, /uploads/<kind>/<id>/<file> URL shape) without
 * the gallery bookkeeping that module needs and this one doesn't.
 */
export async function saveBlogCoverImageFile(postId: string, mimetype: string, buffer: Buffer): Promise<string> {
  const ext = ALLOWED_MIME_TYPES[mimetype];
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

/**
 * The Social Share Image backs the `og_image` column (the Open Graph/Twitter
 * card image) — a second, independent upload from the Featured/cover image,
 * same validation rules, same on-disk layout with a `social-` prefix so the
 * two can coexist under the same post directory without colliding.
 */
export async function saveBlogSocialImageFile(postId: string, mimetype: string, buffer: Buffer): Promise<string> {
  const ext = ALLOWED_MIME_TYPES[mimetype];
  const filename = `social-${randomUUID()}${ext}`;
  const dir = path.join(UPLOAD_ROOT, "blog-posts", postId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), buffer);
  return `/uploads/blog-posts/${postId}/${filename}`;
}

export async function setBlogPostSocialImage(db: pg.Pool, postId: string, url: string): Promise<void> {
  const { rowCount } = await db.query(`UPDATE blog_posts SET og_image = $1 WHERE id = $2`, [url, postId]);
  requireDeleted(rowCount, "Blog post not found");
}
