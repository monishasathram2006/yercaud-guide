import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { requirePermission } from "../../plugins/auth.js";
import { logAudit } from "../../audit.js";
import {
  getContentBlockRecord,
  listContentBlocks,
  toContentBlock,
  upsertContentBlock,
} from "./blocks.js";

/**
 * `content` must be an object, not an array or a scalar: the column defaults to
 * '{}' and every real block has named fields, so allowing a bare array would
 * make every consumer type-check the body before reading it. Deliberately no
 * `additionalProperties: false` — the whole point of the block is that a section
 * can hold whatever shape the page needs without a backend change.
 */
const upsertSchema = {
  body: {
    type: "object",
    required: ["content"],
    properties: { content: { type: "object" } },
  },
};

interface BlockParams {
  pageSlug: string;
  blockKey: string;
}

export function registerContentBlockRoutes(app: FastifyInstance, deps: Required<AppDeps>): void {
  app.get<{ Params: { pageSlug: string } }>("/content-blocks/:pageSlug", async (request) => {
    return listContentBlocks(deps.db, request.params.pageSlug);
  });

  // PUT-upserts rather than the POST/PATCH split the taxonomy and FAQ modules
  // use: those are lists an admin curates, this is a slot the frontend already
  // knows the name of. One permission for both create and edit — an admin who
  // may reword the mission statement may also write it in the first place.
  app.put<{ Params: BlockParams; Body: { content: Record<string, unknown> } }>(
    "/content-blocks/:pageSlug/:blockKey",
    { schema: upsertSchema, preHandler: requirePermission(deps.db, "Content", "edit") },
    async (request) => {
      const { pageSlug, blockKey } = request.params;
      const before = await getContentBlockRecord(deps.db, pageSlug, blockKey);
      const record = await upsertContentBlock(deps.db, {
        pageSlug,
        blockKey,
        content: request.body.content,
        updatedBy: request.currentUser!.id,
      });
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "content_blocks.upsert",
        tableName: "content_blocks",
        recordId: record.id,
        // Absent on a create — which is how the trail tells a create from an
        // edit without needing a second action name.
        oldData: before ?? undefined,
        newData: record,
      });
      return toContentBlock(record);
    },
  );
}
