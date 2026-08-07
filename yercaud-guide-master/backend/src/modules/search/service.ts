import type pg from "pg";
import { toSql } from "pgvector";
import { summariesByIds, type ListingSummary } from "../listings/service.js";
import type { EmbeddingProvider } from "./provider.js";
import { BUSINESS_TSVECTOR, LISTING_TSVECTOR, RRF_K, WORD_SIMILARITY_THRESHOLD } from "./lexical.js";

/**
 * The hybrid search engine (issue #11): a lexical leg and a semantic leg, each
 * ranked independently, fused with Reciprocal Rank Fusion. Results are grouped —
 * Listings primary, Businesses secondary.
 *
 * The semantic leg is best-effort. If no provider is configured, `mode` is
 * 'quick' (the type-ahead dropdown), or the query embedding can't be produced
 * within the budget, the search runs on the lexical leg alone and still returns
 * results. Visibility mirrors GET /listings: anonymous sees only 'approved', a
 * signed-in caller also sees their own pending rows.
 */

export interface BusinessSummary {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  address: string | null;
  listingCount: number;
}

export interface SearchOptions {
  q: string;
  category?: string;
  mode: "full" | "quick";
  pageSize: number;
  /** The signed-in caller, if any — widens visibility to their own pending rows. */
  callerId?: string;
}

export interface SearchResult {
  listings: ListingSummary[];
  businesses: BusinessSummary[];
}

/** How many candidates each leg contributes before fusion. Comfortably wider
 *  than a page so the fusion has room to reorder, capped so a huge pageSize
 *  can't blow up the candidate scan. */
function candidateCount(pageSize: number): number {
  return Math.min(200, Math.max(pageSize * 4, 50));
}

/**
 * Cosine-distance cutoff for the semantic leg. Without it, vector search always
 * returns its k nearest rows — so a nonsense query ("zzzznotathing") would still
 * surface the "least far" listings, and /search would never show an empty state.
 * Measured on text-embedding-3-small over this corpus, genuine matches sit at
 * 0.50–0.72 and unrelated text at 0.89+, so 0.78 cleanly separates them. It's a
 * relevance floor, not a precise knob — the lexical leg is unaffected.
 */
const MAX_SEMANTIC_DISTANCE = 0.78;

/** Embed the query, but never let a slow/failing provider block search. On
 *  timeout or error, return null → lexical-only. */
async function embedQuery(provider: EmbeddingProvider, q: string): Promise<number[] | null> {
  const BUDGET_MS = 2000;
  try {
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), BUDGET_MS));
    const embedded = provider.embed([q]).then((vecs) => vecs[0] ?? null);
    return await Promise.race([embedded, timeout]);
  } catch {
    return null;
  }
}

/** A tiny positional-parameter builder — push a value, get its `$n` index. */
function paramBuilder() {
  const params: unknown[] = [];
  return {
    params,
    push(value: unknown): string {
      params.push(value);
      return `$${params.length}`;
    },
  };
}

/**
 * Assembles the id query from a lexical CTE and, when the semantic leg ran, a
 * semantic one. With both, Reciprocal Rank Fusion sums 1/(RRF_K + rank) across
 * the legs; with only lexical, ids come back in rank order. Shared by the
 * Listing and Business rankers — only the CTEs above it differ. `pageParam` is
 * the already-pushed `$n` for the page size.
 */
function fuseSql(lexicalCte: string, semanticCte: string | null, pageParam: string): string {
  if (!semanticCte) {
    return `WITH ${lexicalCte} SELECT id FROM lexical ORDER BY rnk LIMIT ${pageParam}`;
  }
  return `
    WITH ${lexicalCte}, ${semanticCte}
    SELECT COALESCE(lexical.id, semantic.id) AS id
    FROM lexical FULL OUTER JOIN semantic ON lexical.id = semantic.id
    ORDER BY COALESCE(1.0 / (${RRF_K} + lexical.rnk), 0) + COALESCE(1.0 / (${RRF_K} + semantic.rnk), 0) DESC
    LIMIT ${pageParam}`;
}

async function rankListingIds(
  db: pg.Pool,
  opts: { q: string; categoryId: string | null; callerId?: string; vec: number[] | null; pageSize: number },
): Promise<string[]> {
  const b = paramBuilder();
  const qi = b.push(opts.q);

  const visibility = [
    opts.callerId ? `(l.status = 'approved' OR biz.owner_id = ${b.push(opts.callerId)})` : `l.status = 'approved'`,
  ];
  if (opts.categoryId) visibility.push(`l.category_id = ${b.push(opts.categoryId)}`);
  const where = visibility.join(" AND ");
  const k = candidateCount(opts.pageSize);

  // ORDER BY rnk before LIMIT: without it, the window rank is computed over all
  // matches but LIMIT would take an arbitrary k — dropping top-ranked rows once
  // matches exceed k, before fusion ever sees them.
  const lexical = `
    lexical AS (
      SELECT l.id, row_number() OVER (
        ORDER BY ts_rank(${LISTING_TSVECTOR}, websearch_to_tsquery('english', ${qi})) DESC,
                 word_similarity(${qi}, l.name) DESC
      ) AS rnk
      FROM listings l
      JOIN categories c ON c.id = l.category_id
      LEFT JOIN locations loc ON loc.id = l.location_id
      JOIN businesses biz ON biz.id = l.business_id
      WHERE ${where}
        AND (${LISTING_TSVECTOR} @@ websearch_to_tsquery('english', ${qi}) OR word_similarity(${qi}, l.name) > ${WORD_SIMILARITY_THRESHOLD})
      ORDER BY rnk LIMIT ${k}
    )`;

  let semantic: string | null = null;
  if (opts.vec) {
    const vi = b.push(toSql(opts.vec));
    semantic = `
      semantic AS (
        SELECT l.id, row_number() OVER (ORDER BY l.embedding <=> ${vi}::vector) AS rnk
        FROM listings l
        JOIN businesses biz ON biz.id = l.business_id
        WHERE ${where} AND l.embedding IS NOT NULL AND (l.embedding <=> ${vi}::vector) < ${MAX_SEMANTIC_DISTANCE}
        ORDER BY l.embedding <=> ${vi}::vector
        LIMIT ${k}
      )`;
  }

  const { rows } = await db.query<{ id: string }>(fuseSql(lexical, semantic, b.push(opts.pageSize)), b.params);
  return rows.map((r) => r.id);
}

async function rankBusinessIds(
  db: pg.Pool,
  opts: { q: string; callerId?: string; vec: number[] | null; pageSize: number },
): Promise<string[]> {
  const b = paramBuilder();
  const qi = b.push(opts.q);
  const where = opts.callerId
    ? `(b.status = 'approved' OR b.owner_id = ${b.push(opts.callerId)})`
    : `b.status = 'approved'`;
  const k = candidateCount(opts.pageSize);

  const lexical = `
    lexical AS (
      SELECT b.id, row_number() OVER (
        ORDER BY ts_rank(${BUSINESS_TSVECTOR}, websearch_to_tsquery('english', ${qi})) DESC,
                 word_similarity(${qi}, b.name) DESC
      ) AS rnk
      FROM businesses b
      WHERE ${where}
        AND (${BUSINESS_TSVECTOR} @@ websearch_to_tsquery('english', ${qi}) OR word_similarity(${qi}, b.name) > ${WORD_SIMILARITY_THRESHOLD})
      ORDER BY rnk LIMIT ${k}
    )`;

  let semantic: string | null = null;
  if (opts.vec) {
    const vi = b.push(toSql(opts.vec));
    semantic = `
      semantic AS (
        SELECT b.id, row_number() OVER (ORDER BY b.embedding <=> ${vi}::vector) AS rnk
        FROM businesses b
        WHERE ${where} AND b.embedding IS NOT NULL AND (b.embedding <=> ${vi}::vector) < ${MAX_SEMANTIC_DISTANCE}
        ORDER BY b.embedding <=> ${vi}::vector
        LIMIT ${k}
      )`;
  }

  const { rows } = await db.query<{ id: string }>(fuseSql(lexical, semantic, b.push(opts.pageSize)), b.params);
  return rows.map((r) => r.id);
}

interface BusinessSummaryRow {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  address: string | null;
  listing_count: string;
}

async function businessSummariesByIds(db: pg.Pool, ids: string[], callerId?: string): Promise<BusinessSummary[]> {
  if (ids.length === 0) return [];
  // listingCount counts only the caller-visible Listings — approved, or owned by
  // the caller. `$2::uuid` is null for an anonymous caller, so the OR is false.
  const { rows } = await db.query<BusinessSummaryRow>(
    `SELECT b.id, b.name, b.description, b.logo_url, b.address,
       (SELECT count(*) FROM listings l
          WHERE l.business_id = b.id
            AND (l.status = 'approved' OR b.owner_id = $2::uuid)) AS listing_count
     FROM businesses b WHERE b.id = ANY($1)`,
    [ids, callerId ?? null],
  );
  const byId = new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        name: r.name,
        description: r.description,
        logoUrl: r.logo_url,
        address: r.address,
        listingCount: Number(r.listing_count),
      } satisfies BusinessSummary,
    ]),
  );
  return ids.map((id) => byId.get(id)).filter((s): s is BusinessSummary => s !== undefined);
}

export async function hybridSearch(
  db: pg.Pool,
  provider: EmbeddingProvider | null,
  options: SearchOptions,
): Promise<SearchResult> {
  // A category scope that names no real category yields no Listings (but
  // Businesses aren't category-scoped, so they still search).
  let categoryId: string | null = null;
  if (options.category) {
    const { rows } = await db.query<{ id: string }>(`SELECT id FROM categories WHERE slug = $1`, [options.category]);
    if (!rows[0]) categoryId = "00000000-0000-0000-0000-000000000000";
    else categoryId = rows[0].id;
  }

  // The semantic leg runs only on a submitted search (mode 'full') with a
  // working provider. Quick (dropdown) and unconfigured both fall to lexical.
  const vec = provider && options.mode === "full" ? await embedQuery(provider, options.q) : null;

  const [listingIds, businessIds] = await Promise.all([
    rankListingIds(db, { q: options.q, categoryId, callerId: options.callerId, vec, pageSize: options.pageSize }),
    rankBusinessIds(db, { q: options.q, callerId: options.callerId, vec, pageSize: options.pageSize }),
  ]);

  const [listings, businesses] = await Promise.all([
    summariesByIds(db, listingIds),
    businessSummariesByIds(db, businessIds, options.callerId),
  ]);

  return { listings, businesses };
}
