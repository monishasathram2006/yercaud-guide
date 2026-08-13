import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, closeTestApp, grantRole, registerAndGetCookie, resetDb, type TestContext } from "./helpers.js";

/**
 * FR128's "Send Us a Message" — flagged by Phase 9 as an unplanned gap and left
 * unbuilt. Not an Enquiry: an Enquiry goes to a Business and requires a Listing
 * (CONTEXT.md), and a message to the platform has neither.
 */

const VALID = {
  name: "Asha",
  email: "asha@example.com",
  subject: "General Enquiry",
  message: "Do you list homestays in Kottachedu?",
  consented: true,
};

async function admin(ctx: TestContext) {
  const { cookie, userId } = await registerAndGetCookie(ctx, "admin@example.com");
  await grantRole(ctx.db, userId, "Super Admin");
  return cookie;
}

async function submit(ctx: TestContext, payload: Record<string, unknown>, cookie?: string) {
  return ctx.app.inject({
    method: "POST",
    url: "/contact-messages",
    ...(cookie ? { headers: { cookie } } : {}),
    payload,
  });
}

describe("Contact messages (FR128)", () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await buildTestApp();
    await resetDb(ctx.db);
  });
  afterEach(async () => {
    await closeTestApp(ctx);
  });

  it("accepts a message from a visitor with no account", async () => {
    const res = await submit(ctx, VALID);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ name: "Asha", subject: "General Enquiry", status: "sent", userId: null });
  });

  it("attributes a message to a signed-in User", async () => {
    const { cookie, userId } = await registerAndGetCookie(ctx, "asha@example.com");
    const res = await submit(ctx, VALID, cookie);
    expect(res.json().userId).toBe(userId);
  });

  it("takes any subject, because the dropdown's options are editable copy", async () => {
    // contactContent.subjects lives in Content Blocks for a Super Admin to edit;
    // a database enum would mean a migration to add "Careers" to a dropdown.
    const res = await submit(ctx, { ...VALID, subject: "Something Nobody Predicted" });
    expect(res.statusCode).toBe(201);
    expect(res.json().subject).toBe("Something Nobody Predicted");
  });

  it("records that consent was given, rather than only checking it", async () => {
    const res = await submit(ctx, VALID);
    // The point of a consent checkbox is being able to show it was ticked.
    expect(res.json().consented).toBe(true);
  });

  it("refuses a message without Privacy Policy consent", async () => {
    const res = await submit(ctx, { ...VALID, consented: false });
    expect(res.statusCode).toBe(400);
    const list = await ctx.db.query(`SELECT 1 FROM contact_messages`);
    // Storing it as consented=false would keep data we were told not to hold.
    expect(list.rows).toHaveLength(0);
  });

  it("rejects a malformed email", async () => {
    expect((await submit(ctx, { ...VALID, email: "not-an-email" })).statusCode).toBe(400);
  });

  it("enforces the form's character limit", async () => {
    expect((await submit(ctx, { ...VALID, message: "x".repeat(1001) })).statusCode).toBe(400);
    expect((await submit(ctx, { ...VALID, message: "x".repeat(1000) })).statusCode).toBe(201);
  });

  it("accepts an optional phone and allows it to be absent", async () => {
    expect((await submit(ctx, { ...VALID, phone: "+91 98765 43210" })).json().phone).toBe("+91 98765 43210");
    expect((await submit(ctx, VALID)).json().phone).toBeNull();
  });

  it("lets a Super Admin read the inbox, newest first", async () => {
    const adminCookie = await admin(ctx);
    await submit(ctx, { ...VALID, subject: "First" });
    await submit(ctx, { ...VALID, subject: "Second" });

    const res = await ctx.app.inject({ method: "GET", url: "/contact-messages", headers: { cookie: adminCookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().map((m: { subject: string }) => m.subject)).toEqual(["Second", "First"]);
  });

  it("keeps the inbox away from a Business Owner", async () => {
    const { cookie, userId } = await registerAndGetCookie(ctx, "owner@example.com");
    await grantRole(ctx.db, userId, "Business Owner");
    // A Business Owner holds Enquiries:view for their own inbox. Messages to
    // the platform are not theirs to read — hence Content, not Enquiries.
    const res = await ctx.app.inject({ method: "GET", url: "/contact-messages", headers: { cookie } });
    expect(res.statusCode).toBe(403);
  });

  it("keeps the inbox away from anonymous visitors", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/contact-messages" });
    expect(res.statusCode).toBe(401);
  });

  it("moves a message through its statuses rather than deleting it (ADR 0010)", async () => {
    const adminCookie = await admin(ctx);
    const id = (await submit(ctx, VALID)).json().id;

    const responded = await ctx.app.inject({
      method: "PATCH",
      url: `/contact-messages/${id}/status`,
      headers: { cookie: adminCookie },
      payload: { status: "responded" },
    });
    expect(responded.json().status).toBe("responded");

    await ctx.app.inject({
      method: "PATCH",
      url: `/contact-messages/${id}/status`,
      headers: { cookie: adminCookie },
      payload: { status: "closed" },
    });
    const list = await ctx.app.inject({ method: "GET", url: "/contact-messages?status=closed", headers: { cookie: adminCookie } });
    expect(list.json()).toHaveLength(1);
  });

  it("filters the inbox by status", async () => {
    const adminCookie = await admin(ctx);
    const id = (await submit(ctx, { ...VALID, subject: "Answered" })).json().id;
    await submit(ctx, { ...VALID, subject: "Waiting" });
    await ctx.app.inject({
      method: "PATCH",
      url: `/contact-messages/${id}/status`,
      headers: { cookie: adminCookie },
      payload: { status: "responded" },
    });

    const open = await ctx.app.inject({ method: "GET", url: "/contact-messages?status=sent", headers: { cookie: adminCookie } });
    expect(open.json().map((m: { subject: string }) => m.subject)).toEqual(["Waiting"]);
  });

  it("rejects an unknown status", async () => {
    const adminCookie = await admin(ctx);
    const id = (await submit(ctx, VALID)).json().id;
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/contact-messages/${id}/status`,
      headers: { cookie: adminCookie },
      payload: { status: "incinerated" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("404s on a message that does not exist", async () => {
    const adminCookie = await admin(ctx);
    const res = await ctx.app.inject({
      method: "PATCH",
      url: "/contact-messages/00000000-0000-0000-0000-000000000000/status",
      headers: { cookie: adminCookie },
      payload: { status: "closed" },
    });
    expect(res.statusCode).toBe(404);
  });
});
