import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { runner as migrationRunner } from "node-pg-migrate";

const ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL ?? "postgres://yercaud:yercaud@localhost:5432/postgres";
const TEST_DB_NAME = "yercaud_directory_test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../migrations");
const seedRolesPath = path.resolve(__dirname, "../../database/seed-roles.sql");

export async function setup(): Promise<void> {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
  await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  await admin.end();

  const testUrl = ADMIN_URL.replace(/\/[^/]+$/, `/${TEST_DB_NAME}`);

  // The schema is built by the same migrations production runs (Phase 10) —
  // not from a schema file this bootstrap reads. A test suite that constructs
  // its schema a different way than production does is a suite that can be
  // green against a schema nobody deploys.
  await migrationRunner({
    databaseUrl: testUrl,
    dir: migrationsDir,
    direction: "up",
    migrationsTable: "pgmigrations",
    log: () => {},
  });

  // Reference data stays a plain SQL file rather than a migration: helpers.ts
  // re-runs this one on every resetDb, which a migration can't serve.
  const testDb = new pg.Client({ connectionString: testUrl });
  await testDb.connect();
  await testDb.query(readFileSync(seedRolesPath, "utf8"));
  await testDb.end();
}
