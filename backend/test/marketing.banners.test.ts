import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

const YESTERDAY = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const TOMORROW = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const NEXT_WEEK = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const LAST_WEEK = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
const LAST_MONTH = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

async function setup(ctx: TestContext) {
  const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
  await grantRole(ctx.db, adminId, "Super Admin");
  const { cookie: ownerCookie } = await registerAndGetCookie(ctx, "owner@example.com");
  return { adminCookie, ownerCookie };
}

const HERO = { title: "Summer Sale", imageUrl: "/uploads/hero.png", placement: "home-hero" };

describe("Banners", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("blocks a non-admin from creating, editing, or deleting a Banner with 403", async () => {
    const { adminCookie, ownerCookie } = await setup(ctx);
    const create = await ctx.app.inject({ method: "POST", url: "/banners", headers: { cookie: ownerCookie }, payload: HERO });
    expect(create.statusCode).toBe(403);

    const seeded = await ctx.app.inject({ method: "POST", url: "/banners", headers: { cookie: adminCookie }, payload: HERO });
    const bannerId = seeded.json().id;

    const edit = await ctx.app.inject({
      method: "PATCH",
      url: `/banners/${bannerId}`,
      headers: { cookie: ownerCookie },
      payload: { title: "Hijacked" },
    });
    expect(edit.statusCode).toBe(403);

    const del = await ctx.app.inject({ method: "DELETE", url: `/banners/${bannerId}`, headers: { cookie: ownerCookie } });
    expect(del.statusCode).toBe(403);
  });

  it("creates a Banner as draft by default, invisible publicly until activated", async () => {
    const { adminCookie } = await setup(ctx);
    const create = await ctx.app.inject({ method: "POST", url: "/banners", headers: { cookie: adminCookie }, payload: HERO });
    expect(create.statusCode).toBe(201);
    expect(create.json().status).toBe("draft");
    expect(create.json().startDate).toBeNull();

    const publicList = await ctx.app.inject({ method: "GET", url: "/banners" });
    expect(publicList.json()).toHaveLength(0);

    await ctx.app.inject({
      method: "PATCH",
      url: `/banners/${create.json().id}`,
      headers: { cookie: adminCookie },
      payload: { status: "active" },
    });

    const afterActivate = await ctx.app.inject({ method: "GET", url: "/banners" });
    expect(afterActivate.json()).toHaveLength(1);
  });

  it("treats null dates as unbounded — an active Banner with no dates is always visible", async () => {
    const { adminCookie } = await setup(ctx);
    await ctx.app.inject({
      method: "POST",
      url: "/banners",
      headers: { cookie: adminCookie },
      payload: { ...HERO, status: "active" },
    });

    const publicList = await ctx.app.inject({ method: "GET", url: "/banners" });
    expect(publicList.json()).toHaveLength(1);
    expect(publicList.json()[0].startDate).toBeNull();
    expect(publicList.json()[0].endDate).toBeNull();
  });

  it("hides an active Banner that's outside its date range (status alone isn't enough)", async () => {
    const { adminCookie } = await setup(ctx);
    await ctx.app.inject({
      method: "POST",
      url: "/banners",
      headers: { cookie: adminCookie },
      payload: { ...HERO, title: "Future", status: "active", startDate: TOMORROW, endDate: NEXT_WEEK },
    });
    await ctx.app.inject({
      method: "POST",
      url: "/banners",
      headers: { cookie: adminCookie },
      payload: { ...HERO, title: "Past", status: "active", startDate: LAST_MONTH, endDate: LAST_WEEK },
    });

    const publicList = await ctx.app.inject({ method: "GET", url: "/banners" });
    expect(publicList.json()).toHaveLength(0);
  });

  it("hides a draft Banner that's inside its date range (date range alone isn't enough)", async () => {
    const { adminCookie } = await setup(ctx);
    await ctx.app.inject({
      method: "POST",
      url: "/banners",
      headers: { cookie: adminCookie },
      payload: { ...HERO, status: "draft", startDate: YESTERDAY, endDate: TOMORROW },
    });

    const publicList = await ctx.app.inject({ method: "GET", url: "/banners" });
    expect(publicList.json()).toHaveLength(0);
  });

  it("filters by placement and returns banners in sort order", async () => {
    const { adminCookie } = await setup(ctx);
    await ctx.app.inject({
      method: "POST",
      url: "/banners",
      headers: { cookie: adminCookie },
      payload: { ...HERO, title: "Hero B", status: "active", sortOrder: 2 },
    });
    await ctx.app.inject({
      method: "POST",
      url: "/banners",
      headers: { cookie: adminCookie },
      payload: { ...HERO, title: "Hero A", status: "active", sortOrder: 1 },
    });
    await ctx.app.inject({
      method: "POST",
      url: "/banners",
      headers: { cookie: adminCookie },
      payload: { ...HERO, title: "Sidebar", placement: "sidebar", status: "active" },
    });

    const all = await ctx.app.inject({ method: "GET", url: "/banners" });
    expect(all.json()).toHaveLength(3);

    const heroOnly = await ctx.app.inject({ method: "GET", url: "/banners?placement=home-hero" });
    expect(heroOnly.json().map((b: { title: string }) => b.title)).toEqual(["Hero A", "Hero B"]);
  });

  it("accepts a partial PATCH — only the sent field changes", async () => {
    const { adminCookie } = await setup(ctx);
    const create = await ctx.app.inject({
      method: "POST",
      url: "/banners",
      headers: { cookie: adminCookie },
      payload: { ...HERO, status: "active", sortOrder: 3, linkUrl: "https://example.com", startDate: YESTERDAY },
    });

    // Only sortOrder — every other field must survive untouched.
    const edit = await ctx.app.inject({
      method: "PATCH",
      url: `/banners/${create.json().id}`,
      headers: { cookie: adminCookie },
      payload: { sortOrder: 9 },
    });
    expect(edit.statusCode).toBe(200);
    expect(edit.json()).toMatchObject({
      title: HERO.title,
      imageUrl: HERO.imageUrl,
      placement: HERO.placement,
      linkUrl: "https://example.com",
      status: "active",
      startDate: YESTERDAY,
      sortOrder: 9,
    });
  });

  it("lets a Super Admin edit and delete a Banner", async () => {
    const { adminCookie } = await setup(ctx);
    const create = await ctx.app.inject({
      method: "POST",
      url: "/banners",
      headers: { cookie: adminCookie },
      payload: { ...HERO, status: "active", linkUrl: "https://example.com" },
    });
    const bannerId = create.json().id;

    const edit = await ctx.app.inject({
      method: "PATCH",
      url: `/banners/${bannerId}`,
      headers: { cookie: adminCookie },
      payload: { title: "Winter Sale" },
    });
    expect(edit.json().title).toBe("Winter Sale");
    expect(edit.json().linkUrl).toBe("https://example.com"); // untouched
    expect(edit.json().status).toBe("active"); // untouched

    const del = await ctx.app.inject({ method: "DELETE", url: `/banners/${bannerId}`, headers: { cookie: adminCookie } });
    expect(del.statusCode).toBe(204);

    const publicList = await ctx.app.inject({ method: "GET", url: "/banners" });
    expect(publicList.json()).toHaveLength(0);
  });
});
