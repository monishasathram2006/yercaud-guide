---
status: accepted
---

# Listing edits apply immediately; Super Admin reviews after the fact

FR166 literally describes edits to a live listing being held in a Super Admin approval queue "before they are published." We decided against that: only the *first* publish of a Business (owner onboarding, FR161) and its initial Listings is gated behind Super Admin approval. Once a Business/Listing is live, a Business Owner's edits apply directly to the row immediately — there is no pending-draft/staging column — and the Super Admin reviews and can correct or unpublish afterward using their existing full-CRUD access (FR175), rather than every edit blocking on admin turnaround.

This keeps trusted, already-approved owners able to keep prices, photos, and descriptions current without friction, and avoids building a staging/draft-versioning mechanism for something that's a spot-check concern, not a pre-publish gate.
