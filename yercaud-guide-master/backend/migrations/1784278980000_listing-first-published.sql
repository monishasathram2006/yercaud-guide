-- Up Migration
--
-- Records when a Listing first went live (Phase 10).
--
-- ADR 0005's whole bargain turns on "first publish": only a Listing's first
-- publish is gated by approval, and edits after that apply immediately with no
-- staging. But that moment was never recorded anywhere — it existed only
-- implicitly, in the status column's current value.
--
-- Phase 10 needs it explicitly, because the public site addresses Listings by
-- slug and the slug freezes at first publish: before it, the slug tracks the
-- name (a pending Listing has no public URL to break); after it, a rename must
-- not silently rewrite a live URL and break every link to it.
--
-- Current status can't answer "was this ever published": archiveListing allows
-- pending -> archived, so an archived Listing may never have been approved. A
-- timestamp answers it directly, and is worth having in its own right.
ALTER TABLE listings ADD COLUMN first_published_at TIMESTAMPTZ;

-- Existing approved Listings are already live and already linkable, so their
-- slugs must be frozen from here. Backfilled to created_at rather than NOW():
-- their first publish is in the past, and the exact moment wasn't recorded.
-- 'suspended' and 'archived' are only reachable from 'approved' (except
-- pending -> archived, which is the one case left null, correctly).
UPDATE listings SET first_published_at = created_at
WHERE status IN ('approved', 'suspended');

-- Down Migration

ALTER TABLE listings DROP COLUMN IF EXISTS first_published_at;
