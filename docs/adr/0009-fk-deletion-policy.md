---
status: accepted
---

# Explicit FK deletion policy, keyed to whether data is personal or administrative

A review found several FKs relying on Postgres's implicit `ON DELETE NO ACTION` default, which would silently block deleting a User's account (FR94) the moment they'd ever sent an Enquiry, been audit-logged, filed a Report, authored a Blog Post, or owned a Business. `users.status` already has a `'deleted'` value, implying soft-delete (flip the status, keep the row) is the primary account-deletion mechanism — but the FKs weren't built assuming that consistently, and a hard `DELETE FROM users` (support cleanup, GDPR erasure) should still behave sensibly.

We're applying one explicit rule everywhere, rather than leaving any FK on the implicit default:

- **CASCADE** — content that *is* the user's own personal expression: `reviews.user_id`, `favorites.user_id`, `blog_comments.user_id`, `article_ratings.user_id`. Deleting the account removes these with it.
- **SET NULL** — records that capture their own point-in-time snapshot or are administrative/historical, and remain meaningful without the identity attached: `enquiries.user_id` (name/email/phone are already captured directly on the row), `audit_logs.actor_id`, `reports.reporter_id` (made nullable for this), `content_blocks.updated_by`, `business_staff.invited_by`, `listings.location_id`, `hotel_details.property_type_id`.
- **RESTRICT** (explicit, not the implicit default) — ownership/authorship that must always have a responsible party, forcing reassignment before deletion: `businesses.owner_id`, `blog_posts.author_id`, `blog_posts.category_id`, `listings.category_id`.

Every FK in the schema now states its `ON DELETE` behavior explicitly rather than relying on the default.
