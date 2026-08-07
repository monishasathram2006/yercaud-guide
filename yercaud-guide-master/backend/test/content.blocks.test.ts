import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

async function setup(ctx: TestContext) {
  const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
  await grantRole(ctx.db, adminId, "Super Admin");
  const { cookie: plainCookie } = await registerAndGetCookie(ctx, "plain@example.com");
  return { adminCookie, adminId, plainCookie };
}

async function getAuditLogs(ctx: TestContext, adminCookie: string) {
  const response = await ctx.app.inject({
    method: "GET",
    url: "/audit-logs?tableName=content_blocks",
    headers: { cookie: adminCookie },
  });
  return response.json() as Array<{ action: string; recordId: string; actorId: string | null; oldData: unknown; newData: unknown }>;
}

describe("Content blocks", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("blocks a non-admin from writing a block with 403", async () => {
    const { plainCookie } = await setup(ctx);
    const response = await ctx.app.inject({
      method: "PUT",
      url: "/content-blocks/about/mission",
      headers: { cookie: plainCookie },
      payload: { content: { heading: "Our Mission" } },
    });
    expect(response.statusCode).toBe(403);
  });

  it("requires a session to write a block, distinguishing 401 from 403", async () => {
    const response = await ctx.app.inject({
      method: "PUT",
      url: "/content-blocks/about/mission",
      payload: { content: { heading: "Our Mission" } },
    });
    expect(response.statusCode).toBe(401);
  });

  it("creates a block and edits it through the same PUT, both returning 200", async () => {
    const { adminCookie } = await setup(ctx);

    const create = await ctx.app.inject({
      method: "PUT",
      url: "/content-blocks/about/mission",
      headers: { cookie: adminCookie },
      payload: { content: { heading: "Our Mission", body: "Connect Yercaud." } },
    });
    expect(create.statusCode).toBe(200);
    expect(create.json()).toMatchObject({
      pageSlug: "about",
      blockKey: "mission",
      content: { heading: "Our Mission", body: "Connect Yercaud." },
    });

    const edit = await ctx.app.inject({
      method: "PUT",
      url: "/content-blocks/about/mission",
      headers: { cookie: adminCookie },
      payload: { content: { heading: "Our Mission & Vision" } },
    });
    expect(edit.statusCode).toBe(200);
    // The upsert replaces content wholesale rather than merging — `body` is gone.
    expect(edit.json().content).toEqual({ heading: "Our Mission & Vision" });

    const read = await ctx.app.inject({ method: "GET", url: "/content-blocks/about" });
    expect(read.json()).toHaveLength(1);
    expect(read.json()[0].content).toEqual({ heading: "Our Mission & Vision" });
  });

  it("reads a page's blocks publicly, ordered by block key, without leaking updatedBy", async () => {
    const { adminCookie } = await setup(ctx);
    await ctx.app.inject({ method: "PUT", url: "/content-blocks/about/mission", headers: { cookie: adminCookie }, payload: { content: { n: 2 } } });
    await ctx.app.inject({ method: "PUT", url: "/content-blocks/about/journey", headers: { cookie: adminCookie }, payload: { content: { n: 1 } } });
    await ctx.app.inject({ method: "PUT", url: "/content-blocks/contact/methods", headers: { cookie: adminCookie }, payload: { content: { n: 3 } } });

    const response = await ctx.app.inject({ method: "GET", url: "/content-blocks/about" });
    expect(response.statusCode).toBe(200);
    expect(response.json().map((b: { blockKey: string }) => b.blockKey)).toEqual(["journey", "mission"]);
    expect(response.json()[0]).not.toHaveProperty("updatedBy");
    expect(response.json()[0]).not.toHaveProperty("id");
    expect(response.json()[0]).toHaveProperty("updatedAt");
  });

  it("returns an empty array for a page that has no blocks, rather than a 404", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/content-blocks/nonexistent-page" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it("scopes a block to its page, so the same key on another page is a different block", async () => {
    const { adminCookie } = await setup(ctx);
    await ctx.app.inject({ method: "PUT", url: "/content-blocks/about/hero", headers: { cookie: adminCookie }, payload: { content: { title: "About us" } } });
    await ctx.app.inject({ method: "PUT", url: "/content-blocks/contact/hero", headers: { cookie: adminCookie }, payload: { content: { title: "Contact us" } } });

    const about = await ctx.app.inject({ method: "GET", url: "/content-blocks/about" });
    const contact = await ctx.app.inject({ method: "GET", url: "/content-blocks/contact" });
    expect(about.json()[0].content).toEqual({ title: "About us" });
    expect(contact.json()[0].content).toEqual({ title: "Contact us" });
  });

  it("accepts arbitrarily nested content, so a section of cards needs no schema change", async () => {
    const { adminCookie } = await setup(ctx);
    const content = {
      heading: "Why Choose Yercaud Guide?",
      cards: [
        { title: "Verified Listings", icon: "check" },
        { title: "Direct Contact", icon: "phone" },
      ],
    };
    const response = await ctx.app.inject({
      method: "PUT",
      url: "/content-blocks/about/why-choose",
      headers: { cookie: adminCookie },
      payload: { content },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().content).toEqual(content);
  });

  it("rejects content that is not a JSON object", async () => {
    const { adminCookie } = await setup(ctx);
    for (const content of [["a", "b"], "just a string", 42, null]) {
      const response = await ctx.app.inject({
        method: "PUT",
        url: "/content-blocks/about/mission",
        headers: { cookie: adminCookie },
        payload: { content },
      });
      expect(response.statusCode).toBe(400);
    }
  });

  it("requires content in the body", async () => {
    const { adminCookie } = await setup(ctx);
    const response = await ctx.app.inject({
      method: "PUT",
      url: "/content-blocks/about/mission",
      headers: { cookie: adminCookie },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });

  it("accepts an empty object, which is how an admin clears a block", async () => {
    const { adminCookie } = await setup(ctx);
    await ctx.app.inject({ method: "PUT", url: "/content-blocks/about/mission", headers: { cookie: adminCookie }, payload: { content: { heading: "X" } } });
    const cleared = await ctx.app.inject({ method: "PUT", url: "/content-blocks/about/mission", headers: { cookie: adminCookie }, payload: { content: {} } });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().content).toEqual({});
  });

  it("audits a create with no oldData and an edit with the prior content", async () => {
    const { adminCookie, adminId } = await setup(ctx);
    await ctx.app.inject({ method: "PUT", url: "/content-blocks/about/mission", headers: { cookie: adminCookie }, payload: { content: { heading: "First" } } });
    await ctx.app.inject({ method: "PUT", url: "/content-blocks/about/mission", headers: { cookie: adminCookie }, payload: { content: { heading: "Second" } } });

    const logs = await getAuditLogs(ctx, adminCookie);
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.action === "content_blocks.upsert")).toBe(true);
    expect(logs.every((l) => l.actorId === adminId)).toBe(true);
    // Identify the entries by content rather than by list order: both writes land
    // in the same test and could share a created_at, which is all the list sorts by.
    const create = logs.find((l) => l.oldData === null)!;
    const edit = logs.find((l) => l.oldData !== null)!;
    expect(create.oldData).toBeNull();
    expect(create.newData).toMatchObject({ content: { heading: "First" } });
    expect(edit.oldData).toMatchObject({ content: { heading: "First" } });
    expect(edit.newData).toMatchObject({ content: { heading: "Second" } });
    // Both entries point at the same row: the upsert edits, it does not replace.
    expect(create.recordId).toBe(edit.recordId);
  });
});
