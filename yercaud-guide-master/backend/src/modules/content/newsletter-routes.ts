import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { requirePermission } from "../../plugins/auth.js";
import {
  listSubscribers,
  subscribe,
  unsubscribe,
  type SubscribeInput,
  type SubscriberStatus,
} from "./newsletter.js";

/** Matches the column: newsletter_subscribers.email is VARCHAR(255). */
const emailProperty = { type: "string", format: "email", maxLength: 255 };

const subscribeSchema = {
  body: {
    type: "object",
    required: ["email"],
    properties: {
      email: emailProperty,
      source: { type: "string", maxLength: 100 },
    },
  },
};

const unsubscribeSchema = {
  body: {
    type: "object",
    required: ["email"],
    properties: { email: emailProperty },
  },
};

const listSchema = {
  querystring: {
    type: "object",
    properties: {
      search: { type: "string" },
      status: { type: "string", enum: ["active", "unsubscribed"] },
    },
  },
};

interface ListQuery {
  search?: string;
  status?: SubscriberStatus;
}

export function registerNewsletterRoutes(app: FastifyInstance, deps: Required<AppDeps>): void {
  // Public: subscribing is one field and one click, with no account (FR6, FR108).
  app.post<{ Body: SubscribeInput }>("/newsletter/subscribe", { schema: subscribeSchema }, async (request, reply) => {
    const subscriber = await subscribe(deps.db, request.body);
    return reply.status(201).send(subscriber);
  });

  // Added to the contract by Phase 9: the schema's status check has always
  // allowed 'unsubscribed', which was an unreachable state without this.
  // Unauthenticated and always 204 — see unsubscribe()'s note on enumeration.
  app.post<{ Body: { email: string } }>(
    "/newsletter/unsubscribe",
    { schema: unsubscribeSchema },
    async (request, reply) => {
      await unsubscribe(deps.db, request.body.email);
      return reply.status(204).send();
    },
  );

  // Neither Business Owner role holds `Content:view`, so this is Super Admin only —
  // a Business Owner must not be able to harvest visitor email addresses.
  app.get<{ Querystring: ListQuery }>(
    "/newsletter/subscribers",
    { schema: listSchema, preHandler: requirePermission(deps.db, "Content", "view") },
    async (request) => {
      return listSubscribers(deps.db, { search: request.query.search, status: request.query.status });
    },
  );
}
