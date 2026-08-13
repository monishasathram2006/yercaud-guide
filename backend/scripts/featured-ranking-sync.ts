// Recompute Featured Score rankings for every Listing category section
// (issue #19, part of the Featured Sections epic — ADR-0011). Replaces the
// day's featured_rankings rows; GET /featured-sections reads only that
// table, never aggregating signals live. Run on a schedule (external/OS
// cron — this codebase has no in-process scheduler, same as embeddings:sync).
//
// Usage: npm run featured-rankings:sync

import "dotenv/config";
import { pool } from "../src/db.js";
import { runFeaturedRankingSync } from "../src/modules/featured/sync.js";

async function main(): Promise<void> {
  await runFeaturedRankingSync(pool);
  console.log("Featured rankings synced.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
