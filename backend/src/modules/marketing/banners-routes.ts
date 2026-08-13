import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { requirePermission } from "../../plugins/auth.js";
import { logAudit } from "../../audit.js";
import {
  createBanner,
  deleteBanner,
  getBanner,
  listBanners,
  updateBanner,
  type BannerInput,
  type UpdateBannerInput,
} from "./banners.js";

const bannerCreateSchema = {
  body: {
    type: "object",
    required: ["title", "imageUrl", "placement"],
    properties: {
      title: { type: "string", minLength: 1 },
      imageUrl: { type: "string", minLength: 1 },
      linkUrl: { type: "string", nullable: true },
      placement: { type: "string", minLength: 1 },
      sortOrder: { type: "integer" },
      // Settable on create, unlike a Promotion's — see createBanner's note.
      status: { type: "string", enum: ["draft", "active", "expired"] },
      startDate: { type: "string", format: "date", nullable: true },
      endDate: { type: "string", format: "date", nullable: true },
    },
  },
};

const bannerUpdateSchema = {
  body: {
    type: "object",
    properties: {
      title: { type: "string", minLength: 1 },
      imageUrl: { type: "string", minLength: 1 },
      linkUrl: { type: "string", nullable: true },
      placement: { type: "string", minLength: 1 },
      sortOrder: { type: "integer" },
      status: { type: "string", enum: ["draft", "active", "expired"] },
      startDate: { type: "string", format: "date", nullable: true },
      endDate: { type: "string", format: "date", nullable: true },
    },
  },
};

/** Site-wide placements are a Super Admin concern — no ownership branch anywhere. */
export function registerBannerRoutes(app: FastifyInstance, deps: Required<AppDeps>): void {
  app.get<{ Querystring: { placement?: string } }>("/banners", async (request) => {
    return listBanners(deps.db, request.query.placement);
  });

  app.post<{ Body: BannerInput }>(
    "/banners",
    { schema: bannerCreateSchema, preHandler: requirePermission(deps.db, "Marketing", "create") },
    async (request, reply) => {
      const banner = await createBanner(deps.db, request.body);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "banners.create",
        tableName: "banners",
        recordId: banner.id,
        newData: banner,
      });
      return reply.status(201).send(banner);
    },
  );

  app.patch<{ Params: { bannerId: string }; Body: UpdateBannerInput }>(
    "/banners/:bannerId",
    { schema: bannerUpdateSchema, preHandler: requirePermission(deps.db, "Marketing", "edit") },
    async (request) => {
      const before = await getBanner(deps.db, request.params.bannerId);
      const banner = await updateBanner(deps.db, request.params.bannerId, request.body);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "banners.update",
        tableName: "banners",
        recordId: banner.id,
        oldData: before,
        newData: banner,
      });
      return banner;
    },
  );

  app.delete<{ Params: { bannerId: string } }>(
    "/banners/:bannerId",
    { preHandler: requirePermission(deps.db, "Marketing", "delete") },
    async (request, reply) => {
      const before = await getBanner(deps.db, request.params.bannerId);
      await deleteBanner(deps.db, request.params.bannerId);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "banners.delete",
        tableName: "banners",
        recordId: request.params.bannerId,
        oldData: before,
      });
      return reply.status(204).send();
    },
  );
}
