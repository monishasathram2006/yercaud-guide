import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

describe("Price Bands", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("lists price bands without requiring auth", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/price-bands" });
    expect(response.statusCode).toBe(200);
  });

  it("lets a Super Admin create, update, and delete a price band", async () => {
    const { cookie, userId } = await registerAndGetCookie(ctx, "admin@example.com");
    await grantRole(ctx.db, userId, "Super Admin");

    const create = await ctx.app.inject({
      method: "POST",
      url: "/price-bands",
      headers: { cookie },
      payload: { label: "Budget", minAmount: 0, maxAmount: 2000 },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().label).toBe("Budget");
    const id = create.json().id;

    const update = await ctx.app.inject({
      method: "PATCH",
      url: `/price-bands/${id}`,
      headers: { cookie },
      payload: { label: "Budget Stay", minAmount: 0, maxAmount: 2500 },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().maxAmount).toBe(2500);

    const del = await ctx.app.inject({ method: "DELETE", url: `/price-bands/${id}`, headers: { cookie } });
    expect(del.statusCode).toBe(204);
  });

  it("allows a null maxAmount to mean 'and above'", async () => {
    const { cookie, userId } = await registerAndGetCookie(ctx, "admin2@example.com");
    await grantRole(ctx.db, userId, "Super Admin");

    const create = await ctx.app.inject({
      method: "POST",
      url: "/price-bands",
      headers: { cookie },
      payload: { label: "Luxury", minAmount: 10000 },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().maxAmount).toBeNull();
  });

  it("rejects a maxAmount lower than minAmount with 400", async () => {
    const { cookie, userId } = await registerAndGetCookie(ctx, "admin3@example.com");
    await grantRole(ctx.db, userId, "Super Admin");

    const response = await ctx.app.inject({
      method: "POST",
      url: "/price-bands",
      headers: { cookie },
      payload: { label: "Inverted", minAmount: 5000, maxAmount: 1000 },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns a clean 409 for a duplicate label", async () => {
    const { cookie, userId } = await registerAndGetCookie(ctx, "admin4@example.com");
    await grantRole(ctx.db, userId, "Super Admin");

    await ctx.app.inject({
      method: "POST",
      url: "/price-bands",
      headers: { cookie },
      payload: { label: "Mid-Range", minAmount: 2000, maxAmount: 5000 },
    });
    const dupe = await ctx.app.inject({
      method: "POST",
      url: "/price-bands",
      headers: { cookie },
      payload: { label: "Mid-Range", minAmount: 3000, maxAmount: 6000 },
    });

    expect(dupe.statusCode).toBe(409);
  });

  it("rejects create for an unauthenticated caller with 401 and a signed-in caller without permission with 403", async () => {
    const anon = await ctx.app.inject({
      method: "POST",
      url: "/price-bands",
      payload: { label: "X", minAmount: 0 },
    });
    expect(anon.statusCode).toBe(401);

    const { cookie } = await registerAndGetCookie(ctx, "plain@example.com");
    const forbidden = await ctx.app.inject({
      method: "POST",
      url: "/price-bands",
      headers: { cookie },
      payload: { label: "X", minAmount: 0 },
    });
    expect(forbidden.statusCode).toBe(403);
  });
});
