# Backend Build Plan

Ordered development plan for the Yercaud Business Directory backend and its integration into the public frontend (`frontend/`) and Admin panel (`Admin/`). Built against the schema in `backend/migrations/` and the decisions in `/CONTEXT.md` and `/docs/adr/`.

## Decisions this plan assumes

- **Backend shape**: one separate Node.js API service, called by both `frontend/` and `Admin/` over HTTP — not server functions embedded in each app. One place for auth, RBAC, and business logic.
- **Auth**: httpOnly session cookies, backed by the `sessions` table. Chosen over JWT specifically for easy server-side revocation.
- **Schema source of truth**: `backend/migrations/`, as of Phase 10. Until then it was `database/schema.sql`, which the Postgres container mounted into its init chain and the test bootstrap read directly; that file is now frozen as the baseline migration and deleted. Migrations run from the backend (`npm run migrate:up`), never from the database container, which has no Node.
- **API contract**: REST, specified up front in `backend/openapi.yaml` before implementation — see Phase 0.5.
- **Media storage**: uploaded images (listing photos, business logos, menu item photos) go to local disk, not object storage.
- **Sequencing**: all backend modules first, then one frontend-integration pass across both apps — not interleaved module-by-module. Nothing is demoable in a browser until the backend phases are essentially done; the API contract (Phase 0.5) and Postman/curl smoke tests are the way to verify progress before then.

## Phase 0 — Backend scaffold

- New `backend/` directory: Node.js + TypeScript + Fastify (recommended for its built-in schema validation, which can be generated from `openapi.yaml` — swap for Express if you have a preference, it's a low-stakes, reversible pick).
- `pg` for raw SQL against Postgres (ADR: raw SQL, no ORM). Connection pool via env-configured `DATABASE_URL`.
- Migration tooling: adopt `node-pg-migrate`. Convert `database/schema.sql` into the initial migration (`migrations/0001_init.sql`) so future schema changes are versioned, not hand-applied.
- Env config: DB creds, session cookie secret, local upload directory path, Fast2SMS keys (placeholder, per ADR 0008).
- Base middleware: error handling, request logging, CORS (allow `frontend` and `Admin` origins), session-cookie parsing.
- Add the backend as a service in `database/docker-compose.yml` (or a root-level compose including both) so `docker compose up` starts DB + API together.

## Phase 0.5 — OpenAPI spec (contract-first)

- `backend/openapi.yaml` — done alongside this plan. Covers Auth, Taxonomies, Businesses, Listings (+ per-category detail endpoints), Reviews, Favorites, Enquiries, Admin/RBAC/Audit, Marketing, Blog, FAQ, Content/Newsletter.
- Validated structurally clean with `npx @redocly/cli lint backend/openapi.yaml` (219 style warnings remain — missing `operationId`/4xx responses per operation; fill these in as each operation is actually implemented, not required to unblock work).
- Each phase below implements its slice of this already-specified contract rather than designing endpoints ad hoc. If an endpoint's shape turns out to be wrong once you're implementing it, update the spec in the same commit — it should never drift from what the code actually does.
- Optional next step once Phase 1 begins: generate a TypeScript request/response client from the spec (e.g. `openapi-typescript`) for both frontend apps to consume in Phase 10.

## Phase 1 — Identity & Access

Blocks every other phase — nothing else can be scoped to "the current user" without this.

1. Users: register, login, logout, session issuance/validation (`sessions` table), password hashing (argon2 or bcrypt).
2. Roles & Permissions: seed system roles (`Super Admin`, `Business Owner`), RBAC middleware (`requireRole`/`requirePermission` guards used by every protected route from here on).
3. Password reset flow (email delivery can be stubbed/logged to console initially — same "wire the real provider later" pattern as ADR 0008).
4. `GET /auth/me` — both frontends need this immediately for "is anyone logged in" state.

## Phase 2 — Master taxonomies

Super Admin CRUD + public read, per `docs/adr/` (Category is a lookup table; the rest are genuinely admin-managed per FR178).

1. Categories, Locations, Amenities, Attribute Tags, Property Types, Price Bands, Languages, Category Attributes (ADR 0004's dynamic-fields definitions).
2. Seed data: the categories and Yercaud locations already present in `frontend/src/lib/data.ts` and `Admin/src/mock/data.ts` — this becomes the real source of truth, replacing those mock arrays in Phase 10.

## Phase 3 — Businesses & Business Owner onboarding

1. Business registration/application (FR161) + Super Admin approval queue.
2. Business profile CRUD (owner-scoped; Super Admin full access).
3. Business Owner staff invites (`business_staff`, FR163).

## Phase 4 — Listings core + category detail modules

The central module — largest phase, split into sub-steps so it's independently testable.

1. Listings CRUD (base table): create/edit/list, scoped to the caller's own Businesses; Super Admin full access; first-publish approval gate (ADR 0005 — edits after that apply immediately).
2. Listing images (local disk upload), amenities, tags, dynamic attribute values (type-validated at the DB trigger, ADR 0004).
3. Hotel details module: rooms, availability blocks, languages (informational only — ADR 0001).
4. Restaurant details module: opening hours, menu items.
5. Activity details module: itinerary, inclusions.
6. Tour details module: itinerary, inclusions, attractions, languages.
7. Public read endpoints: browse/search/filter (`GET /listings` — category, location, price band, rating, full-text search via the existing `idx_listings_search` GIN index), listing detail fetch with its category-specific details joined in.

**Corrected in Phase 10:** the price-band half of entry 7 was never delivered. No schema relationship between `listings` and `price_bands` was ever added, so `GET /listings?priceBand=X` validated the band's existence and then returned unfiltered results. It had passing tests throughout — they asserted that an *unknown* band returns empty, which it did, and never that a known band excludes anything. Phase 10 gives a Listing a real `price_from` and makes the filter filter. Worth remembering the shape of the error: a validated-but-unused query parameter is indistinguishable from a working one at the API boundary, and only a test asserting *exclusion* catches it.

## Phase 5 — User interaction layer

1. Favorites (add/remove/list, grouped by category per FR77).
2. Reviews: submit (→ pending, ADR 0006), Super Admin approve/reject, owner reply, report.
3. Enquiries: submit (auth optional), owner respond, "My Enquiries", `sms_status` field wired to a no-op until Fast2SMS lands (ADR 0008).

## Phase 6 — Moderation & admin operations

1. Unified approval queue endpoint (businesses + listings + reviews + blog comments).
2. Audit log writes wired into every privileged mutation from Phases 1-5 (retrofit, not bolted on after the fact — add the `INSERT INTO audit_logs` call as each mutation endpoint is built, not in a separate pass).
3. Business Owner dashboard endpoints (views, enquiries, rating).
4. Super Admin dashboard endpoints (platform-wide KPIs).
5. "View as" / impersonate (FR160), recorded in the audit log.

## Phase 7 — Marketing

Promotions, Featured Listings, Banners — CRUD + public display endpoints. Low complexity, no new dependencies beyond Listings.

## Phase 8 — Blog / Content Management

1. Blog categories, posts (draft/pending/published), related posts, place mentions (linking a post to Listings).
2. Blog comments (pending → approved, same shape as Reviews), Article ratings.
3. FAQ categories & FAQs.

## Phase 9 — Static content, SEO, Newsletter

1. Content blocks (Home/About/Contact editorial sections — freeform JSONB, Super Admin edits only). Public read per page, Super Admin upsert per (page, block key).
2. SEO fields — expose via the existing endpoints, no new module needed. **This entry was half-wrong and is corrected here:** `listings.og_image`/`twitter_card` existed but were read and written by nothing, and those (not `seo_title`/`seo_description`, which were already exposed) are what FR189 was actually about. Phase 9 exposes them on Listings. `blog_posts` never had OG columns at all, so "already columns on `blog_posts`" was false — blog post OG fields remain **outstanding** and need a migration.
3. Newsletter subscribers (subscribe, unsubscribe, admin list with search/status filter). Subscribe is idempotent; export is client-side from the JSON list. Campaigns (FR188) are deferred — no campaign table, no email provider.

Still outstanding after Phase 9, all flagged in the Phase 9 spec (issue #9): blog post OG/Twitter fields, static-page SEO (FR189's third target, which has no home in the schema), and the Contact page's "Send Us a Message" form (FR128 — it needs its own table, since `enquiries` requires a `listing_id` and a site-level message has no Listing).

## Phase 10 — Frontend integration (after all of the above)

1. **Public frontend** (`frontend/`): replace `src/lib/data.ts` mock exports with real API calls, roughly following the Phase 2→9 order — Home, Directory, Hotels/Restaurants/Activities/Tours listing + details pages, Favorites, Profile ("My Enquiries"), Blog, FAQ, About, Contact.
2. **Admin panel** (`Admin/`): replace `src/mock/data.ts` — Dashboard, Businesses/Listings management, Enquiries inbox, Users/Admins/Roles & Permissions, Marketing, Blog CMS, Settings.
3. Auth wiring in both apps: login/session persistence, route guards by role.
4. If `openapi-typescript` (or similar) was set up in Phase 0.5, both integration passes consume the generated types instead of hand-written `fetch` calls.

## Explicitly deferred (not part of this plan)

- Fast2SMS integration — ADR 0008. `enquiries.sms_status` exists; the actual send call doesn't.
- OTA/Aggregator channel integration (Booking.com, Trivago, etc.) — ADR 0002.
