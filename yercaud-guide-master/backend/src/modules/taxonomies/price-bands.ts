import type pg from "pg";
import { BadRequestError } from "../../errors.js";
import { mapUniqueViolation, requireDeleted, requireRow } from "../../db-errors.js";

export interface PriceBand {
  id: string;
  label: string;
  minAmount: number;
  maxAmount: number | null;
}

interface PriceBandRow {
  id: string;
  label: string;
  min_amount: number;
  max_amount: number | null;
}

function toPriceBand(row: PriceBandRow): PriceBand {
  return { id: row.id, label: row.label, minAmount: row.min_amount, maxAmount: row.max_amount };
}

function assertValidRange(minAmount: number, maxAmount?: number | null): void {
  if (maxAmount != null && maxAmount < minAmount) {
    throw new BadRequestError("maxAmount must be greater than or equal to minAmount");
  }
}

export async function listPriceBands(db: pg.Pool): Promise<PriceBand[]> {
  const { rows } = await db.query<PriceBandRow>(
    `SELECT id, label, min_amount, max_amount FROM price_bands ORDER BY min_amount`,
  );
  return rows.map(toPriceBand);
}

export async function createPriceBand(
  db: pg.Pool,
  input: { label: string; minAmount: number; maxAmount?: number | null },
): Promise<PriceBand> {
  assertValidRange(input.minAmount, input.maxAmount);
  return mapUniqueViolation(async () => {
    const { rows } = await db.query<PriceBandRow>(
      `INSERT INTO price_bands (label, min_amount, max_amount) VALUES ($1, $2, $3)
       RETURNING id, label, min_amount, max_amount`,
      [input.label, input.minAmount, input.maxAmount ?? null],
    );
    return toPriceBand(rows[0]);
  }, `A price band labelled "${input.label}" already exists`);
}

export async function updatePriceBand(
  db: pg.Pool,
  id: string,
  input: { label: string; minAmount: number; maxAmount?: number | null },
): Promise<PriceBand> {
  assertValidRange(input.minAmount, input.maxAmount);
  return mapUniqueViolation(async () => {
    const { rows } = await db.query<PriceBandRow>(
      `UPDATE price_bands SET label = $1, min_amount = $2, max_amount = $3 WHERE id = $4
       RETURNING id, label, min_amount, max_amount`,
      [input.label, input.minAmount, input.maxAmount ?? null, id],
    );
    return toPriceBand(requireRow(rows, "Price band not found"));
  }, `A price band labelled "${input.label}" already exists`);
}

export async function deletePriceBand(db: pg.Pool, id: string): Promise<void> {
  const { rowCount } = await db.query(`DELETE FROM price_bands WHERE id = $1`, [id]);
  requireDeleted(rowCount, "Price band not found");
}
