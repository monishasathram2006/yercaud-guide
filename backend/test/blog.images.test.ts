import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
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

async function setup(ctx: TestContext) {
  const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
  await grantRole(ctx.db, adminId, "Super Admin");
  const { rows } = await ctx.db.query<{ id: string }>(
    `INSERT INTO blog_categories (name, slug) VALUES ('Travel Guides', 'travel-guides') RETURNING id`,
  );
  const create = await ctx.app.inject({
    method: "POST",
    url: "/blog-posts",
    headers: { cookie: adminCookie },
    payload: { title: "A Weekend in Yercaud", body: "Yercaud is lovely. ".repeat(50), categoryId: rows[0].id },
  });
  return { adminCookie, postId: create.json().id as string };
}

describe("Blog post cover image (local disk upload)", () => {
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

  it("uploads a cover image, writing it to disk and recording it on the post", async () => {
    const { adminCookie, postId } = await setup(ctx);
    const { body, contentType } = buildMultipart(
      {},
      { fieldName: "file", filename: "hero.png", content: Buffer.from("fake-png-bytes"), contentType: "image/png" },
    );

    const response = await ctx.app.inject({
      method: "POST",
      url: `/blog-posts/${postId}/cover-image`,
      headers: { cookie: adminCookie, "content-type": contentType },
      payload: body,
    });

    expect(response.statusCode).toBe(201);
    const post = response.json();
    expect(post.coverImage).toBe(`/uploads/blog-posts/${postId}/${path.basename(post.coverImage)}`);
    expect(post.coverImage.endsWith(".png")).toBe(true);

    const diskPath = path.join(UPLOAD_ROOT, post.coverImage.replace(/^\/uploads\//, ""));
    expect(existsSync(diskPath)).toBe(true);
    expect((await readFile(diskPath)).toString()).toBe("fake-png-bytes");
  });

  it("replaces the previous cover image on disk rather than accumulating files", async () => {
    const { adminCookie, postId } = await setup(ctx);
    const first = buildMultipart(
      {},
      { fieldName: "file", filename: "one.png", content: Buffer.from("one"), contentType: "image/png" },
    );
    const firstUpload = await ctx.app.inject({
      method: "POST",
      url: `/blog-posts/${postId}/cover-image`,
      headers: { cookie: adminCookie, "content-type": first.contentType },
      payload: first.body,
    });
    const firstPath = path.join(UPLOAD_ROOT, firstUpload.json().coverImage.replace(/^\/uploads\//, ""));
    expect(existsSync(firstPath)).toBe(true);

    const second = buildMultipart(
      {},
      { fieldName: "file", filename: "two.png", content: Buffer.from("two"), contentType: "image/png" },
    );
    const secondUpload = await ctx.app.inject({
      method: "POST",
      url: `/blog-posts/${postId}/cover-image`,
      headers: { cookie: adminCookie, "content-type": second.contentType },
      payload: second.body,
    });
    expect(secondUpload.statusCode).toBe(201);
    expect(existsSync(firstPath)).toBe(false);
  });

  it("blocks a non-admin from uploading a cover image with 403", async () => {
    const { postId } = await setup(ctx);
    const { cookie: plainCookie } = await registerAndGetCookie(ctx, "plain@example.com");
    const { body, contentType } = buildMultipart(
      {},
      { fieldName: "file", filename: "x.png", content: Buffer.from("x"), contentType: "image/png" },
    );

    const response = await ctx.app.inject({
      method: "POST",
      url: `/blog-posts/${postId}/cover-image`,
      headers: { cookie: plainCookie, "content-type": contentType },
      payload: body,
    });
    expect(response.statusCode).toBe(403);
  });

  it("rejects a non-image file with 400, and does not write it to disk", async () => {
    const { adminCookie, postId } = await setup(ctx);
    const { body, contentType } = buildMultipart(
      {},
      { fieldName: "file", filename: "notes.txt", content: Buffer.from("not an image"), contentType: "text/plain" },
    );

    const response = await ctx.app.inject({
      method: "POST",
      url: `/blog-posts/${postId}/cover-image`,
      headers: { cookie: adminCookie, "content-type": contentType },
      payload: body,
    });
    expect(response.statusCode).toBe(400);

    const post = await ctx.app.inject({ method: "GET", url: `/blog-posts/${postId}`, headers: { cookie: adminCookie } });
    expect(post.json().coverImage).toBeNull();
    expect(existsSync(path.join(UPLOAD_ROOT, "blog-posts", postId))).toBe(false);
  });

  it("rejects a file over the 4 MB cap with 400 (below the global 5 MB multipart limit, so this is the route's own clean rejection)", async () => {
    const { adminCookie, postId } = await setup(ctx);
    const { body, contentType } = buildMultipart(
      {},
      { fieldName: "file", filename: "huge.png", content: Buffer.alloc(4 * 1024 * 1024 + 1), contentType: "image/png" },
    );

    const response = await ctx.app.inject({
      method: "POST",
      url: `/blog-posts/${postId}/cover-image`,
      headers: { cookie: adminCookie, "content-type": contentType },
      payload: body,
    });
    expect(response.statusCode).toBe(400);
  });

  it("404s for a nonexistent post", async () => {
    const { adminCookie } = await setup(ctx);
    const { body, contentType } = buildMultipart(
      {},
      { fieldName: "file", filename: "x.png", content: Buffer.from("x"), contentType: "image/png" },
    );

    const response = await ctx.app.inject({
      method: "POST",
      url: `/blog-posts/00000000-0000-0000-0000-000000000000/cover-image`,
      headers: { cookie: adminCookie, "content-type": contentType },
      payload: body,
    });
    expect(response.statusCode).toBe(404);
  });
});

describe("Blog post social share image (local disk upload)", () => {
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

  it("uploads a social share image, writing it to disk and recording it as the post's ogImage", async () => {
    const { adminCookie, postId } = await setup(ctx);
    const { body, contentType } = buildMultipart(
      {},
      { fieldName: "file", filename: "share.png", content: Buffer.from("fake-png-bytes"), contentType: "image/png" },
    );

    const response = await ctx.app.inject({
      method: "POST",
      url: `/blog-posts/${postId}/social-image`,
      headers: { cookie: adminCookie, "content-type": contentType },
      payload: body,
    });

    expect(response.statusCode).toBe(201);
    const post = response.json();
    expect(post.ogImage).toBe(`/uploads/blog-posts/${postId}/${path.basename(post.ogImage)}`);
    expect(post.coverImage).toBeNull(); // independent of the cover image

    const diskPath = path.join(UPLOAD_ROOT, post.ogImage.replace(/^\/uploads\//, ""));
    expect(existsSync(diskPath)).toBe(true);
    expect((await readFile(diskPath)).toString()).toBe("fake-png-bytes");
  });

  it("coexists with a cover image on the same post without colliding", async () => {
    const { adminCookie, postId } = await setup(ctx);
    const cover = buildMultipart({}, { fieldName: "file", filename: "cover.png", content: Buffer.from("cover"), contentType: "image/png" });
    const social = buildMultipart({}, { fieldName: "file", filename: "share.png", content: Buffer.from("share"), contentType: "image/png" });

    await ctx.app.inject({ method: "POST", url: `/blog-posts/${postId}/cover-image`, headers: { cookie: adminCookie, "content-type": cover.contentType }, payload: cover.body });
    const response = await ctx.app.inject({ method: "POST", url: `/blog-posts/${postId}/social-image`, headers: { cookie: adminCookie, "content-type": social.contentType }, payload: social.body });

    const post = response.json();
    expect(post.coverImage).not.toBeNull();
    expect(post.ogImage).not.toBeNull();
    expect(post.coverImage).not.toBe(post.ogImage);
    expect(existsSync(path.join(UPLOAD_ROOT, post.coverImage.replace(/^\/uploads\//, "")))).toBe(true);
    expect(existsSync(path.join(UPLOAD_ROOT, post.ogImage.replace(/^\/uploads\//, "")))).toBe(true);
  });

  it("replaces the previous social share image on disk rather than accumulating files", async () => {
    const { adminCookie, postId } = await setup(ctx);
    const first = buildMultipart({}, { fieldName: "file", filename: "one.png", content: Buffer.from("one"), contentType: "image/png" });
    const firstUpload = await ctx.app.inject({ method: "POST", url: `/blog-posts/${postId}/social-image`, headers: { cookie: adminCookie, "content-type": first.contentType }, payload: first.body });
    const firstPath = path.join(UPLOAD_ROOT, firstUpload.json().ogImage.replace(/^\/uploads\//, ""));
    expect(existsSync(firstPath)).toBe(true);

    const second = buildMultipart({}, { fieldName: "file", filename: "two.png", content: Buffer.from("two"), contentType: "image/png" });
    const secondUpload = await ctx.app.inject({ method: "POST", url: `/blog-posts/${postId}/social-image`, headers: { cookie: adminCookie, "content-type": second.contentType }, payload: second.body });
    expect(secondUpload.statusCode).toBe(201);
    expect(existsSync(firstPath)).toBe(false);
  });

  it("blocks a non-admin from uploading a social share image with 403", async () => {
    const { postId } = await setup(ctx);
    const { cookie: plainCookie } = await registerAndGetCookie(ctx, "plain-social@example.com");
    const { body, contentType } = buildMultipart({}, { fieldName: "file", filename: "x.png", content: Buffer.from("x"), contentType: "image/png" });

    const response = await ctx.app.inject({
      method: "POST",
      url: `/blog-posts/${postId}/social-image`,
      headers: { cookie: plainCookie, "content-type": contentType },
      payload: body,
    });
    expect(response.statusCode).toBe(403);
  });

  it("rejects a non-image file with 400", async () => {
    const { adminCookie, postId } = await setup(ctx);
    const { body, contentType } = buildMultipart({}, { fieldName: "file", filename: "notes.txt", content: Buffer.from("not an image"), contentType: "text/plain" });

    const response = await ctx.app.inject({
      method: "POST",
      url: `/blog-posts/${postId}/social-image`,
      headers: { cookie: adminCookie, "content-type": contentType },
      payload: body,
    });
    expect(response.statusCode).toBe(400);

    const post = await ctx.app.inject({ method: "GET", url: `/blog-posts/${postId}`, headers: { cookie: adminCookie } });
    expect(post.json().ogImage).toBeNull();
  });

  it("404s for a nonexistent post", async () => {
    const { adminCookie } = await setup(ctx);
    const { body, contentType } = buildMultipart({}, { fieldName: "file", filename: "x.png", content: Buffer.from("x"), contentType: "image/png" });

    const response = await ctx.app.inject({
      method: "POST",
      url: `/blog-posts/00000000-0000-0000-0000-000000000000/social-image`,
      headers: { cookie: adminCookie, "content-type": contentType },
      payload: body,
    });
    expect(response.statusCode).toBe(404);
  });
});
