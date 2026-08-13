// Story 27 (Phase 1 spec): "As a Super Admin, I want my own account seeded on
// first setup, so I'm not locked out of an empty system with no way to
// create the first admin." Idempotent — safe to run more than once.
//
// Usage: ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... ADMIN_NAME="You" npm run bootstrap:admin

import { pool } from "../src/db.js";
import { hashPassword } from "../src/modules/auth/password.js";
import { generateUniqueUsername } from "../src/modules/auth/username.js";

async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? "Super Admin";

  if (!email || !password) {
    console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD (ADMIN_NAME is optional).");
    process.exitCode = 1;
    return;
  }
  if (password.length < 8) {
    console.error("ADMIN_PASSWORD must be at least 8 characters.");
    process.exitCode = 1;
    return;
  }

  const { rows: existingAdmins } = await pool.query(
    `SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.name = 'Super Admin' LIMIT 1`,
  );
  if (existingAdmins.length > 0) {
    console.log("A Super Admin already exists — nothing to do.");
    return;
  }

  const passwordHash = await hashPassword(password);
  const username = await generateUniqueUsername(pool, name);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, name, username)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING id`,
    [email, passwordHash, name, username],
  );
  const userId = rows[0].id;

  await pool.query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT $1, id FROM roles WHERE name = 'Super Admin'
     ON CONFLICT DO NOTHING`,
    [userId],
  );

  console.log(`Super Admin ready: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
