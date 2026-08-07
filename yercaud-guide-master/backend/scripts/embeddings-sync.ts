// Reconcile the semantic search index (issue #11): embed every Listing and
// Business whose document is stale, and store the vectors.
//
// Writes only ever mark rows stale (a Postgres trigger); this is where the
// deferred embedding work happens. Run it after seeding demo data, on a
// schedule, or any time search feels behind the content. Requires the
// AZURE_OPENAI_EMBEDDING_* vars (loaded from .env) — without them there's no
// provider and nothing to do, which it reports rather than failing.
//
// Usage: npm run embeddings:sync

import "dotenv/config";
import { pool } from "../src/db.js";
import { embeddingProviderFromConfig } from "../src/modules/search/provider.js";
import { syncEmbeddings } from "../src/modules/search/sync.js";

async function main(): Promise<void> {
  const provider = embeddingProviderFromConfig();
  if (!provider) {
    console.log(
      "No embedding provider configured (set AZURE_OPENAI_EMBEDDING_ENDPOINT / _API_KEY / _DEPLOYMENT). Nothing to sync.",
    );
    return;
  }
  const result = await syncEmbeddings(pool, provider);
  console.log(
    `Embeddings synced — listings: ${result.listings.embedded} embedded, ${result.listings.skipped} unchanged; ` +
      `businesses: ${result.businesses.embedded} embedded, ${result.businesses.skipped} unchanged.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
