import { existsSync } from "node:fs";
import { readFile, rm, unlink } from "node:fs/promises";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

const UPLOAD_ROOT = path.resolve("uploads");

function buildMultipart(
  fields: Record<string, string>,
  file: { fieldName: string; filename: string; content: Buffer; contentType: string },
): { body: Buffer; contentType: string } {
  const boundary = `----testboundary${Date.now()}${Math.random().toString(16).slice(2)}`;
  const parts: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
    ),
  );
  parts.push(file.content);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function createApprovedBusinessWithCategory(
  ctx: TestContext,
  ownerCookie: string,
  adminCookie: string,
): Promise<{ businessId: string; categoryId: string }> {
  const create = await ctx.app.inject({
    method: "POST",
    url: "/businesses",
    headers: { cookie: ownerCookie },
    payload: { name: "Lake View Inn" },
  });
  const businessId = create.json().id;
  await ctx.app.inject({ method: "POST", url: `/businesses/${businessId}/approve`, headers: { cookie: adminCookie } });
  const { rows } = await ctx.db.query<{ id: string }>(
    `INSERT INTO categories (name, slug, has_detail_table) VALUES ('Hotel', 'hotel', true) RETURNING id`,
  );
  return { businessId, categoryId: rows[0].id };
}

describe("Listing images (local disk upload)", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  afterAll(async () => {
    await rm(UPLOAD_ROOT, { recursive: true, force: true });
  });

  it("lets the owner upload an image, writing it to disk and recording a listing_images row", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner@example.com");
    const { businessId, categoryId } = await createApprovedBusinessWithCategory(ctx, ownerCookie, adminCookie);
    const create = await ctx.app.inject({
      method: "POST",
      url: "/listings",
      headers: { cookie: ownerCookie },
      payload: { businessId, categoryId, name: "Lakeside Suite" },
    });
    const listingId = create.json().id;

    const { body, contentType } = buildMultipart(
      { caption: "Front view" },
      { fieldName: "file", filename: "front.png", content: Buffer.from("fake-png-bytes"), contentType: "image/png" },
    );

    const response = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/images`,
      headers: { cookie: ownerCookie, "content-type": contentType },
      payload: body,
    });

    expect(response.statusCode).toBe(201);
    const image = response.json();
    expect(image.caption).toBe("Front view");
    expect(image.url).toBe(`/uploads/listings/${listingId}/${path.basename(image.url)}`);

    const diskPath = path.join(UPLOAD_ROOT, image.url.replace(/^\/uploads\//, ""));
    expect(existsSync(diskPath)).toBe(true);
    expect((await readFile(diskPath)).toString()).toBe("fake-png-bytes");
  });

  it("blocks a non-owner, non-admin from uploading an image with 403", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin2@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner2@example.com");
    const { cookie: strangerCookie } = await registerAndGetCookie(ctx, "stranger2@example.com");
    const { businessId, categoryId } = await createApprovedBusinessWithCategory(ctx, ownerCookie, adminCookie);
    const create = await ctx.app.inject({
      method: "POST",
      url: "/listings",
      headers: { cookie: ownerCookie },
      payload: { businessId, categoryId, name: "Protected Listing" },
    });
    const listingId = create.json().id;

    const { body, contentType } = buildMultipart(
      {},
      { fieldName: "file", filename: "x.png", content: Buffer.from("x"), contentType: "image/png" },
    );
    const response = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/images`,
      headers: { cookie: strangerCookie, "content-type": contentType },
      payload: body,
    });
    expect(response.statusCode).toBe(403);
  });

  it("removes the DB row and the file on delete", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin3@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner3@example.com");
    const { businessId, categoryId } = await createApprovedBusinessWithCategory(ctx, ownerCookie, adminCookie);
    const create = await ctx.app.inject({
      method: "POST",
      url: "/listings",
      headers: { cookie: ownerCookie },
      payload: { businessId, categoryId, name: "Deletable Listing" },
    });
    const listingId = create.json().id;
    const { body, contentType } = buildMultipart(
      {},
      { fieldName: "file", filename: "x.png", content: Buffer.from("x"), contentType: "image/png" },
    );
    const upload = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/images`,
      headers: { cookie: ownerCookie, "content-type": contentType },
      payload: body,
    });
    const image = upload.json();
    const diskPath = path.join(UPLOAD_ROOT, image.url.replace(/^\/uploads\//, ""));

    const del = await ctx.app.inject({
      method: "DELETE",
      url: `/listings/${listingId}/images/${image.id}`,
      headers: { cookie: ownerCookie },
    });
    expect(del.statusCode).toBe(204);
    expect(existsSync(diskPath)).toBe(false);

    const listing = await ctx.app.inject({ method: "GET", url: `/listings/${listingId}`, headers: { cookie: ownerCookie } });
    expect(listing.json().images).toHaveLength(0);

    const redelete = await ctx.app.inject({
      method: "DELETE",
      url: `/listings/${listingId}/images/${image.id}`,
      headers: { cookie: ownerCookie },
    });
    expect(redelete.statusCode).toBe(404);
  });

  it("still succeeds if the file was already removed from disk (DB row is the source of truth)", async () => {
    const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin4@example.com");
    await grantRole(ctx.db, adminId, "Super Admin");
    const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner4@example.com");
    const { businessId, categoryId } = await createApprovedBusinessWithCategory(ctx, ownerCookie, adminCookie);
    const create = await ctx.app.inject({
      method: "POST",
      url: "/listings",
      headers: { cookie: ownerCookie },
      payload: { businessId, categoryId, name: "Pre-cleaned Listing" },
    });
    const listingId = create.json().id;
    const { body, contentType } = buildMultipart(
      {},
      { fieldName: "file", filename: "x.png", content: Buffer.from("x"), contentType: "image/png" },
    );
    const upload = await ctx.app.inject({
      method: "POST",
      url: `/listings/${listingId}/images`,
      headers: { cookie: ownerCookie, "content-type": contentType },
      payload: body,
    });
    const image = upload.json();
    const diskPath = path.join(UPLOAD_ROOT, image.url.replace(/^\/uploads\//, ""));
    await unlink(diskPath); // simulate the file already being gone from disk

    const del = await ctx.app.inject({
      method: "DELETE",
      url: `/listings/${listingId}/images/${image.id}`,
      headers: { cookie: ownerCookie },
    });
    expect(del.statusCode).toBe(204);
  });
});
