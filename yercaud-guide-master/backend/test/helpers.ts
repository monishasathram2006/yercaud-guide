import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { buildApp, type AppDeps } from "../src/app.js";
import type { FastifyInstance } from "fastify";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedRolesSql = readFileSync(path.resolve(__dirname, "../../database/seed-roles.sql"), "utf8");

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://yercaud:yercaud@localhost:5432/yercaud_directory_test";

export interface TestContext {
  app: FastifyInstance;
  db: pg.Pool;
}

export async function buildTestApp(overrides: Partial<Omit<AppDeps, "db">> = {}): Promise<TestContext> {
  const db = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  // refreshEmbeddingsOnWrite off by default: the fire-and-forget reconcile would
  // otherwise race tests that call syncEmbeddings directly (issue #11).
  const app = await buildApp({ db, refreshEmbeddingsOnWrite: false, ...overrides });
  return { app, db };
}

export async function resetDb(db: pg.Pool): Promise<void> {
  const { rows } = await db.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  const tables = rows
    .map((r) => r.tablename)
    // 'permissions' is static reference data (module x action), never
    // mutated by application behavior — no need to truncate/reseed it.
    //
    // 'pgmigrations' is node-pg-migrate's own record of which migrations have
    // run (Phase 10). It isn't application data and truncating it would leave
    // the database claiming no migration had ever run, against a schema built
    // by all of them — harmless while global-setup drops the whole database per
    // run, and thoroughly confusing the first time anything doesn't.
    .filter((t) => t !== "permissions" && t !== "pgmigrations")
    .map((t) => `"${t}"`)
    .join(", ");
  if (tables.length > 0) {
    await db.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
  }
  await db.query(seedRolesSql);
}

/** Test-fixture only: grants a role directly via SQL, bypassing the API — there's
 * no bootstrap endpoint for "make the first Super Admin" yet (out of scope, see spec). */
export async function grantRole(db: pg.Pool, userId: string, roleName: string): Promise<void> {
  await db.query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT $1, id FROM roles WHERE name = $2`,
    [userId, roleName],
  );
}

export async function closeTestApp(ctx: TestContext): Promise<void> {
  await ctx.app.close();
  await ctx.db.end();
}

/**
 * Picks the session_id cookie specifically, not just the first Set-Cookie
 * header — a response can carry more than one (e.g. the Google OAuth callback
 * both clears its state cookie and sets session_id, in that order), and index
 * 0 would silently grab the wrong one.
 */
export function extractCookie(setCookieHeader: string | string[] | undefined): string {
  const headers = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  const sessionHeader = headers.find((h) => h?.startsWith("session_id=")) ?? headers[0];
  return String(sessionHeader).split(";")[0];
}

export async function registerAndGetCookie(
  ctx: TestContext,
  email: string,
): Promise<{ cookie: string; userId: string }> {
  const response = await ctx.app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "correct horse battery staple", name: "Test User" },
  });
  return { cookie: extractCookie(response.headers["set-cookie"]), userId: response.json().id };
}
