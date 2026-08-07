import type pg from "pg";
import { requireDeleted, requireRow } from "../../db-errors.js";

export interface Faq {
  id: string;
  categoryId: string;
  question: string;
  answer: string;
  sortOrder: number;
}

interface FaqRow {
  id: string;
  category_id: string;
  question: string;
  answer: string;
  sort_order: number;
}

function toFaq(row: FaqRow): Faq {
  return {
    id: row.id,
    categoryId: row.category_id,
    question: row.question,
    answer: row.answer,
    sortOrder: row.sort_order,
  };
}

const FAQ_COLUMNS = "id, category_id, question, answer, sort_order";

export interface FaqInput {
  categoryId: string;
  question: string;
  answer: string;
  sortOrder?: number;
}

/** `category` is the category's UUID — FAQ categories have no slug to match on. */
export async function listFaqs(db: pg.Pool, category?: string): Promise<Faq[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (category) {
    params.push(category);
    conditions.push(`category_id = $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await db.query<FaqRow>(`SELECT ${FAQ_COLUMNS} FROM faqs ${where} ORDER BY sort_order, question`, params);
  return rows.map(toFaq);
}

export async function getFaq(db: pg.Pool, id: string): Promise<Faq> {
  const { rows } = await db.query<FaqRow>(`SELECT ${FAQ_COLUMNS} FROM faqs WHERE id = $1`, [id]);
  return toFaq(requireRow(rows, "FAQ not found"));
}

export async function createFaq(db: pg.Pool, input: FaqInput): Promise<Faq> {
  const { rows } = await db.query<FaqRow>(
    `INSERT INTO faqs (category_id, question, answer, sort_order) VALUES ($1, $2, $3, $4) RETURNING ${FAQ_COLUMNS}`,
    [input.categoryId, input.question, input.answer, input.sortOrder ?? 0],
  );
  return toFaq(rows[0]);
}

export async function updateFaq(db: pg.Pool, id: string, input: Partial<FaqInput>): Promise<Faq> {
  const current = await getFaq(db, id);
  const { rows } = await db.query<FaqRow>(
    `UPDATE faqs SET category_id = $1, question = $2, answer = $3, sort_order = $4 WHERE id = $5 RETURNING ${FAQ_COLUMNS}`,
    [
      input.categoryId ?? current.categoryId,
      input.question ?? current.question,
      input.answer ?? current.answer,
      input.sortOrder ?? current.sortOrder,
      id,
    ],
  );
  return toFaq(rows[0]);
}

export async function deleteFaq(db: pg.Pool, id: string): Promise<void> {
  const { rowCount } = await db.query(`DELETE FROM faqs WHERE id = $1`, [id]);
  requireDeleted(rowCount, "FAQ not found");
}
