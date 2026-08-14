import type { FastifyInstance } from "fastify";
import type { MultipartFile } from "@fastify/multipart";
import type { AppDeps } from "../../app.js";
import { requirePermission } from "../../plugins/auth.js";
import { BadRequestError } from "../../errors.js";
import { getBlogPost } from "./posts.js";
import {
  assertValidBlogCoverImageFile,
  deleteBlogCoverImageFile,
  saveBlogCoverImageFile,
  saveBlogSocialImageFile,
  setBlogPostCoverImage,
  setBlogPostSocialImage,
} from "./images.js";

interface ImageUploadBody {
  file?: MultipartFile;
}

/** One cover image and one social-share image per post (not a gallery) — mirrors listings/images-routes.ts, simplified. */
export function registerBlogImageRoutes(app: FastifyInstance, deps: Required<AppDeps>): void {
  app.post<{ Params: { postId: string } }>(
    "/blog-posts/:postId/cover-image",
    { preHandler: requirePermission(deps.db, "Content", "edit") },
    async (request, reply) => {
      const body = request.body as ImageUploadBody;
      if (!body.file) {
        throw new BadRequestError("A file is required");
      }

      const { postId } = request.params;
      const before = await getBlogPost(deps.db, postId);
      const buffer = await body.file.toBuffer();
      assertValidBlogCoverImageFile(body.file.mimetype, buffer);
      const url = await saveBlogCoverImageFile(postId, body.file.mimetype, buffer);
      await setBlogPostCoverImage(deps.db, postId, url);
      // Old file is orphaned disk space once the column points elsewhere — clean it up.
      // Only for files this route itself wrote; a pasted external coverImage URL isn't ours to delete.
      if (before.coverImage?.startsWith("/uploads/blog-posts/")) {
        await deleteBlogCoverImageFile(before.coverImage);
      }
      const post = await getBlogPost(deps.db, postId);
      return reply.status(201).send(post);
    },
  );

  // Same shape as cover-image above, targeting og_image instead — the mockup's
  // "Social Share Image" is the Open Graph/Twitter card image (FR189).
  app.post<{ Params: { postId: string } }>(
    "/blog-posts/:postId/social-image",
    { preHandler: requirePermission(deps.db, "Content", "edit") },
    async (request, reply) => {
      const body = request.body as ImageUploadBody;
      if (!body.file) {
        throw new BadRequestError("A file is required");
      }

      const { postId } = request.params;
      const before = await getBlogPost(deps.db, postId);
      const buffer = await body.file.toBuffer();
      assertValidBlogCoverImageFile(body.file.mimetype, buffer);
      const url = await saveBlogSocialImageFile(postId, body.file.mimetype, buffer);
      await setBlogPostSocialImage(deps.db, postId, url);
      if (before.ogImage?.startsWith("/uploads/blog-posts/")) {
        await deleteBlogCoverImageFile(before.ogImage);
      }
      const post = await getBlogPost(deps.db, postId);
      return reply.status(201).send(post);
    },
  );
}
