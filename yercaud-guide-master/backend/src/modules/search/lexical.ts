/**
 * Shared lexical-leg SQL for the search engine (issue #11).
 *
 * These weighted tsvector expressions are used by both GET /listings?q= (which
 * gets the lexical upgrade — typo/prefix tolerance and relevance ordering) and
 * GET /search (which fuses this leg with the semantic one). Keeping them in one
 * place is what "the same query internals" in the spec means concretely.
 *
 * Each expression is self-contained: it assumes only the base-table alias (and,
 * for listings, the category/location joins the display query already makes) and
 * pulls tags/amenities via correlated subqueries, so it drops straight into a
 * WHERE/ORDER BY without extra CTEs. Weighting is A=name, B=category/location/
 * tags, C=description/amenities — a name hit outranks a description hit.
 */

/** Requires aliases `l` (listings), `c` (categories), `loc` (locations) in scope. */
export const LISTING_TSVECTOR = `(
  setweight(to_tsvector('english', l.name), 'A')
  || setweight(to_tsvector('english', concat_ws(' ',
       c.name, loc.name,
       (SELECT string_agg(at.name, ' ') FROM listing_tags lt JOIN attribute_tags at ON at.id = lt.tag_id WHERE lt.listing_id = l.id)
     )), 'B')
  || setweight(to_tsvector('english', concat_ws(' ',
       l.description,
       (SELECT string_agg(a.name, ' ') FROM listing_amenities la JOIN amenities a ON a.id = la.amenity_id WHERE la.listing_id = l.id)
     )), 'C')
)`;

/** Requires alias `b` (businesses) in scope. */
export const BUSINESS_TSVECTOR = `(
  setweight(to_tsvector('english', b.name), 'A')
  || setweight(to_tsvector('english', concat_ws(' ', b.description, b.address)), 'B')
)`;

/**
 * Word-similarity floor for the trigram fuzzy fallback. `word_similarity(q, name)`
 * matches the query against the closest word within a (possibly multi-word) name,
 * so a typo or prefix against one word isn't diluted by the rest. 0.3 clears a
 * single-character typo on a short word ("Sonset" → "Sunset Villa" ≈ 0.43) while
 * rejecting unrelated names.
 */
export const WORD_SIMILARITY_THRESHOLD = 0.3;

/**
 * Reciprocal Rank Fusion constant. Score for a document at rank r in a leg is
 * 1/(RRF_K + r); a document's final score sums that across the legs it appears
 * in. 60 is the value from the original RRF paper and the de-facto default —
 * large enough that top ranks don't dominate, small enough that rank still
 * matters. Rank-based, so the two legs' incomparable score scales (ts_rank vs
 * cosine distance) never need normalizing.
 */
export const RRF_K = 60;
