import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { requirePermission } from "../../plugins/auth.js";
import {
  createContactMessage,
  listContactMessages,
  setContactMessageStatus,
  type ContactMessageInput,
  type ContactMessageStatus,
} from "./contact-messages.js";
import { BadRequestError } from "../../errors.js";

const CONTACT_STATUSES = ["sent", "responded", "closed"] as const;

/** FR128's character limit, enforced where the form promises it. */
const MESSAGE_MAX_LENGTH = 1000;

const submitSchema = {
  body: {
    type: "object",
    required: ["name", "email", "subject", "message", "consented"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 255 },
      email: { type: "string", format: "email", maxLength: 255 },
      // Free text: the dropdown's options are editorial copy a Super Admin edits
      // through Content Blocks, not a fixed vocabulary the backend owns.
      subject: { type: "string", minLength: 1, maxLength: 255 },
      phone: { type: "string", maxLength: 30, nullable: true },
      message: { type: "string", minLength: 1, maxLength: MESSAGE_MAX_LENGTH },
      consented: { type: "boolean" },
    },
  },
};

const statusSchema = {
  body: {
    type: "object",
    required: ["status"],
    properties: { status: { type: "string", enum: CONTACT_STATUSES } },
  },
};

export function registerContactMessageRoutes(app: FastifyInstance, deps: Required<AppDeps>): void {
  // Public and unauthenticated, mirroring Enquiry submission: a question to the
  // platform shouldn't be gated behind a signup.
  app.post<{ Body: ContactMessageInput }>("/contact-messages", { schema: submitSchema }, async (request, reply) => {
    if (!request.body.consented) {
      // FR128's Privacy Policy checkbox. Refused rather than recorded as false:
      // storing a message whose sender declined consent gives us data we were
      // told not to hold.
      throw new BadRequestError("Consent to the Privacy Policy is required");
    }
    const message = await createContactMessage(deps.db, request.body, request.currentUser?.id ?? null);
    return reply.status(201).send(message);
  });

  // Guarded by Content, not Enquiries. Business Owners hold Enquiries:view for
  // their own inbox — messages addressed to the platform are not theirs to read.
  app.get<{ Querystring: { status?: ContactMessageStatus } }>(
    "/contact-messages",
    {
      schema: { querystring: { type: "object", properties: { status: { type: "string", enum: CONTACT_STATUSES } } } },
      preHandler: requirePermission(deps.db, "Content", "view"),
    },
    async (request) => {
      return listContactMessages(deps.db, { status: request.query.status });
    },
  );

  app.patch<{ Body: { status: ContactMessageStatus }; Params: { messageId: string } }>(
    "/contact-messages/:messageId/status",
    { schema: statusSchema, preHandler: requirePermission(deps.db, "Content", "edit") },
    async (request) => {
      return setContactMessageStatus(deps.db, request.params.messageId, request.body.status);
    },
  );
}
