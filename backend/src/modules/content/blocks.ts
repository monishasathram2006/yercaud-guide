import type pg from "pg";

/**
 * The public shape (the contract's ContentBlock). A block is addressed by its
 * (page_slug, block_key) natural key, never by its surrogate id — so the id
 * stays out of here, as does `updated_by`: the read endpoint is public, and an
 * admin's user id has no business reaching anonymous visitors. The audit log
 * already answers "who changed this" for anyone entitled to ask.
 */
export interface ContentBlock {
  pageSlug: string;
  blockKey: string;
  content: Record<string, unknown>;
  updatedAt: string;
}

/** Internal shape: carries the id the audit trail needs to point at a row. */
export interface ContentBlockRecord extends ContentBlock {
  id: string;
  updatedBy: string | null;
}

interface ContentBlockRow {
  id: string;
  page_slug: string;
  block_key: string;
  content: Record<string, unknown>;
  updated_by: string | null;
  updated_at: string;
}

const COLUMNS = "id, page_slug, block_key, content, updated_by, updated_at";

function toRecord(row: ContentBlockRow): ContentBlockRecord {
  return {
    id: row.id,
    pageSlug: row.page_slug,
    blockKey: row.block_key,
    content: row.content,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

export function toContentBlock(record: ContentBlockRecord): ContentBlock {
  return {
    pageSlug: record.pageSlug,
    blockKey: record.blockKey,
    content: record.content,
    updatedAt: record.updatedAt,
  };
}

/**
 * Every block on a page, ordered by block key so the response is stable across
 * calls. Visual ordering is the frontend's job — it knows the slots. An unknown
 * page yields an empty array, not a 404: this module has no notion of which
 * pages exist, so "no blocks yet" and "no such page" are the same state.
 */
export async function listContentBlocks(db: pg.Pool, pageSlug: string): Promise<ContentBlock[]> {
  const { rows } = await db.query<ContentBlockRow>(
    `SELECT ${COLUMNS} FROM content_blocks WHERE page_slug = $1 ORDER BY block_key`,
    [pageSlug],
  );
  return rows.map((row) => toContentBlock(toRecord(row)));
}

/** Null when the block has never been written — the caller uses this for the audit trail's oldData. */
export async function getContentBlockRecord(
  db: pg.Pool,
  pageSlug: string,
  blockKey: string,
): Promise<ContentBlockRecord | null> {
  const { rows } = await db.query<ContentBlockRow>(
    `SELECT ${COLUMNS} FROM content_blocks WHERE page_slug = $1 AND block_key = $2`,
    [pageSlug, blockKey],
  );
  const row = rows[0];
  return row ? toRecord(row) : null;
}

export interface ContentBlockInput {
  pageSlug: string;
  blockKey: string;
  content: Record<string, unknown>;
  updatedBy: string;
}

/**
 * Create-or-edit in one call. The frontend already knows the page and slot it
 * wants to write; making it ask whether the block exists first would buy nothing.
 * `content` is replaced wholesale rather than merged — a merge would leave an
 * admin no way to remove a field.
 */
export async function upsertContentBlock(db: pg.Pool, input: ContentBlockInput): Promise<ContentBlockRecord> {
  const { rows } = await db.query<ContentBlockRow>(
    `INSERT INTO content_blocks (page_slug, block_key, content, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (page_slug, block_key)
     DO UPDATE SET content = EXCLUDED.content, updated_by = EXCLUDED.updated_by
     RETURNING ${COLUMNS}`,
    [input.pageSlug, input.blockKey, JSON.stringify(input.content), input.updatedBy],
  );
  return toRecord(rows[0]!);
}
