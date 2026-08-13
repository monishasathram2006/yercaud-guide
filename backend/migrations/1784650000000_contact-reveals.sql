-- Up Migration
--
-- Contact-info reveal logging (issue #15): a business-analytics signal, kept
-- separate from audit_logs — that table is FR162's privileged-action/security
-- trail (admin approvals, impersonation), a fundamentally different, low-volume
-- concern from a per-visitor "who viewed this Listing's contact info" stream.
--
-- One row per (listing, user) per calendar day: a User reloading or
-- revisiting the same Listing repeatedly in one day shouldn't inflate the
-- count. Write-only for now — no reporting endpoint yet; that's future work.

CREATE TABLE contact_reveals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revealed_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (listing_id, user_id, revealed_on)
);
CREATE INDEX idx_contact_reveals_listing ON contact_reveals(listing_id);

-- Down Migration

DROP TABLE contact_reveals;
