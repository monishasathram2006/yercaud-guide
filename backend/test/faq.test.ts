import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

async function setup(ctx: TestContext) {
  const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
  await grantRole(ctx.db, adminId, "Super Admin");
  const { cookie: plainCookie } = await registerAndGetCookie(ctx, "plain@example.com");
  return { adminCookie, plainCookie };
}

describe("FAQ Categories", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("blocks a non-admin from create, update, and delete with 403", async () => {
    const { adminCookie, plainCookie } = await setup(ctx);
    const create = await ctx.app.inject({ method: "POST", url: "/faq-categories", headers: { cookie: plainCookie }, payload: { name: "X" } });
    expect(create.statusCode).toBe(403);

    const seeded = await ctx.app.inject({ method: "POST", url: "/faq-categories", headers: { cookie: adminCookie }, payload: { name: "Booking" } });
    const id = seeded.json().id;

    const edit = await ctx.app.inject({ method: "PATCH", url: `/faq-categories/${id}`, headers: { cookie: plainCookie }, payload: { name: "Y" } });
    expect(edit.statusCode).toBe(403);

    const del = await ctx.app.inject({ method: "DELETE", url: `/faq-categories/${id}`, headers: { cookie: plainCookie } });
    expect(del.statusCode).toBe(403);
  });

  it("carries a sortOrder and no slug, and lists in sort order (not the NamedLookup shape the contract claimed)", async () => {
    const { adminCookie } = await setup(ctx);
    await ctx.app.inject({ method: "POST", url: "/faq-categories", headers: { cookie: adminCookie }, payload: { name: "Second", sortOrder: 2 } });
    await ctx.app.inject({ method: "POST", url: "/faq-categories", headers: { cookie: adminCookie }, payload: { name: "First", sortOrder: 1 } });

    const list = await ctx.app.inject({ method: "GET", url: "/faq-categories" });
    expect(list.statusCode).toBe(200);
    expect(list.json().map((c: { name: string }) => c.name)).toEqual(["First", "Second"]);
    expect(list.json()[0]).toHaveProperty("sortOrder", 1);
    expect(list.json()[0]).not.toHaveProperty("slug");
  });

  it("defaults sortOrder to 0 and supports a partial PATCH", async () => {
    const { adminCookie } = await setup(ctx);
    const create = await ctx.app.inject({ method: "POST", url: "/faq-categories", headers: { cookie: adminCookie }, payload: { name: "General" } });
    expect(create.json().sortOrder).toBe(0);

    const edit = await ctx.app.inject({
      method: "PATCH",
      url: `/faq-categories/${create.json().id}`,
      headers: { cookie: adminCookie },
      payload: { sortOrder: 5 },
    });
    expect(edit.json()).toMatchObject({ name: "General", sortOrder: 5 });
  });

  it("returns a clean 409 for a duplicate name", async () => {
    const { adminCookie } = await setup(ctx);
    await ctx.app.inject({ method: "POST", url: "/faq-categories", headers: { cookie: adminCookie }, payload: { name: "Booking" } });
    const dupe = await ctx.app.inject({ method: "POST", url: "/faq-categories", headers: { cookie: adminCookie }, payload: { name: "Booking" } });
    expect(dupe.statusCode).toBe(409);
  });

  it("cascades to its FAQs on delete (the schema's own stated intent)", async () => {
    const { adminCookie } = await setup(ctx);
    const category = await ctx.app.inject({ method: "POST", url: "/faq-categories", headers: { cookie: adminCookie }, payload: { name: "Doomed" } });
    await ctx.app.inject({
      method: "POST",
      url: "/faqs",
      headers: { cookie: adminCookie },
      payload: { categoryId: category.json().id, question: "Q?", answer: "A." },
    });

    const del = await ctx.app.inject({ method: "DELETE", url: `/faq-categories/${category.json().id}`, headers: { cookie: adminCookie } });
    expect(del.statusCode).toBe(204);

    const faqs = await ctx.app.inject({ method: "GET", url: "/faqs" });
    expect(faqs.json()).toHaveLength(0);
  });
});

describe("FAQs", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  async function seedCategory(adminCookie: string, name: string): Promise<string> {
    const response = await ctx.app.inject({ method: "POST", url: "/faq-categories", headers: { cookie: adminCookie }, payload: { name } });
    return response.json().id;
  }

  it("blocks a non-admin from create, update, and delete with 403", async () => {
    const { adminCookie, plainCookie } = await setup(ctx);
    const categoryId = await seedCategory(adminCookie, "General");

    const create = await ctx.app.inject({
      method: "POST",
      url: "/faqs",
      headers: { cookie: plainCookie },
      payload: { categoryId, question: "Q?", answer: "A." },
    });
    expect(create.statusCode).toBe(403);

    const seeded = await ctx.app.inject({
      method: "POST",
      url: "/faqs",
      headers: { cookie: adminCookie },
      payload: { categoryId, question: "Q?", answer: "A." },
    });
    const id = seeded.json().id;

    const edit = await ctx.app.inject({ method: "PATCH", url: `/faqs/${id}`, headers: { cookie: plainCookie }, payload: { answer: "B." } });
    expect(edit.statusCode).toBe(403);

    const del = await ctx.app.inject({ method: "DELETE", url: `/faqs/${id}`, headers: { cookie: plainCookie } });
    expect(del.statusCode).toBe(403);
  });

  it("reads the FAQ publicly, in sort order, optionally narrowed to one category", async () => {
    const { adminCookie } = await setup(ctx);
    const general = await seedCategory(adminCookie, "General");
    const booking = await seedCategory(adminCookie, "Booking");
    await ctx.app.inject({ method: "POST", url: "/faqs", headers: { cookie: adminCookie }, payload: { categoryId: general, question: "Second?", answer: "A", sortOrder: 2 } });
    await ctx.app.inject({ method: "POST", url: "/faqs", headers: { cookie: adminCookie }, payload: { categoryId: general, question: "First?", answer: "A", sortOrder: 1 } });
    await ctx.app.inject({ method: "POST", url: "/faqs", headers: { cookie: adminCookie }, payload: { categoryId: booking, question: "Booking?", answer: "A" } });

    const all = await ctx.app.inject({ method: "GET", url: "/faqs" });
    expect(all.statusCode).toBe(200);
    expect(all.json()).toHaveLength(3);

    const byCategory = await ctx.app.inject({ method: "GET", url: `/faqs?category=${general}` });
    expect(byCategory.json().map((f: { question: string }) => f.question)).toEqual(["First?", "Second?"]);
  });

  it("supports a partial PATCH and delete", async () => {
    const { adminCookie } = await setup(ctx);
    const categoryId = await seedCategory(adminCookie, "General");
    const create = await ctx.app.inject({
      method: "POST",
      url: "/faqs",
      headers: { cookie: adminCookie },
      payload: { categoryId, question: "How do I book?", answer: "Enquire.", sortOrder: 3 },
    });

    const edit = await ctx.app.inject({
      method: "PATCH",
      url: `/faqs/${create.json().id}`,
      headers: { cookie: adminCookie },
      payload: { answer: "Send an enquiry." },
    });
    expect(edit.json()).toMatchObject({ question: "How do I book?", answer: "Send an enquiry.", sortOrder: 3 });

    const del = await ctx.app.inject({ method: "DELETE", url: `/faqs/${create.json().id}`, headers: { cookie: adminCookie } });
    expect(del.statusCode).toBe(204);

    const list = await ctx.app.inject({ method: "GET", url: "/faqs" });
    expect(list.json()).toHaveLength(0);
  });
});
