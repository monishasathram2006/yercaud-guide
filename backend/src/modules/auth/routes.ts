import type { FastifyInstance } from "fastify";
import type { MultipartFile } from "@fastify/multipart";
import type { AppDeps } from "../../app.js";
import {
  authenticateUser,
  changeOwnPassword,
  fetchUserRoles,
  getPublicUserById,
  isUsernameAvailable,
  registerUser,
  updateOwnProfile,
  GENDER_OPTIONS,
  type ChangePasswordInput,
  type PublicUser,
  type UpdateOwnProfileInput,
} from "./service.js";
import { assertValidAvatarFile, saveAvatarFile } from "./avatar.js";
import { createSession, deleteSession, setSessionCookie } from "./session.js";
import { confirmPasswordReset, requestPasswordReset } from "./password-reset.js";
import { requireAuth, requirePermission } from "../../plugins/auth.js";
import { BadRequestError, ForbiddenError } from "../../errors.js";
import { logAudit } from "../../audit.js";
import { listUserPermissions } from "../rbac/service.js";
import { config } from "../../config.js";
import { registerGoogleAuthRoutes } from "./google.js";
import { countMyEnquiries } from "../enquiries/service.js";
import { countMyReviews } from "../reviews/service.js";
import { countMyFavorites } from "../favorites/service.js";
import { countOwnedListings } from "../listings/service.js";

interface RegisterBody {
  email: string;
  password: string;
  name: string;
}

interface LoginBody {
  email: string;
  password: string;
}

interface PasswordResetRequestBody {
  email: string;
}

interface PasswordResetConfirmBody {
  token: string;
  password: string;
}

const emailSchema = { type: "string", format: "email" } as const;
const passwordSchema = { type: "string", minLength: 8 } as const;

const registerSchema = {
  body: {
    type: "object",
    required: ["email", "password", "name"],
    properties: { email: emailSchema, password: passwordSchema, name: { type: "string", minLength: 1 } },
  },
};

const loginSchema = {
  body: {
    type: "object",
    required: ["email", "password"],
    properties: { email: emailSchema, password: { type: "string", minLength: 1 } },
  },
};

const passwordResetRequestSchema = {
  body: { type: "object", required: ["email"], properties: { email: emailSchema } },
};

const passwordResetConfirmSchema = {
  body: {
    type: "object",
    required: ["token", "password"],
    properties: { token: { type: "string", minLength: 1 }, password: passwordSchema },
  },
};

const updateOwnProfileSchema = {
  body: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1, maxLength: 255 },
      username: { type: "string", minLength: 3, maxLength: 20 },
      // Nullable: null clears the field, absent leaves it untouched.
      phone: { type: "string", maxLength: 30, nullable: true },
      avatarUrl: { type: "string", nullable: true },
      bio: { type: "string", maxLength: 1000, nullable: true },
      dateOfBirth: { type: "string", format: "date", nullable: true },
      gender: { type: "string", enum: [...GENDER_OPTIONS, null], nullable: true },
    },
    additionalProperties: false,
  },
};

const changePasswordSchema = {
  body: {
    type: "object",
    required: ["newPassword"],
    properties: { currentPassword: { type: "string" }, newPassword: passwordSchema },
    additionalProperties: false,
  },
};

export async function registerAuthRoutes(app: FastifyInstance, deps: Required<AppDeps>): Promise<void> {
  // Register and login return the same enriched shape as /auth/me. Both
  // frontends cache this response as the current user, so omitting permissions
  // here left the Admin panel's gate seeing "no permissions" until a reload.
  app.post<{ Body: RegisterBody }>("/auth/register", { schema: registerSchema }, async (request, reply) => {
    const user = await registerUser(deps.db, request.body);
    const token = await createSession(deps.db, user.id);
    setSessionCookie(reply, token);
    const permissions = await listUserPermissions(deps.db, user.id);
    return reply.status(201).send({ ...user, permissions, impersonatedBy: null });
  });

  app.post<{ Body: LoginBody }>("/auth/login", { schema: loginSchema }, async (request, reply) => {
    const user = await authenticateUser(deps.db, request.body);
    const token = await createSession(deps.db, user.id);
    setSessionCookie(reply, token);
    const permissions = await listUserPermissions(deps.db, user.id);
    return reply.status(200).send({ ...user, permissions, impersonatedBy: null });
  });

  app.get("/auth/me", { preHandler: requireAuth }, async (request) => {
    // Permissions, not just Role names: the Admin panel renders its navigation
    // and actions from these, which is what makes a custom Role usable rather
    // than decorative. Advisory — every endpoint still guards itself.
    const permissions = await listUserPermissions(deps.db, request.currentUser!.id);
    return { ...request.currentUser, permissions, impersonatedBy: request.impersonatedBy };
  });

  /**
   * A User editing their own profile (Phase 10) — the one thing /me could not do.
   *
   * Self-scoped by construction: it acts on request.currentUser, so there is no
   * id in the path to tamper with and no ownership check to get wrong. Email,
   * password, roles and status are all absent from the input on purpose.
   */
  app.patch<{ Body: UpdateOwnProfileInput }>(
    "/me",
    { schema: updateOwnProfileSchema, preHandler: requireAuth },
    async (request) => {
      const user = await updateOwnProfile(deps.db, request.currentUser!.id, request.body);
      const permissions = await listUserPermissions(deps.db, user.id);
      return { ...user, permissions, impersonatedBy: request.impersonatedBy };
    },
  );

  /**
   * Live availability check while the User is typing a new username (issue
   * #14), so rejection doesn't wait for a full form submit. PATCH /me is
   * still the source of truth — this is advisory, same posture as `can`.
   */
  app.get<{ Querystring: { username?: string } }>(
    "/me/username-available",
    { preHandler: requireAuth },
    async (request) => {
      const { username } = request.query;
      if (!username) {
        throw new BadRequestError("username is required");
      }
      const available = await isUsernameAvailable(deps.db, username, request.currentUser!.id);
      return { available };
    },
  );

  /**
   * Real avatar upload (issue #14), replacing the client's blob:-URL
   * workaround. Reuses the on-disk storage and static-serving approach from
   * listings/images.ts; validation (JPEG/PNG/WEBP, 2 MB cap) is new here —
   * neither existed on the shared pattern before.
   */
  app.post("/me/avatar", { preHandler: requireAuth }, async (request, reply) => {
    const body = request.body as { file?: MultipartFile };
    if (!body.file) {
      throw new BadRequestError("A file is required");
    }
    const buffer = await body.file.toBuffer();
    assertValidAvatarFile(body.file.mimetype, buffer);
    const avatarUrl = await saveAvatarFile(request.currentUser!.id, body.file.mimetype, buffer);
    const user = await updateOwnProfile(deps.db, request.currentUser!.id, { avatarUrl });
    const permissions = await listUserPermissions(deps.db, user.id);
    return reply.status(201).send({ ...user, permissions, impersonatedBy: request.impersonatedBy });
  });

  /**
   * My Statistics (issue #13) — one aggregate rather than four round trips.
   * Composed here, not in any one domain module, the same way /auth/me
   * already reaches into rbac/service.js for permissions.
   */
  app.get("/me/stats", { preHandler: requireAuth }, async (request) => {
    const userId = request.currentUser!.id;
    const [enquiries, reviews, favorites, listings] = await Promise.all([
      countMyEnquiries(deps.db, userId),
      countMyReviews(deps.db, userId),
      countMyFavorites(deps.db, userId),
      countOwnedListings(deps.db, userId),
    ]);
    return { enquiries, reviews, favorites, listings };
  });

  app.post<{ Body: ChangePasswordInput }>(
    "/me/password",
    { schema: changePasswordSchema, preHandler: requireAuth },
    async (request, reply) => {
      await changeOwnPassword(deps.db, request.currentUser!.id, request.body);
      return reply.status(204).send();
    },
  );

  app.post("/auth/logout", async (request, reply) => {
    const token = request.cookies[config.sessionCookieName];
    if (token) {
      await deleteSession(deps.db, token);
      // Attributes must match the ones it was set with, or the browser keeps it.
      reply.clearCookie(config.sessionCookieName, { path: "/", sameSite: "lax", secure: config.secureCookies });
    }
    return reply.status(204).send();
  });

  // Super Admin "view as" a Business Owner (FR160). Target must hold the
  // Business Owner role and must not also hold Super Admin — there's
  // nothing meaningful to "view as" for a roleless visitor, and impersonating
  // a peer admin would let this be used to silently take over their account.
  app.post<{ Params: { userId: string } }>(
    "/users/:userId/impersonate",
    { preHandler: requirePermission(deps.db, "Users", "edit") },
    async (request, reply) => {
      const targetId = request.params.userId;
      const targetRoles = await fetchUserRoles(deps.db, targetId);
      if (targetRoles.includes("Super Admin")) {
        throw new ForbiddenError("Cannot impersonate a Super Admin");
      }
      if (!targetRoles.includes("Business Owner")) {
        throw new ForbiddenError("Can only impersonate a Business Owner");
      }

      const token = await createSession(deps.db, targetId, request.currentUser!.id);
      setSessionCookie(reply, token);
      await logAudit(deps.db, {
        actorId: request.currentUser!.id,
        action: "auth.impersonate_start",
        tableName: "users",
        recordId: targetId,
      });

      const targetUser = (await getPublicUserById(deps.db, targetId)) as PublicUser;
      return reply.status(200).send({ ...targetUser, impersonatedBy: request.currentUser!.id });
    },
  );

  app.post("/auth/exit-impersonation", { preHandler: requireAuth }, async (request, reply) => {
    if (!request.impersonatedBy) {
      throw new ForbiddenError("Not currently impersonating anyone");
    }
    const adminId = request.impersonatedBy;
    const impersonatedUserId = request.currentUser!.id;

    const token = request.cookies[config.sessionCookieName]!;
    await deleteSession(deps.db, token); // single-use — can't be reused after exit

    const newToken = await createSession(deps.db, adminId);
    setSessionCookie(reply, newToken);
    await logAudit(deps.db, {
      actorId: adminId,
      action: "auth.impersonate_end",
      tableName: "users",
      recordId: impersonatedUserId,
    });

    const adminUser = (await getPublicUserById(deps.db, adminId)) as PublicUser;
    return { ...adminUser, impersonatedBy: null };
  });

  app.post<{ Body: PasswordResetRequestBody }>(
    "/auth/password-reset/request",
    { schema: passwordResetRequestSchema },
    async (request, reply) => {
      await requestPasswordReset(deps.db, request.body.email, deps.sendPasswordResetEmail);
      return reply.status(202).send();
    },
  );

  app.post<{ Body: PasswordResetConfirmBody }>(
    "/auth/password-reset/confirm",
    { schema: passwordResetConfirmSchema },
    async (request, reply) => {
      await confirmPasswordReset(deps.db, request.body.token, request.body.password);
      return reply.status(204).send();
    },
  );

  await registerGoogleAuthRoutes(app, deps);
}
