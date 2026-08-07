---
status: accepted
---

# Businesses and Listings are archived, not hard-deleted, in normal operation

`listings.business_id` and every listing-child table cascade-delete from `listings`, and `businesses.id` cascades to `listings`. That's correct FK behavior for a genuine purge, but it means a routine "remove my listing" action, if implemented as a SQL `DELETE`, would permanently destroy that listing's Reviews and Enquiries — real historical data with value independent of whether the listing is still live.

We're adding `'archived'` to both `businesses.status` and `listings.status`. The normal path for an owner or Super Admin removing something from the public site is to set `status = 'archived'` (hides it, keeps every row and its history intact). A hard `DELETE` stays available in the schema for rare, deliberate purges, but the application should not wire routine "remove" actions to it.
