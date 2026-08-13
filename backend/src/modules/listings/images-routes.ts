import type { FastifyInstance } from "fastify";
import type { MultipartFile, MultipartValue } from "@fastify/multipart";
import type { AppDeps } from "../../app.js";
import { requireOwnerOrPermission } from "../../plugins/auth.js";
import { BadRequestError } from "../../errors.js";
import { loadListingOwnerId } from "./service.js";
import { deleteListingImage, deleteListingImageFile, insertListingImage, saveListingImageFile } from "./images.js";

interface ImageUploadBody {
  file?: MultipartFile;
  caption?: MultipartValue<string>;
}

export function registerListingImageRoutes(app: FastifyInstance, deps: Required<AppDeps>): void {
  app.post<{ Params: { listingId: string } }>(
    "/listings/:listingId/images",
    { preHandler: requireOwnerOrPermission(deps.db, "listingId", loadListingOwnerId, "Listings", "edit") },
    async (request, reply) => {
      const body = request.body as ImageUploadBody;
      if (!body.file) {
        throw new BadRequestError("A file is required");
      }

      const { listingId } = request.params;
      const buffer = await body.file.toBuffer();
      const url = await saveListingImageFile(listingId, body.file.filename, buffer);
      const image = await insertListingImage(deps.db, listingId, url, body.caption?.value);
      return reply.status(201).send(image);
    },
  );

  app.delete<{ Params: { listingId: string; imageId: string } }>(
    "/listings/:listingId/images/:imageId",
    { preHandler: requireOwnerOrPermission(deps.db, "listingId", loadListingOwnerId, "Listings", "edit") },
    async (request, reply) => {
      const url = await deleteListingImage(deps.db, request.params.listingId, request.params.imageId);
      await deleteListingImageFile(url);
      return reply.status(204).send();
    },
  );
}
