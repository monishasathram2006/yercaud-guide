import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../../config.js";
import { BadRequestError } from "../../errors.js";

const UPLOAD_ROOT = path.resolve(config.uploadDir);

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export function assertValidAvatarFile(mimetype: string, buffer: Buffer): void {
  if (!(mimetype in ALLOWED_MIME_TYPES)) {
    throw new BadRequestError("Only JPG, PNG or WEBP images are allowed");
  }
  if (buffer.byteLength > MAX_AVATAR_BYTES) {
    throw new BadRequestError("Image must be 2 MB or smaller");
  }
}

/** Same local-disk-plus-static-serving pattern as listing images (images.ts), under uploads/avatars/{userId}. */
export async function saveAvatarFile(userId: string, mimetype: string, buffer: Buffer): Promise<string> {
  const ext = ALLOWED_MIME_TYPES[mimetype];
  const filename = `${randomUUID()}${ext}`;
  const dir = path.join(UPLOAD_ROOT, "avatars", userId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), buffer);
  return `/uploads/avatars/${userId}/${filename}`;
}
