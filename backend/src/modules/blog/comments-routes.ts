import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../../app.js";
import { requireAuth, requirePermission } from "../../plugins/auth.js";
import { logAudit } from "../../audit.js";
import { requirePublishedPost } from "./posts.js";
import { approveComment, getComment, listApprovedComments, listComments, rejectComment, submitComment } from "./comments.js";

const commentSchema = {
  body: { type: "object", required: ["body"], properties: { body: { type: "string", minLength: 1 } } },
};

export function registerBlogCommentRoutes(app: FastifyInstance, deps: Required<AppDeps>): void {
  app.get<{ Params: { postId: string } }>("/blog-posts/:postId/comments", async (request) => {
    return listApprovedComments(deps.db, request.params.postId);
  });

  app.post<{ Params: { postId: string }; Body: { body: string } }>(
    "/blog-posts/:postId/comments",
    { schema: commentSchema, preHandler: requireAuth },
    async (request, reply) => {
      await requirePublishedPost(deps.db, request.params.postId);
      const comment = await submitComment(deps.db, request.params.postId, request.currentUser!.id, request.body.body);
      return reply.status(201).send(comment);
    },
  );

  app.get<{ Querystring: { status?: string } }>(
    "/blog-comments",
    { preHandler: requirePermission(deps.db, "Content", "view") },
    async (request) => {
      return listComments(deps.db, request.query.status);
    },
  );

  app.post<{ Params: { commentId: string } }>(
    "/blog-comments/:commentId/approve",
    { preHandler: requirePermission(deps.db, "Content", "approve") },
    async (request) => {
      const before = await getComment(deps.db, request.params.commentId);
      const comment = await approveComment(deps.db, request.params.commentId);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "blog_comments.approve",
        tableName: "blog_comments",
        recordId: comment.id,
        oldData: { status: before.status },
        newData: { status: comment.status },
      });
      return comment;
    },
  );

  app.post<{ Params: { commentId: string } }>(
    "/blog-comments/:commentId/reject",
    { preHandler: requirePermission(deps.db, "Content", "approve") },
    async (request) => {
      const before = await getComment(deps.db, request.params.commentId);
      const comment = await rejectComment(deps.db, request.params.commentId);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "blog_comments.reject",
        tableName: "blog_comments",
        recordId: comment.id,
        oldData: { status: before.status },
        newData: { status: comment.status },
      });
      return comment;
    },
  );
}
