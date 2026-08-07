import type pg from "pg";
import { mapUniqueViolation, requireDeleted, requireRow } from "../../db-errors.js";

export interface CategoryAttribute {
  id: string;
  categoryId: string;
  name: string;
  fieldType: "text" | "number" | "boolean" | "select";
  options: string[] | null;
  isRequired: boolean;
  sortOrder: number;
}

interface CategoryAttributeRow {
  id: string;
  category_id: string;
  name: string;
  field_type: "text" | "number" | "boolean" | "select";
  options: string[] | null;
  is_required: boolean;
  sort_order: number;
}

function toCategoryAttribute(row: CategoryAttributeRow): CategoryAttribute {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    fieldType: row.field_type,
    options: row.options,
    isRequired: row.is_required,
    sortOrder: row.sort_order,
  };
}

const COLUMNS = "id, category_id, name, field_type, options, is_required, sort_order";

export interface CategoryAttributeInput {
  name: string;
  fieldType: "text" | "number" | "boolean" | "select";
  options?: string[];
  isRequired?: boolean;
  sortOrder?: number;
}

function conflictMessage(name: string): string {
  return `An attribute named "${name}" already exists on this category`;
}

export async function listCategoryAttributes(db: pg.Pool, categoryId: string): Promise<CategoryAttribute[]> {
  const { rows } = await db.query<CategoryAttributeRow>(
    `SELECT ${COLUMNS} FROM category_attributes WHERE category_id = $1 ORDER BY sort_order, name`,
    [categoryId],
  );
  return rows.map(toCategoryAttribute);
}

export async function createCategoryAttribute(
  db: pg.Pool,
  categoryId: string,
  input: CategoryAttributeInput,
): Promise<CategoryAttribute> {
  return mapUniqueViolation(async () => {
    const { rows } = await db.query<CategoryAttributeRow>(
      `INSERT INTO category_attributes (category_id, name, field_type, options, is_required, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${COLUMNS}`,
      [
        categoryId,
        input.name,
        input.fieldType,
        input.options ? JSON.stringify(input.options) : null,
        input.isRequired ?? false,
        input.sortOrder ?? 0,
      ],
    );
    return toCategoryAttribute(rows[0]);
  }, conflictMessage(input.name));
}

export async function updateCategoryAttribute(
  db: pg.Pool,
  attributeId: string,
  input: CategoryAttributeInput,
): Promise<CategoryAttribute> {
  return mapUniqueViolation(async () => {
    const { rows } = await db.query<CategoryAttributeRow>(
      `UPDATE category_attributes
       SET name = $1, field_type = $2, options = $3, is_required = $4, sort_order = $5
       WHERE id = $6
       RETURNING ${COLUMNS}`,
      [
        input.name,
        input.fieldType,
        input.options ? JSON.stringify(input.options) : null,
        input.isRequired ?? false,
        input.sortOrder ?? 0,
        attributeId,
      ],
    );
    return toCategoryAttribute(requireRow(rows, "Category attribute not found"));
  }, conflictMessage(input.name));
}

export async function deleteCategoryAttribute(db: pg.Pool, attributeId: string): Promise<void> {
  const { rowCount } = await db.query(`DELETE FROM category_attributes WHERE id = $1`, [attributeId]);
  requireDeleted(rowCount, "Category attribute not found");
}
