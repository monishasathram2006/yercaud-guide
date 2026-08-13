import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

interface Subscriber {
  id: string;
  email: string;
  source: string | null;
  status: "active" | "unsubscribed";
  subscribedAt: string;
}

async function setup(ctx: TestContext) {
  const { cookie: adminCookie, userId: adminId } = await registerAndGetCookie(ctx, "admin@example.com");
  await grantRole(ctx.db, adminId, "Super Admin");
  const { cookie: plainCookie } = await registerAndGetCookie(ctx, "plain@example.com");
  return { adminCookie, plainCookie };
}

function subscribe(ctx: TestContext, payload: { email: string; source?: string }) {
  return ctx.app.inject({ method: "POST", url: "/newsletter/subscribe", payload });
}

function unsubscribe(ctx: TestContext, email: string) {
  return ctx.app.inject({ method: "POST", url: "/newsletter/unsubscribe", payload: { email } });
}

async function listSubscribers(ctx: TestContext, adminCookie: string, query = ""): Promise<Subscriber[]> {
  const response = await ctx.app.inject({
    method: "GET",
    url: `/newsletter/subscribers${query}`,
    headers: { cookie: adminCookie },
  });
  return response.json();
}

describe("Newsletter subscribe", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("subscribes a visitor with no account and no session", async () => {
    const { adminCookie } = await setup(ctx);
    const response = await subscribe(ctx, { email: "visitor@example.com", source: "footer" });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ email: "visitor@example.com", status: "active" });

    const subscribers = await listSubscribers(ctx, adminCookie);
    expect(subscribers).toHaveLength(1);
  });

  it("tells an anonymous caller nothing about a prior subscription, so it cannot be used to test who is on the list", async () => {
    await subscribe(ctx, { email: "known@example.com", source: "footer" });

    // Re-subscribing an address already on the list must look exactly like a
    // first-time subscribe. Echoing back the preserved subscribedAt, the id, or
    // a source the caller never supplied would each answer "was this address
    // already subscribed?" — the question unsubscribe's flat 204 exists to deny.
    const known = await subscribe(ctx, { email: "known@example.com" });
    const fresh = await subscribe(ctx, { email: "stranger@example.com" });

    expect(known.json()).toEqual({ email: "known@example.com", status: "active" });
    expect(known.statusCode).toBe(fresh.statusCode);
    expect(Object.keys(known.json()).sort()).toEqual(Object.keys(fresh.json()).sort());
    expect(known.json()).not.toHaveProperty("subscribedAt");
    expect(known.json()).not.toHaveProperty("id");
    expect(known.json()).not.toHaveProperty("source");
  });

  it("records the source, so the footer and blog widget can be told apart", async () => {
    const { adminCookie } = await setup(ctx);
    await subscribe(ctx, { email: "a@example.com", source: "footer" });
    await subscribe(ctx, { email: "b@example.com", source: "blog-widget" });

    const subscribers = await listSubscribers(ctx, adminCookie);
    const sources = subscribers.map((s) => s.source).sort();
    expect(sources).toEqual(["blog-widget", "footer"]);
  });

  it("treats source as optional", async () => {
    const { adminCookie } = await setup(ctx);
    const response = await subscribe(ctx, { email: "nosource@example.com" });
    expect(response.statusCode).toBe(201);
    expect((await listSubscribers(ctx, adminCookie))[0]!.source).toBeNull();
  });

  it("is idempotent: subscribing twice succeeds both times and yields one subscriber", async () => {
    const { adminCookie } = await setup(ctx);
    const first = await subscribe(ctx, { email: "twice@example.com", source: "footer" });
    const second = await subscribe(ctx, { email: "twice@example.com", source: "footer" });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(await listSubscribers(ctx, adminCookie)).toHaveLength(1);
  });

  it("preserves the original subscribedAt across a re-subscribe", async () => {
    const { adminCookie } = await setup(ctx);
    await subscribe(ctx, { email: "twice@example.com" });
    const original = (await listSubscribers(ctx, adminCookie))[0]!.subscribedAt;

    await subscribe(ctx, { email: "twice@example.com" });
    const after = (await listSubscribers(ctx, adminCookie))[0]!.subscribedAt;
    expect(after).toBe(original);
  });

  it("reattributes source on re-subscribe when one is supplied, and keeps the old one when not", async () => {
    const { adminCookie } = await setup(ctx);
    await subscribe(ctx, { email: "s@example.com", source: "footer" });

    await subscribe(ctx, { email: "s@example.com", source: "blog-widget" });
    expect((await listSubscribers(ctx, adminCookie))[0]!.source).toBe("blog-widget");

    await subscribe(ctx, { email: "s@example.com" });
    expect((await listSubscribers(ctx, adminCookie))[0]!.source).toBe("blog-widget");
  });

  it("rejects a malformed email", async () => {
    for (const email of ["not-an-email", "", "@example.com", "a@"]) {
      const response = await subscribe(ctx, { email });
      expect(response.statusCode).toBe(400);
    }
  });

  it("requires an email", async () => {
    const response = await ctx.app.inject({ method: "POST", url: "/newsletter/subscribe", payload: {} });
    expect(response.statusCode).toBe(400);
  });
});

describe("Newsletter unsubscribe", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("flips an active subscriber to unsubscribed without deleting the row", async () => {
    const { adminCookie } = await setup(ctx);
    await subscribe(ctx, { email: "leaving@example.com" });

    const response = await unsubscribe(ctx, "leaving@example.com");
    expect(response.statusCode).toBe(204);

    const subscribers = await listSubscribers(ctx, adminCookie);
    expect(subscribers).toHaveLength(1);
    expect(subscribers[0]!.status).toBe("unsubscribed");
  });

  it("returns 204 for an email that was never subscribed, so it cannot be used to test who is on the list", async () => {
    const { adminCookie } = await setup(ctx);
    const response = await unsubscribe(ctx, "stranger@example.com");
    expect(response.statusCode).toBe(204);
    // Nothing was created as a side effect of asking.
    expect(await listSubscribers(ctx, adminCookie)).toHaveLength(0);
  });

  it("is idempotent", async () => {
    await subscribe(ctx, { email: "leaving@example.com" });
    expect((await unsubscribe(ctx, "leaving@example.com")).statusCode).toBe(204);
    expect((await unsubscribe(ctx, "leaving@example.com")).statusCode).toBe(204);
  });

  it("reactivates on re-subscribe, preserving the original subscribedAt", async () => {
    const { adminCookie } = await setup(ctx);
    await subscribe(ctx, { email: "backagain@example.com" });
    const original = (await listSubscribers(ctx, adminCookie))[0]!.subscribedAt;
    await unsubscribe(ctx, "backagain@example.com");

    const response = await subscribe(ctx, { email: "backagain@example.com" });
    expect(response.statusCode).toBe(201);

    const subscribers = await listSubscribers(ctx, adminCookie);
    expect(subscribers).toHaveLength(1);
    expect(subscribers[0]!.status).toBe("active");
    expect(subscribers[0]!.subscribedAt).toBe(original);
  });
});

describe("Newsletter subscriber list", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("blocks a non-admin from reading the list, so visitor emails cannot be harvested", async () => {
    const { plainCookie } = await setup(ctx);
    const response = await ctx.app.inject({ method: "GET", url: "/newsletter/subscribers", headers: { cookie: plainCookie } });
    expect(response.statusCode).toBe(403);
  });

  it("requires a session, distinguishing 401 from 403", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/newsletter/subscribers" });
    expect(response.statusCode).toBe(401);
  });

  it("lists newest first", async () => {
    const { adminCookie } = await setup(ctx);
    await subscribe(ctx, { email: "first@example.com" });
    await subscribe(ctx, { email: "second@example.com" });
    await subscribe(ctx, { email: "third@example.com" });

    const subscribers = await listSubscribers(ctx, adminCookie);
    expect(subscribers.map((s) => s.email)).toEqual(["third@example.com", "second@example.com", "first@example.com"]);
  });

  it("searches by partial email, case-insensitively", async () => {
    const { adminCookie } = await setup(ctx);
    await subscribe(ctx, { email: "alice@example.com" });
    await subscribe(ctx, { email: "bob@other.org" });

    expect((await listSubscribers(ctx, adminCookie, "?search=ALICE")).map((s) => s.email)).toEqual(["alice@example.com"]);
    expect((await listSubscribers(ctx, adminCookie, "?search=other.org")).map((s) => s.email)).toEqual(["bob@other.org"]);
    expect(await listSubscribers(ctx, adminCookie, "?search=nobody")).toEqual([]);
  });

  it("filters by status, so real reach can be counted separately from raw signups", async () => {
    const { adminCookie } = await setup(ctx);
    await subscribe(ctx, { email: "staying@example.com" });
    await subscribe(ctx, { email: "leaving@example.com" });
    await unsubscribe(ctx, "leaving@example.com");

    expect((await listSubscribers(ctx, adminCookie, "?status=active")).map((s) => s.email)).toEqual(["staying@example.com"]);
    expect((await listSubscribers(ctx, adminCookie, "?status=unsubscribed")).map((s) => s.email)).toEqual(["leaving@example.com"]);
    expect(await listSubscribers(ctx, adminCookie)).toHaveLength(2);
  });

  it("rejects an unknown status filter", async () => {
    const { adminCookie } = await setup(ctx);
    const response = await ctx.app.inject({
      method: "GET",
      url: "/newsletter/subscribers?status=bogus",
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(400);
  });

  it("combines search and status", async () => {
    const { adminCookie } = await setup(ctx);
    await subscribe(ctx, { email: "alice@example.com" });
    await subscribe(ctx, { email: "alice2@example.com" });
    await unsubscribe(ctx, "alice2@example.com");

    const result = await listSubscribers(ctx, adminCookie, "?search=alice&status=active");
    expect(result.map((s) => s.email)).toEqual(["alice@example.com"]);
  });
});

describe("Newsletter audit", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });

  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("does not audit a visitor acting on their own email — the trail is for privileged admin actions", async () => {
    const { adminCookie } = await setup(ctx);
    await subscribe(ctx, { email: "visitor@example.com" });
    await unsubscribe(ctx, "visitor@example.com");

    const response = await ctx.app.inject({
      method: "GET",
      url: "/audit-logs?tableName=newsletter_subscribers",
      headers: { cookie: adminCookie },
    });
    expect(response.json()).toEqual([]);
  });
});
