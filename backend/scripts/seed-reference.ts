// Reference data every environment needs: the system Roles and their
// permissions, and the master taxonomies (Phase 10).
//
// Reference data stays a plain SQL file rather than a migration for two
// reasons: test/helpers.ts re-runs seed-roles.sql on every resetDb, which a
// migration can't serve; and reference data is corrected in place over time,
// which is a poor fit for an append-only migration history.
//
// Idempotent — safe to run more than once. Run after `npm run migrate:up`.
//
// Usage: npm run seed:reference

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pool } from "../src/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databaseDir = path.resolve(__dirname, "../../database");

// Order matters only in that roles/permissions come first by convention; the
// taxonomies don't depend on them.
const FILES = ["seed-roles.sql", "seed-taxonomies.sql"];

async function main(): Promise<void> {
  for (const file of FILES) {
    const sql = readFileSync(path.join(databaseDir, file), "utf8");
    await pool.query(sql);
    console.log(`seeded: ${file}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
