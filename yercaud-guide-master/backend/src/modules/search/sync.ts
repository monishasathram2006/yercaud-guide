import type pg from "pg";
import { toSql } from "pgvector";
import type { EmbeddingProvider } from "./provider.js";
import { staleBusinessDocuments, staleListingDocuments, type StaleDocument } from "./documents.js";

/**
 * The reconcile job (issue #11): brings the semantic index up to date with the
 * content. Writes only ever mark a row stale (a pure-Postgres trigger that can't
 * fail); this is where the deferred embedding work actually happens — run on a
 * schedule, on demand via `npm run embeddings:sync`, or best-effort after a
 * write. Until it runs, search still finds stale rows via the lexical leg.
 *
 * Two cheap guards keep the Azure bill down: rows whose composed document is
 * byte-identical to what was last embedded get their flag cleared without an
 * embedding call, and the rest are embedded in batches (the API takes arrays).
 */

const BATCH_SIZE = 96;

export interface SyncResult {
  listings: { embedded: number; skipped: number };
  businesses: { embedded: number; skipped: number };
}

type Entity = "listings" | "businesses";

async function reconcileEntity(
  db: pg.Pool,
  provider: EmbeddingProvider,
  table: Entity,
  fetchStale: (db: pg.Pool, limit: number) => Promise<StaleDocument[]>,
): Promise<{ embedded: number; skipped: number }> {
  let embedded = 0;
  let skipped = 0;

  // Drain the stale set a page at a time. Each processed row leaves the stale
  // set (flag cleared), so re-fetching `LIMIT BATCH_SIZE` walks forward without
  // an offset — and a write that re-marks something mid-run is simply caught by
  // a later page or the next run.
  for (;;) {
    const docs = await fetchStale(db, BATCH_SIZE);
    if (docs.length === 0) break;

    const unchanged = docs.filter((d) => d.text === d.previous);
    const changed = docs.filter((d) => d.text !== d.previous);

    if (unchanged.length > 0) {
      // Document identical to what's already embedded — just clear the flag.
      await db.query(`UPDATE ${table} SET embedding_stale = false WHERE id = ANY($1)`, [
        unchanged.map((d) => d.id),
      ]);
      skipped += unchanged.length;
    }

    if (changed.length > 0) {
      const vectors = await provider.embed(changed.map((d) => d.text));
      // One UPDATE … FROM (VALUES …) writes the whole batch. `unnest` keeps the
      // id/vector/text triples aligned by position.
      await db.query(
        `UPDATE ${table} AS t
           SET embedding = v.embedding::vector,
               embedding_text = v.text,
               embedding_stale = false
         FROM (SELECT * FROM unnest($1::uuid[], $2::text[], $3::text[]) AS u(id, embedding, text)) AS v
         WHERE t.id = v.id`,
        [
          changed.map((d) => d.id),
          vectors.map((vec) => toSql(vec)),
          changed.map((d) => d.text),
        ],
      );
      embedded += changed.length;
    }

    // A short page means the stale set is drained (nothing new re-marked since
    // this fetch), so stop rather than issue one more empty query.
    if (docs.length < BATCH_SIZE) break;
  }

  return { embedded, skipped };
}

export async function syncEmbeddings(db: pg.Pool, provider: EmbeddingProvider): Promise<SyncResult> {
  const listings = await reconcileEntity(db, provider, "listings", staleListingDocuments);
  const businesses = await reconcileEntity(db, provider, "businesses", staleBusinessDocuments);
  return { listings, businesses };
}

// One reconcile at a time: a burst of writes shouldn't stack up concurrent
// runs. A write that lands while a refresh is in flight is picked up by the
// next kick or the scheduled sync.
let refreshInFlight = false;

/**
 * Best-effort, fire-and-forget reconcile after a write (issue #11). The write
 * has already marked rows stale via triggers; this drains them a beat later so
 * a newly approved or edited entity becomes semantically findable without the
 * caller waiting on Azure. Any failure is logged, never surfaced — the write
 * already succeeded, and the scheduled `embeddings:sync` is the backstop. A
 * no-op when disabled (tests) or unconfigured. Deliberately not awaited.
 */
export function scheduleEmbeddingRefresh(deps: {
  db: pg.Pool;
  embeddingProvider: EmbeddingProvider | null;
  refreshEmbeddingsOnWrite: boolean;
}): void {
  if (!deps.refreshEmbeddingsOnWrite || !deps.embeddingProvider || refreshInFlight) return;
  refreshInFlight = true;
  void syncEmbeddings(deps.db, deps.embeddingProvider)
    .catch((err) => console.error("[embeddings] background refresh failed:", err))
    .finally(() => {
      refreshInFlight = false;
    });
}
