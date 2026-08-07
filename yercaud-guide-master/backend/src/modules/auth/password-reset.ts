import type pg from "pg";
import { generateOpaqueToken, hashOpaqueToken } from "./session.js";
import { hashPassword } from "./password.js";
import { BadRequestError } from "../../errors.js";

const RESET_TOKEN_TTL_HOURS = 1;

export async function requestPasswordReset(
  db: pg.Pool,
  email: string,
  sendEmail: (email: string, token: string) => Promise<void>,
): Promise<void> {
  const { rows } = await db.query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [email]);
  const user = rows[0];
  if (!user) return; // Same 202 either way — no account enumeration.

  const token = generateOpaqueToken();
  const tokenHash = hashOpaqueToken(token);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_HOURS * 60 * 60 * 1000);

  await db.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [user.id, tokenHash, expiresAt],
  );

  await sendEmail(email, token);
}

export async function confirmPasswordReset(db: pg.Pool, token: string, newPassword: string): Promise<void> {
  const tokenHash = hashOpaqueToken(token);
  const { rows } = await db.query<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM password_reset_tokens
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [tokenHash],
  );
  const resetToken = rows[0];
  if (!resetToken) {
    throw new BadRequestError("This reset link is invalid or has expired");
  }

  const passwordHash = await hashPassword(newPassword);
  await db.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, resetToken.user_id]);
  await db.query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`, [resetToken.id]);
}
