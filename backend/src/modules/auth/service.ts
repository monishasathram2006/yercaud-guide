import type pg from "pg";
import { hashPassword, verifyPassword } from "./password.js";
import { BadRequestError, ConflictError, UnauthorizedError } from "../../errors.js";
import { mapUniqueViolation } from "../../db-errors.js";
import { generateUniqueUsername, isValidUsernameFormat } from "./username.js";

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  username: string;
  phone: string | null;
  avatarUrl: string | null;
  bio: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  status: string;
  roles: string[];
  createdAt: string;
  /** Google-verified (or, in future, an in-app verification flow) — null means never verified. */
  emailVerifiedAt: string | null;
  /** Whether the account has a password set at all — false for a Google-only account (issue #13). */
  hasPassword: boolean;
}

export const GENDER_OPTIONS = ["Female", "Male", "Non-binary", "Prefer not to say"] as const;

/** Every SELECT that builds a UserRow uses this, so a new field is added in one place, not seven.
 * date_of_birth is cast to text in SQL rather than left as a DATE: node-postgres's default DATE
 * parser returns a local-midnight JS Date, which can shift a day when reformatted — to_char sidesteps that. */
const USER_COLUMNS = `
  id, email, name, username, phone, avatar_url, bio,
  to_char(date_of_birth, 'YYYY-MM-DD') AS date_of_birth, gender,
  status, created_at, email_verified_at, (password_hash IS NOT NULL) AS has_password
`;

/**
 * A User editing their own profile (Phase 10).
 *
 * Nothing let them: PATCH /users/{userId} is the Super Admin's suspend/reactivate,
 * and /me/* was read-only — so "view and edit my profile" had no backend at all.
 *
 * Email is deliberately not editable here. It's the login identity and the unique
 * key; changing it is an account-recovery flow (verify the new address, don't
 * strand the old one), not a profile edit. Same for password, which has its own
 * reset flow. Roles and status are emphatically not self-editable.
 */
export interface UpdateOwnProfileInput {
  name?: string;
  username?: string;
  phone?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
}

export async function updateOwnProfile(db: pg.Pool, userId: string, input: UpdateOwnProfileInput): Promise<PublicUser> {
  if (input.username !== undefined && !isValidUsernameFormat(input.username)) {
    throw new BadRequestError(
      "Username must be 3-20 characters: lowercase letters, digits or underscores, starting with a letter",
    );
  }

  return mapUniqueViolation(async () => {
    // COALESCE-by-flag rather than COALESCE(value, column): phone, avatarUrl,
    // bio, dateOfBirth and gender are all nullable, so null must mean "clear
    // it" while absent means "leave it alone". username is NOT NULL, so it's
    // a plain COALESCE like name.
    const { rows } = await db.query<UserRow>(
      `UPDATE users SET
         name = COALESCE($2, name),
         username = COALESCE($3, username),
         phone = CASE WHEN $4 THEN $5 ELSE phone END,
         avatar_url = CASE WHEN $6 THEN $7 ELSE avatar_url END,
         bio = CASE WHEN $8 THEN $9 ELSE bio END,
         date_of_birth = CASE WHEN $10 THEN $11::date ELSE date_of_birth END,
         gender = CASE WHEN $12 THEN $13 ELSE gender END
       WHERE id = $1
       RETURNING ${USER_COLUMNS}`,
      [
        userId,
        input.name ?? null,
        input.username ?? null,
        input.phone !== undefined,
        input.phone ?? null,
        input.avatarUrl !== undefined,
        input.avatarUrl ?? null,
        input.bio !== undefined,
        input.bio ?? null,
        input.dateOfBirth !== undefined,
        input.dateOfBirth ?? null,
        input.gender !== undefined,
        input.gender ?? null,
      ],
    );
    const row = rows[0];
    if (!row) throw new UnauthorizedError();
    return toPublicUser(row, await fetchUserRoles(db, userId));
  }, "That username is already taken");
}

/** The frontend's live-typing availability check, ahead of a full submit. Excludes the caller's own current username so keeping it never reads as taken. */
export async function isUsernameAvailable(db: pg.Pool, username: string, callerId: string): Promise<boolean> {
  if (!isValidUsernameFormat(username)) return false;
  const { rows } = await db.query(`SELECT 1 FROM users WHERE username = $1 AND id != $2`, [username, callerId]);
  return rows.length === 0;
}

export interface UserRow {
  id: string;
  email: string;
  name: string;
  username: string;
  phone: string | null;
  avatar_url: string | null;
  bio: string | null;
  date_of_birth: string | null;
  gender: string | null;
  status: string;
  created_at: Date;
  email_verified_at: Date | null;
  has_password: boolean;
}

export function toPublicUser(row: UserRow, roles: string[]): PublicUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    username: row.username,
    phone: row.phone,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    dateOfBirth: row.date_of_birth,
    gender: row.gender,
    status: row.status,
    roles,
    createdAt: row.created_at.toISOString(),
    emailVerifiedAt: row.email_verified_at ? row.email_verified_at.toISOString() : null,
    hasPassword: row.has_password,
  };
}

export async function fetchUserRoles(db: pg.Pool, userId: string): Promise<string[]> {
  const { rows } = await db.query<{ name: string }>(
    `SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1 ORDER BY r.name`,
    [userId],
  );
  return rows.map((r) => r.name);
}

/** Shared by session resolution and anywhere else that needs a user by id, so
 * the row-to-PublicUser mapping (and role lookup) exists in exactly one place. */
export async function getPublicUserById(db: pg.Pool, userId: string): Promise<PublicUser | null> {
  const { rows } = await db.query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  const roles = await fetchUserRoles(db, userId);
  return toPublicUser(row, roles);
}

export async function registerUser(
  db: pg.Pool,
  input: { email: string; password: string; name: string },
): Promise<PublicUser> {
  const existing = await db.query(`SELECT id FROM users WHERE email = $1`, [input.email]);
  if (existing.rows.length > 0) {
    throw new ConflictError("An account with this email already exists");
  }

  const passwordHash = await hashPassword(input.password);
  const username = await generateUniqueUsername(db, input.name);
  const { rows } = await db.query<UserRow>(
    `INSERT INTO users (email, password_hash, name, username)
     VALUES ($1, $2, $3, $4)
     RETURNING ${USER_COLUMNS}`,
    [input.email, passwordHash, input.name, username],
  );

  // A brand-new account can't have roles yet — no query needed.
  return toPublicUser(rows[0], []);
}

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

/**
 * Google sign-in upsert (issue #12): lookup by google_id first (the stable,
 * un-reassignable identity), then by email (auto-link an existing
 * password-based account rather than create a duplicate, per the confirmed
 * spec decision), then create a brand-new passwordless account.
 *
 * password_hash is never touched here — linking must not disturb an existing
 * password login.
 */
export async function upsertGoogleUser(db: pg.Pool, profile: GoogleProfile): Promise<PublicUser> {
  const byGoogleId = await db.query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE google_id = $1`,
    [profile.googleId],
  );
  if (byGoogleId.rows[0]) {
    return toPublicUser(byGoogleId.rows[0], await fetchUserRoles(db, byGoogleId.rows[0].id));
  }

  const byEmail = await db.query<UserRow>(
    `UPDATE users SET google_id = $1, email_verified_at = COALESCE(email_verified_at, NOW())
     WHERE email = $2
     RETURNING ${USER_COLUMNS}`,
    [profile.googleId, profile.email],
  );
  if (byEmail.rows[0]) {
    return toPublicUser(byEmail.rows[0], await fetchUserRoles(db, byEmail.rows[0].id));
  }

  const username = await generateUniqueUsername(db, profile.name);
  const created = await db.query<UserRow>(
    `INSERT INTO users (email, name, username, avatar_url, google_id, email_verified_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING ${USER_COLUMNS}`,
    [profile.email, profile.name, username, profile.avatarUrl, profile.googleId],
  );
  // A brand-new account can't have roles yet — no query needed.
  return toPublicUser(created.rows[0], []);
}

export async function authenticateUser(
  db: pg.Pool,
  input: { email: string; password: string },
): Promise<PublicUser> {
  const { rows } = await db.query<UserRow & { password_hash: string | null }>(
    `SELECT ${USER_COLUMNS}, password_hash FROM users WHERE email = $1`,
    [input.email],
  );

  const row = rows[0];
  // Verify against a dummy hash when no account exists, so timing doesn't
  // reveal whether the email is registered.
  const hashToCheck = row?.password_hash ?? "$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const valid = await verifyPassword(hashToCheck, input.password).catch(() => false);

  if (!row || !valid) {
    throw new UnauthorizedError("Incorrect email or password");
  }

  const roles = await fetchUserRoles(db, row.id);
  return toPublicUser(row, roles);
}

export interface ChangePasswordInput {
  currentPassword?: string;
  newPassword: string;
}

/**
 * Change (or, for a Google-only account with no password yet, set a first)
 * password while signed in — issue #13. Distinct from the forgot-password
 * email/token flow, which continues to exist unchanged.
 *
 * Branches on whether the account already has a password: if it does,
 * currentPassword must verify, same posture as login (401, not a generic
 * validation error). If it doesn't (password_hash is null — a Google-only
 * account), there's nothing to verify, so currentPassword is simply ignored
 * and the new password is set. Either way, google_id is untouched.
 */
export async function changeOwnPassword(db: pg.Pool, userId: string, input: ChangePasswordInput): Promise<void> {
  const { rows } = await db.query<{ password_hash: string | null }>(
    `SELECT password_hash FROM users WHERE id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) throw new UnauthorizedError();

  if (row.password_hash !== null) {
    const valid = input.currentPassword
      ? await verifyPassword(row.password_hash, input.currentPassword).catch(() => false)
      : false;
    if (!valid) throw new UnauthorizedError("Current password is incorrect");
  }

  const newHash = await hashPassword(input.newPassword);
  await db.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [newHash, userId]);
}
