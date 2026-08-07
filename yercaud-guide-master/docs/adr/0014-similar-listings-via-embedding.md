# Similar-listings recommendations use embedding similarity, not view co-occurrence

Listing detail pages need a "Similar {Category}" section. `listing_views` already records a `session_id` per view (ADR-0013), which could support a "people who viewed X also viewed Y" collaborative approach — but with a directory this small (about a dozen listings across a single small town), session co-occurrence data is too sparse to produce meaningful, non-noisy results for most listings, and a brand-new listing has zero view history to draw on. We instead rank same-category listings by cosine distance on the existing `listings.embedding` (pgvector, kept fresh by trigger) — deterministic, works from a listing's first day, and needs no new data collection.

## Consequences

`listing_views` remains write-only for Featured Score purposes (ADR-0011); it isn't read for recommendations. If traffic and catalog size grow enough for co-occurrence data to be dense, this trade-off is worth revisiting.
