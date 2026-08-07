import { ConflictError, NotFoundError } from "./errors.js";

// Postgres error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23503";
}

/** Runs a write query, mapping a unique-violation into a clean 409 instead of leaking the raw DB error. */
export async function mapUniqueViolation<T>(run: () => Promise<T>, message: string): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(message);
    }
    throw error;
  }
}

/** Runs a delete/update whose failure mode is an FK RESTRICT, mapping it into a clean 409. */
export async function mapForeignKeyViolation<T>(run: () => Promise<T>, message: string): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw new ConflictError(message);
    }
    throw error;
  }
}

/** Returns the first row or throws a 404 — the shape every RETURNING-based update/insert-lookup needs. */
export function requireRow<T>(rows: T[], message: string): T {
  const row = rows[0];
  if (!row) {
    throw new NotFoundError(message);
  }
  return row;
}

/** Throws a 404 when a DELETE affected no rows. */
export function requireDeleted(rowCount: number | null, message: string): void {
  if (!rowCount) {
    throw new NotFoundError(message);
  }
}
