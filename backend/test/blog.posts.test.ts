import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

async function setup(ctx: TestContext) {
  const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
  await grantRole(ctx.db, adminId, "Super Admin");
  const { rows } = await ctx.db.query<{ id: string }>(
    `INSERT INTO blog_categories (name, slug) VALUES ('Travel Guides', 'travel-guides') RETURNING id`,
  );
  return { adminCookie, adminId, categoryId: rows[0].id };
}

/** The Business → approved Listing chain, for place-mention tests. */
async function createApprovedListing(ctx: TestContext, adminCookie: string, email: string, approve = true) {
  const { cookie: ownerCookie } = await registerAndGetCookie(ctx, email);
  const biz = await ctx.app.inject({ method: "POST", url: "/businesses", headers: { cookie: ownerCookie }, payload: { name: `Biz-${email}` } });
  await ctx.app.inject({ method: "POST", url: `/businesses/${biz.json().id}/approve`, headers: { cookie: adminCookie } });
  const { rows } = await ctx.db.query<{ id: string }>(
    `INSERT INTO categories (name, slug, has_detail_table) VALUES ('Hotel', 'hotel', true)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
  );
  const listing = await ctx.app.inject({
    method: "POST",
    url: "/listings",
    headers: { cookie: ownerCookie },
    payload: { businessId: biz.json().id, categoryId: rows[0].id, name: `Listing-${email}` },
  });
  const listingId = listing.json().id;
  if (approve) {
    await ctx.app.inject({ method: "POST", url: `/listings/${listingId}/approve`, headers: { cookie: adminCookie } });
  }
  return listingId;
}

const POST = { title: "A Weekend in Yercaud", body: "Yercaud is lovely. ".repeat(50) };

describe("Blog Posts", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("blocks a non-admin from creating, editing, publishing, or deleting a post with 403", async () => {
    const { adminCookie, categoryId } = await setup(ctx);
    const { cookie: plainCookie } = await registerAndGetCookie(ctx, "plain@example.com");

    const create = await ctx.app.inject({
      method: "POST",
      url: "/blog-posts",
      headers: { cookie: plainCookie },
      payload: { ...POST, categoryId },
    });
    expect(create.statusCode).toBe(403);

    const seeded = await ctx.app.inject({ method: "POST", url: "/blog-posts", headers: { cookie: adminCookie }, payload: { ...POST, categoryId } });
    const postId = seeded.json().id;

    for (const [method, url] of [
      ["PATCH", `/blog-posts/${postId}`],
      ["POST", `/blog-posts/${postId}/publish`],
      ["DELETE", `/blog-posts/${postId}`],
    ] as const) {
      const response = await ctx.app.inject({ method, url, headers: { cookie: plainCookie }, payload: { title: "x" } });
      expect(response.statusCode).toBe(403);
    }
  });

  it("creates a post as a draft with a generated slug and computed reading time", async () => {
    const { adminCookie, adminId, categoryId } = await setup(ctx);
    const create = await ctx.app.inject({
      method: "POST",
      url: "/blog-posts",
      headers: { cookie: adminCookie },
      payload: { ...POST, categoryId },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().status).toBe("draft");
    expect(create.json().slug).toBe("a-weekend-in-yercaud");
    expect(create.json().authorId).toBe(adminId);
    expect(create.json().publishedAt).toBeNull();
    // 150 words at 200wpm → 1 minute (rounded up, min 1).
    expect(create.json().readingTimeMinutes).toBe(1);
  });

  it("gives two posts with the same title distinct slugs", async () => {
    const { adminCookie, categoryId } = await setup(ctx);
    const first = await ctx.app.inject({ method: "POST", url: "/blog-posts", headers: { cookie: adminCookie }, payload: { ...POST, categoryId } });
    const second = await ctx.app.inject({ method: "POST", url: "/blog-posts", headers: { cookie: adminCookie }, payload: { ...POST, categoryId } });
    expect(first.json().slug).toBe("a-weekend-in-yercaud");
    expect(second.json().slug).toBe("a-weekend-in-yercaud-2");
  });

  it("scales reading time with body length", async () => {
    const { adminCookie, categoryId } = await setup(ctx);
    const create = await ctx.app.inject({
      method: "POST",
      url: "/blog-posts",
      headers: { cookie: adminCookie },
      payload: { categoryId, title: "Long read", body: "word ".repeat(1000) },
    });
    expect(create.json().readingTimeMinutes).toBe(5); // 1000 / 200
  });

  it("accepts a partial PATCH, leaving unsent fields alone and recomputing reading time on a body edit", async () => {
    const { adminCookie, categoryId } = await setup(ctx);
    const create = await ctx.app.inject({
      method: "POST",
      url: "/blog-posts",
      headers: { cookie: adminCookie },
      payload: { ...POST, categoryId, excerpt: "A short trip", seoTitle: "SEO" },
    });

    const edit = await ctx.app.inject({
      method: "PATCH",
      url: `/blog-posts/${create.json().id}`,
      headers: { cookie: adminCookie },
      payload: { body: "word ".repeat(400) },
    });
    expect(edit.statusCode).toBe(200);
    expect(edit.json()).toMatchObject({ title: POST.title, excerpt: "A short trip", seoTitle: "SEO", readingTimeMinutes: 2 });
  });

  it("publishes a draft, stamping publishedAt — and does not move it on re-publish", async () => {
    const { adminCookie, categoryId } = await setup(ctx);
    const create = await ctx.app.inject({ method: "POST", url: "/blog-posts", headers: { cookie: adminCookie }, payload: { ...POST, categoryId } });
    const postId = create.json().id;

    const publish = await ctx.app.inject({ method: "POST", url: `/blog-posts/${postId}/publish`, headers: { cookie: adminCookie } });
    expect(publish.statusCode).toBe(200);
    expect(publish.json().status).toBe("published");
    expect(publish.json().publishedAt).not.toBeNull();
    const firstPublishedAt = publish.json().publishedAt;

    await ctx.app.inject({ method: "PATCH", url: `/blog-posts/${postId}`, headers: { cookie: adminCookie }, payload: { title: "Edited" } });
    const republish = await ctx.app.inject({ method: "POST", url: `/blog-posts/${postId}/publish`, headers: { cookie: adminCookie } });
    expect(republish.json().publishedAt).toBe(firstPublishedAt);
  });

  it("hides an unpublished post from anonymous callers but shows it to a Super Admin", async () => {
    const { adminCookie, categoryId } = await setup(ctx);
    const create = await ctx.app.inject({ method: "POST", url: "/blog-posts", headers: { cookie: adminCookie }, payload: { ...POST, categoryId } });
    const postId = create.json().id;

    const anon = await ctx.app.inject({ method: "GET", url: `/blog-posts/${postId}` });
    expect(anon.statusCode).toBe(404);

    const admin = await ctx.app.inject({ method: "GET", url: `/blog-posts/${postId}`, headers: { cookie: adminCookie } });
    expect(admin.statusCode).toBe(200);

    const anonList = await ctx.app.inject({ method: "GET", url: "/blog-posts" });
    expect(anonList.json()).toHaveLength(0);

    const adminList = await ctx.app.inject({ method: "GET", url: "/blog-posts", headers: { cookie: adminCookie } });
    expect(adminList.json()).toHaveLength(1);
  });

  it("lists published posts newest-first, filtered by category slug and full-text q", async () => {
    const { adminCookie, categoryId } = await setup(ctx);
    const { rows: otherCat } = await ctx.db.query<{ id: string }>(
      `INSERT INTO blog_categories (name, slug) VALUES ('Food', 'food') RETURNING id`,
    );
    for (const [title, cat] of [
      ["Older Post", categoryId],
      ["Newer Post", categoryId],
      ["Food Post", otherCat[0].id],
    ] as const) {
      const p = await ctx.app.inject({ method: "POST", url: "/blog-posts", headers: { cookie: adminCookie }, payload: { categoryId: cat, title, body: `${title} body text` } });
      await ctx.app.inject({ method: "POST", url: `/blog-posts/${p.json().id}/publish`, headers: { cookie: adminCookie } });
    }

    const all = await ctx.app.inject({ method: "GET", url: "/blog-posts" });
    expect(all.json()).toHaveLength(3);
    // Newest-first: Food Post was published last.
    expect(all.json()[0].title).toBe("Food Post");

    const byCategory = await ctx.app.inject({ method: "GET", url: "/blog-posts?category=food" });
    expect(byCategory.json()).toHaveLength(1);
    expect(byCategory.json()[0].title).toBe("Food Post");

    const unknownCategory = await ctx.app.inject({ method: "GET", url: "/blog-posts?category=nonexistent" });
    expect(unknownCategory.json()).toHaveLength(0);

    const search = await ctx.app.inject({ method: "GET", url: "/blog-posts?q=Newer" });
    expect(search.json()).toHaveLength(1);
    expect(search.json()[0].title).toBe("Newer Post");
  });

  it("links related posts, and rejects a post relating to itself with 400", async () => {
    const { adminCookie, categoryId } = await setup(ctx);
    const a = await ctx.app.inject({ method: "POST", url: "/blog-posts", headers: { cookie: adminCookie }, payload: { ...POST, categoryId } });
    const b = await ctx.app.inject({ method: "POST", url: "/blog-posts", headers: { cookie: adminCookie }, payload: { ...POST, categoryId, title: "Other Post" } });

    const link = await ctx.app.inject({
      method: "PATCH",
      url: `/blog-posts/${a.json().id}`,
      headers: { cookie: adminCookie },
      payload: { relatedPostIds: [b.json().id] },
    });
    expect(link.json().relatedPostIds).toEqual([b.json().id]);

    const selfLink = await ctx.app.inject({
      method: "PATCH",
      url: `/blog-posts/${a.json().id}`,
      headers: { cookie: adminCookie },
      payload: { relatedPostIds: [a.json().id] },
    });
    expect(selfLink.statusCode).toBe(400);
  });

  it("mentions approved Listings, and rejects an unapproved one with 400 (FR114)", async () => {
    const { adminCookie, categoryId } = await setup(ctx);
    const approvedListing = await createApprovedListing(ctx, adminCookie, "owner1@example.com");
    const pendingListing = await createApprovedListing(ctx, adminCookie, "owner2@example.com", false);

    const ok = await ctx.app.inject({
      method: "POST",
      url: "/blog-posts",
      headers: { cookie: adminCookie },
      payload: { ...POST, categoryId, placeListingIds: [approvedListing] },
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().placeListingIds).toEqual([approvedListing]);

    const bad = await ctx.app.inject({
      method: "POST",
      url: "/blog-posts",
      headers: { cookie: adminCookie },
      payload: { ...POST, categoryId, title: "Bad mention", placeListingIds: [pendingListing] },
    });
    expect(bad.statusCode).toBe(400);

    // The rejected create must not have left an orphan post behind.
    const all = await ctx.app.inject({ method: "GET", url: "/blog-posts", headers: { cookie: adminCookie } });
    expect(all.json().map((p: { title: string }) => p.title)).not.toContain("Bad mention");
  });

  it("does not apply any part of a PATCH that fails validation", async () => {
    const { adminCookie, categoryId } = await setup(ctx);
    const pendingListing = await createApprovedListing(ctx, adminCookie, "owner3@example.com", false);
    const create = await ctx.app.inject({
      method: "POST",
      url: "/blog-posts",
      headers: { cookie: adminCookie },
      payload: { ...POST, categoryId },
    });
    const postId = create.json().id;

    const bad = await ctx.app.inject({
      method: "PATCH",
      url: `/blog-posts/${postId}`,
      headers: { cookie: adminCookie },
      payload: { title: "Renamed", placeListingIds: [pendingListing] },
    });
    expect(bad.statusCode).toBe(400);

    // The title edit rode along in the same request — it must not have landed.
    const after = await ctx.app.inject({ method: "GET", url: `/blog-posts/${postId}`, headers: { cookie: adminCookie } });
    expect(after.json().title).toBe(POST.title);
  });

  it("stamps publishedAt when a PATCH sets status to published, not just via /publish", async () => {
    const { adminCookie, categoryId } = await setup(ctx);
    const create = await ctx.app.inject({ method: "POST", url: "/blog-posts", headers: { cookie: adminCookie }, payload: { ...POST, categoryId } });

    const patched = await ctx.app.inject({
      method: "PATCH",
      url: `/blog-posts/${create.json().id}`,
      headers: { cookie: adminCookie },
      payload: { status: "published" },
    });
    expect(patched.json().status).toBe("published");
    // Otherwise the post is publicly readable but sorts last under
    // `ORDER BY published_at DESC NULLS LAST`.
    expect(patched.json().publishedAt).not.toBeNull();

    const anon = await ctx.app.inject({ method: "GET", url: "/blog-posts" });
    expect(anon.json()).toHaveLength(1);
  });

  it("deletes a post", async () => {
    const { adminCookie, categoryId } = await setup(ctx);
    const create = await ctx.app.inject({ method: "POST", url: "/blog-posts", headers: { cookie: adminCookie }, payload: { ...POST, categoryId } });

    const del = await ctx.app.inject({ method: "DELETE", url: `/blog-posts/${create.json().id}`, headers: { cookie: adminCookie } });
    expect(del.statusCode).toBe(204);

    const get = await ctx.app.inject({ method: "GET", url: `/blog-posts/${create.json().id}`, headers: { cookie: adminCookie } });
    expect(get.statusCode).toBe(404);
  });

  // FR189's third target, closed in Phase 10. Phase 9 exposed these on Listings
  // — where the columns already sat unused — and left Blog Posts out because
  // they needed a migration, noting the asymmetry it created. Folded in here
  // rather than given their own file, exactly as Phase 9 folded the Listing
  // equivalents into the listing tests: this widens an existing resource.
  describe("Open Graph / Twitter Card fields", () => {
    it("round-trips an OG image and card type", async () => {
      const { adminCookie, categoryId } = await setup(ctx);
      const create = await ctx.app.inject({
        method: "POST",
        url: "/blog-posts",
        headers: { cookie: adminCookie },
        payload: { ...POST, categoryId, ogImage: "https://img.example.com/hero.jpg", twitterCard: "summary_large_image" },
      });
      expect(create.statusCode).toBe(201);
      expect(create.json()).toMatchObject({
        ogImage: "https://img.example.com/hero.jpg",
        twitterCard: "summary_large_image",
      });
    });

    it("defaults both to null", async () => {
      const { adminCookie, categoryId } = await setup(ctx);
      const create = await ctx.app.inject({
        method: "POST",
        url: "/blog-posts",
        headers: { cookie: adminCookie },
        payload: { ...POST, categoryId },
      });
      // A post without a good share image isn't forced to have one.
      expect(create.json()).toMatchObject({ ogImage: null, twitterCard: null });
    });

    it("rejects a card type no platform honours", async () => {
      const { adminCookie, categoryId } = await setup(ctx);
      const res = await ctx.app.inject({
        method: "POST",
        url: "/blog-posts",
        headers: { cookie: adminCookie },
        payload: { ...POST, categoryId, twitterCard: "gigantic_billboard" },
      });
      // Better than discovering at share time that the meta tag was ignored.
      expect(res.statusCode).toBe(400);
    });

    it("leaves them untouched on an unrelated edit", async () => {
      const { adminCookie, categoryId } = await setup(ctx);
      const create = await ctx.app.inject({
        method: "POST",
        url: "/blog-posts",
        headers: { cookie: adminCookie },
        payload: { ...POST, categoryId, ogImage: "https://img.example.com/hero.jpg", twitterCard: "summary" },
      });
      const patch = await ctx.app.inject({
        method: "PATCH",
        url: `/blog-posts/${create.json().id}`,
        headers: { cookie: adminCookie },
        payload: { title: "A Better Title" },
      });
      expect(patch.json()).toMatchObject({ ogImage: "https://img.example.com/hero.jpg", twitterCard: "summary" });
    });

    it("clears one when explicitly set to null", async () => {
      const { adminCookie, categoryId } = await setup(ctx);
      const create = await ctx.app.inject({
        method: "POST",
        url: "/blog-posts",
        headers: { cookie: adminCookie },
        payload: { ...POST, categoryId, ogImage: "https://img.example.com/hero.jpg" },
      });
      const patch = await ctx.app.inject({
        method: "PATCH",
        url: `/blog-posts/${create.json().id}`,
        headers: { cookie: adminCookie },
        payload: { ogImage: null },
      });
      // null is an explicit clear; absent means "not in this PATCH".
      expect(patch.json().ogImage).toBeNull();
    });
  });

  // The full-page editor's Permalink/Focus Keyword/Canonical URL/Visibility
  // fields — added alongside the OG/Twitter fields above, same shape.
  describe("Permalink, focus keyword, canonical URL, and visibility", () => {
    it("derives the slug from the title when no explicit slug is given (existing behavior, unchanged)", async () => {
      const { adminCookie, categoryId } = await setup(ctx);
      const create = await ctx.app.inject({ method: "POST", url: "/blog-posts", headers: { cookie: adminCookie }, payload: { ...POST, categoryId } });
      expect(create.json().slug).toBe("a-weekend-in-yercaud");
    });

    it("honours an explicit slug override on create, de-duping on collision", async () => {
      const { adminCookie, categoryId } = await setup(ctx);
      const first = await ctx.app.inject({ method: "POST", url: "/blog-posts", headers: { cookie: adminCookie }, payload: { ...POST, categoryId, slug: "custom-permalink" } });
      expect(first.json().slug).toBe("custom-permalink");

      const second = await ctx.app.inject({ method: "POST", url: "/blog-posts", headers: { cookie: adminCookie }, payload: { ...POST, categoryId, title: "Different Title", slug: "custom-permalink" } });
      expect(second.json().slug).toBe("custom-permalink-2");
    });

    it("lets a PATCH set an explicit slug without touching the title, and re-editing the title afterwards leaves that slug alone", async () => {
      const { adminCookie, categoryId } = await setup(ctx);
      const create = await ctx.app.inject({ method: "POST", url: "/blog-posts", headers: { cookie: adminCookie }, payload: { ...POST, categoryId } });
      const postId = create.json().id;

      const rename = await ctx.app.inject({ method: "PATCH", url: `/blog-posts/${postId}`, headers: { cookie: adminCookie }, payload: { slug: "hand-picked-slug" } });
      expect(rename.json().slug).toBe("hand-picked-slug");
      expect(rename.json().title).toBe(POST.title);

      // A later PATCH that doesn't touch slug or title must leave the hand-picked slug alone.
      const unrelated = await ctx.app.inject({ method: "PATCH", url: `/blog-posts/${postId}`, headers: { cookie: adminCookie }, payload: { excerpt: "New excerpt" } });
      expect(unrelated.json().slug).toBe("hand-picked-slug");
    });

    it("round-trips focusKeyword and canonicalUrl, and defaults both to null", async () => {
      const { adminCookie, categoryId } = await setup(ctx);
      const create = await ctx.app.inject({
        method: "POST",
        url: "/blog-posts",
        headers: { cookie: adminCookie },
        payload: { ...POST, categoryId, focusKeyword: "yercaud monsoon", canonicalUrl: "https://yercaudguide.com/blog/canonical" },
      });
      expect(create.json()).toMatchObject({ focusKeyword: "yercaud monsoon", canonicalUrl: "https://yercaudguide.com/blog/canonical" });

      const bare = await ctx.app.inject({ method: "POST", url: "/blog-posts", headers: { cookie: adminCookie }, payload: { ...POST, categoryId, title: "Bare Post" } });
      expect(bare.json()).toMatchObject({ focusKeyword: null, canonicalUrl: null });
    });

    it("defaults visibility to public, and a private+published post 404s for an anonymous caller but is visible to an admin", async () => {
      const { adminCookie, categoryId } = await setup(ctx);
      const create = await ctx.app.inject({ method: "POST", url: "/blog-posts", headers: { cookie: adminCookie }, payload: { ...POST, categoryId } });
      expect(create.json().visibility).toBe("public");
      const postId = create.json().id;

      const patch = await ctx.app.inject({ method: "PATCH", url: `/blog-posts/${postId}`, headers: { cookie: adminCookie }, payload: { status: "published", visibility: "private" } });
      expect(patch.json()).toMatchObject({ status: "published", visibility: "private" });

      const anon = await ctx.app.inject({ method: "GET", url: `/blog-posts/${postId}` });
      expect(anon.statusCode).toBe(404);

      const admin = await ctx.app.inject({ method: "GET", url: `/blog-posts/${postId}`, headers: { cookie: adminCookie } });
      expect(admin.statusCode).toBe(200);

      // Same rule in the public list — a private post never appears there either.
      const anonList = await ctx.app.inject({ method: "GET", url: "/blog-posts" });
      expect(anonList.json()).toHaveLength(0);
    });

    it("carries focusKeyword into a duplicate, but resets canonicalUrl and visibility", async () => {
      const { adminCookie, categoryId } = await setup(ctx);
      const create = await ctx.app.inject({
        method: "POST",
        url: "/blog-posts",
        headers: { cookie: adminCookie },
        payload: { ...POST, categoryId, focusKeyword: "yercaud monsoon", canonicalUrl: "https://yercaudguide.com/blog/original" },
      });
      await ctx.app.inject({ method: "PATCH", url: `/blog-posts/${create.json().id}`, headers: { cookie: adminCookie }, payload: { visibility: "private" } });

      const dup = await ctx.app.inject({ method: "POST", url: `/blog-posts/${create.json().id}/duplicate`, headers: { cookie: adminCookie } });
      expect(dup.json()).toMatchObject({ focusKeyword: "yercaud monsoon", canonicalUrl: null, visibility: "public" });
    });
  });
});
