-- Up Migration
--
-- FR128's "Send Us a Message" form — Phase 10.
--
-- Flagged by the Phase 9 spec as an unplanned gap and left unbuilt: the form
-- exists on the Contact page and has had nowhere to POST.
--
-- Deliberately not an Enquiry. Per CONTEXT.md an Enquiry is a message to a
-- *Business*, landing in that Business Owner's inbox, and enquiries.listing_id
-- is NOT NULL. A message to the platform has no Business and no Listing.
-- Making listing_id nullable would force every Enquiry consumer — the owner
-- inbox, the respond flow, "My Enquiries" — to handle an ownerless Enquiry that
-- none of them have any use for.
CREATE TABLE contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Set when a signed-in User submits; null for an anonymous visitor. Same
  -- shape as enquiries.user_id, and SET NULL for the same reason: deleting an
  -- account must not delete the message the platform still has to answer.
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  -- Free text, not a CHECK constraint. FR128 calls Subject a dropdown, but the
  -- options are contactContent.subjects — editorial copy that Phase 9's Content
  -- Blocks make a Super Admin's to edit. A database enum would mean a migration
  -- every time someone adds "Careers" to a dropdown, which is exactly the
  -- coupling Content Blocks exist to remove.
  subject VARCHAR(255) NOT NULL,
  phone VARCHAR(30),
  message TEXT NOT NULL,
  -- FR128's Privacy Policy checkbox. Stored, not just validated: the point of
  -- a consent checkbox is being able to show afterwards that it was ticked.
  consented BOOLEAN NOT NULL,
  -- Mirrors enquiries' vocabulary. Status transitions rather than deletion,
  -- per ADR 0010.
  status VARCHAR(20) NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'responded', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contact_messages_created ON contact_messages(created_at DESC);
CREATE INDEX idx_contact_messages_status ON contact_messages(status);

-- Down Migration

DROP TABLE IF EXISTS contact_messages;
