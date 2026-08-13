# Compute Featured placement from rating and interactions, not pure editorial curation

The home page's Featured section was a single flat, 100% Super-Admin-curated list (`featured_listings`). We're replacing it with five per-category shelves (Hotels, Restaurants, Activities, Tours & Travels, Blog), each ranked by Featured Score — a Bayesian-weighted rating as the primary factor, with intent-weighted interaction volume (Views, Favorites, Contact Reveals, Enquiries) as a tiebreaker. A Listing/Blog Post needs at least one approved Review/Article Rating to be organically eligible. The score is recomputed on a daily schedule and cached, rather than computed live per request like `averageRating` is today; the ranked pool per category is kept wider than what's displayed, and which items from that pool are shown rotates on each recompute.

We chose computed-by-default because hand-curation doesn't scale fairly across five categories and was explicitly designed to keep Business Owners out of the decision, not to reflect merit. We chose scheduled/cached over live computation because Featured sits on the high-traffic home page and this also blunts short-burst gaming of the ranking.

## Consequences

The existing `featured_listings` table and Admin "Featured Listings" screen aren't removed — they're repurposed as the Sponsored mechanism (ADR-0012).
