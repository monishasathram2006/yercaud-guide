import type pg from "pg";
import { mapUniqueViolation, requireDeleted, requireRow } from "../../db-errors.js";

/**
 * Not a NamedLookup: faq_categories has a `sort_order` and no `slug`, which
 * is the opposite of what NamedLookup describes. The contract said otherwise
 * and was wrong (see Phase 8 spec).
 */
export interface FaqCategory {
  id: string;
  name: string;
  sortOrder: number;
}

interface FaqCategoryRow {
  id: string;
  name: string;
  sort_order: number;
}

function toFaqCategory(row: FaqCategoryRow): FaqCategory {
  return { id: row.id, name: row.name, sortOrder: row.sort_order };
}

const COLUMNS = "id, name, sort_order";

export interface FaqCategoryInput {
  name: string;
  sortOrder?: number;
}

export async function listFaqCategories(db: pg.Pool): Promise<FaqCategory[]> {
  const { rows } = await db.query<FaqCategoryRow>(
    `SELECT ${COLUMNS} FROM faq_categories ORDER BY sort_order, name`,
  );
  return rows.map(toFaqCategory);
}

export async function getFaqCategory(db: pg.Pool, id: string): Promise<FaqCategory> {
  const { rows } = await db.query<FaqCategoryRow>(`SELECT ${COLUMNS} FROM faq_categories WHERE id = $1`, [
    id,
  ]);
  return toFaqCategory(requireRow(rows, "FAQ category not found"));
}

export async function createFaqCategory(db: pg.Pool, input: FaqCategoryInput): Promise<FaqCategory> {
  return mapUniqueViolation(async () => {
    const { rows } = await db.query<FaqCategoryRow>(
      `INSERT INTO faq_categories (name, sort_order) VALUES ($1, $2) RETURNING ${COLUMNS}`,
      [input.name, input.sortOrder ?? 0],
    );
    return toFaqCategory(rows[0]);
  }, `An FAQ category named "${input.name}" already exists`);
}

export async function updateFaqCategory(db: pg.Pool, id: string, input: Partial<FaqCategoryInput>): Promise<FaqCategory> {
  const current = await getFaqCategory(db, id);
  return mapUniqueViolation(async () => {
    const { rows } = await db.query<FaqCategoryRow>(
      `UPDATE faq_categories SET name = $1, sort_order = $2 WHERE id = $3 RETURNING ${COLUMNS}`,
      [input.name ?? current.name, input.sortOrder ?? current.sortOrder, id],
    );
    return toFaqCategory(rows[0]);
  }, `An FAQ category named "${input.name}" already exists`);
}

/** faqs.category_id is ON DELETE CASCADE — deleting a category takes its FAQs with it, which is the schema's own stated intent. */
export async function deleteFaqCategory(db: pg.Pool, id: string): Promise<void> {
  const { rowCount } = await db.query(`DELETE FROM faq_categories WHERE id = $1`, [id]);
  requireDeleted(rowCount, "FAQ category not found");
}
