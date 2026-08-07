import type pg from "pg";
import { requireDeleted, requireRow } from "../../db-errors.js";

export type BannerStatus = "draft" | "active" | "expired";

export interface Banner {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string | null;
  placement: string;
  sortOrder: number;
  status: BannerStatus;
  startDate: string | null;
  endDate: string | null;
}

interface BannerRow {
  id: string;
  title: string;
  image_url: string;
  link_url: string | null;
  placement: string;
  sort_order: number;
  status: BannerStatus;
  start_date: string | null;
  end_date: string | null;
}

// DATE columns cast to text in-query — see the same note in promotions.ts.
const COLUMNS = `id, title, image_url, link_url, placement, sort_order, status,
  to_char(start_date, 'YYYY-MM-DD') AS start_date,
  to_char(end_date, 'YYYY-MM-DD') AS end_date`;

/**
 * Both `status` and the date range are real, independently-settable columns,
 * so visibility respects both — a `draft` banner inside its window stays
 * hidden, and an `active` one outside its window does too. Both dates are
 * nullable: null means "unbounded on that end" (see Phase 7 spec).
 */
const PUBLIC_VISIBILITY = `status = 'active'
  AND (start_date IS NULL OR start_date <= CURRENT_DATE)
  AND (end_date IS NULL OR end_date >= CURRENT_DATE)`;

function toBanner(row: BannerRow): Banner {
  return {
    id: row.id,
    title: row.title,
    imageUrl: row.image_url,
    linkUrl: row.link_url,
    placement: row.placement,
    sortOrder: row.sort_order,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
  };
}

export interface BannerInput {
  title: string;
  imageUrl: string;
  linkUrl?: string | null;
  placement: string;
  sortOrder?: number;
  status?: BannerStatus;
  startDate?: string | null;
  endDate?: string | null;
}

/**
 * `status` is omitted from the INSERT when the caller doesn't supply one, so
 * the column's own `draft` default stays the single source of truth rather
 * than being restated here. Unlike a Promotion (owner-created, so it must
 * not self-approve), a Banner is Super-Admin-only end to end — letting an
 * admin create one already `active` skips a pointless second call, with no
 * privilege boundary to cross.
 */
export async function createBanner(db: pg.Pool, input: BannerInput): Promise<Banner> {
  const withStatus = input.status !== undefined;
  const { rows } = await db.query<BannerRow>(
    `INSERT INTO banners (title, image_url, link_url, placement, sort_order, start_date, end_date${withStatus ? ", status" : ""})
     VALUES ($1, $2, $3, $4, $5, $6, $7${withStatus ? ", $8" : ""})
     RETURNING ${COLUMNS}`,
    [
      input.title,
      input.imageUrl,
      input.linkUrl ?? null,
      input.placement,
      input.sortOrder ?? 0,
      input.startDate ?? null,
      input.endDate ?? null,
      ...(withStatus ? [input.status] : []),
    ],
  );
  return toBanner(rows[0]);
}

/** Public list — only currently-live banners, optionally narrowed to one placement. */
export async function listBanners(db: pg.Pool, placement?: string): Promise<Banner[]> {
  const conditions = [PUBLIC_VISIBILITY];
  const params: unknown[] = [];

  if (placement) {
    params.push(placement);
    conditions.push(`placement = $${params.length}`);
  }

  const { rows } = await db.query<BannerRow>(
    `SELECT ${COLUMNS} FROM banners WHERE ${conditions.join(" AND ")} ORDER BY sort_order`,
    params,
  );
  return rows.map(toBanner);
}

/** Exported for the audit-log retrofit — route handlers capture prior state before update/delete. */
export async function getBanner(db: pg.Pool, id: string): Promise<Banner> {
  const { rows } = await db.query<BannerRow>(`SELECT ${COLUMNS} FROM banners WHERE id = $1`, [id]);
  return toBanner(requireRow(rows, "Banner not found"));
}

export type UpdateBannerInput = Partial<BannerInput>;

export async function updateBanner(db: pg.Pool, id: string, input: UpdateBannerInput): Promise<Banner> {
  const current = await getBanner(db, id);
  const { rows } = await db.query<BannerRow>(
    `UPDATE banners SET title = $1, image_url = $2, link_url = $3, placement = $4,
       sort_order = $5, status = $6, start_date = $7, end_date = $8
     WHERE id = $9
     RETURNING ${COLUMNS}`,
    [
      input.title ?? current.title,
      input.imageUrl ?? current.imageUrl,
      input.linkUrl === undefined ? current.linkUrl : input.linkUrl,
      input.placement ?? current.placement,
      input.sortOrder ?? current.sortOrder,
      input.status ?? current.status,
      input.startDate === undefined ? current.startDate : input.startDate,
      input.endDate === undefined ? current.endDate : input.endDate,
      id,
    ],
  );
  return toBanner(rows[0]);
}

export async function deleteBanner(db: pg.Pool, id: string): Promise<void> {
  const { rowCount } = await db.query(`DELETE FROM banners WHERE id = $1`, [id]);
  requireDeleted(rowCount, "Banner not found");
}
