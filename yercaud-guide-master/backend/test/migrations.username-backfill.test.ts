import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { runner as migrationRunner } from "node-pg-migrate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The username backfill (issue #14) runs once, against whatever rows already
 * exist when the migration lands. This drives it against a scratch database
 * seeded with pre-existing rows — including colliding names — the way it
 * would actually run against production data, rather than asserting on the
 * migration's SQL text.
 */

const ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL ?? "postgres://yercaud:yercaud@localhost:5432/postgres";
const DB_NAME = "yercaud_username_backfill_test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../migrations");
const ALL_MIGRATIONS = [
  "1784278800000_baseline",
  "1784278860000_listing-price",
  "1784278920000_badges",
  "1784278980000_listing-first-published",
  "1784279040000_contact-messages",
  "1784279100000_blog-post-og",
  "1784312976708_search-embeddings",
  "1784558303998_google-oauth",
];
const USERNAME_MIGRATION = "1784600000000_username-dob-gender";

let db: pg.Client;
const dbUrl = ADMIN_URL.replace(/\/[^/]+$/, `/${DB_NAME}`);

describe("username backfill migration", () => {
  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME}`);
    await admin.query(`CREATE DATABASE ${DB_NAME}`);
    await admin.end();

    // Every migration up to (not including) the username one — the schema state a real deploy backfills against.
    await migrationRunner({
      databaseUrl: dbUrl,
      dir: migrationsDir,
      direction: "up",
      migrationsTable: "pgmigrations",
      log: () => {},
      count: ALL_MIGRATIONS.length,
    });

    db = new pg.Client({ connectionString: dbUrl });
    await db.connect();

    // Pre-existing rows, including two with colliding names, and one with a
    // name that has no usable slug characters at all.
    await db.query(
      `INSERT INTO users (email, password_hash, name, created_at) VALUES
        ('a@example.com', 'hash', 'Ravi Kumar', NOW() - interval '3 days'),
        ('b@example.com', 'hash', 'Ravi Kumar', NOW() - interval '2 days'),
        ('c@example.com', 'hash', '数字だけ', NOW() - interval '1 day')`,
    );

    await migrationRunner({
      databaseUrl: dbUrl,
      dir: migrationsDir,
      direction: "up",
      migrationsTable: "pgmigrations",
      log: () => {},
      file: USERNAME_MIGRATION,
    });
  });

  afterAll(async () => {
    await db.end();
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME}`);
    await admin.end();
  });

  it("gives every pre-existing row a unique, valid-format username", async () => {
    const { rows } = await db.query<{ email: string; username: string }>(`SELECT email, username FROM users ORDER BY created_at`);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.username).toMatch(/^[a-z][a-z0-9_]{2,19}$/);
    }
    expect(new Set(rows.map((r) => r.username)).size).toBe(3);
  });

  it("resolves the colliding 'Ravi Kumar' pair to two distinct usernames", async () => {
    const { rows } = await db.query<{ username: string }>(
      `SELECT username FROM users WHERE email IN ('a@example.com', 'b@example.com')`,
    );
    expect(rows[0].username).not.toBe(rows[1].username);
  });

  it("falls back to a 'user'-prefixed username when the name has no usable ASCII characters", async () => {
    const { rows } = await db.query<{ username: string }>(`SELECT username FROM users WHERE email = 'c@example.com'`);
    expect(rows[0].username).toMatch(/^user/);
  });
});
