---
status: accepted
---

# Partial dynamism for category fields, not a full content-model engine

We considered making Listing categories fully dynamic — a Super Admin defines a brand-new rich category (its own tabs, photo galleries, structured itineraries) entirely from the admin UI with no code changes, the way a headless CMS content-model builder works. We rejected that: it's a large system in its own right (effectively a form/page builder), and it's overkill this early — a genuinely new rich category is rare enough that a deliberate migration + new detail table (as ADR 0003 already does for Hotel/Restaurant/Activity/Tour) is the right amount of engineering when it happens.

Instead we're adding a lighter, generic attributes layer: a `category_attributes` definition table (Super Admin adds simple scalar fields — text, number, boolean, select — per category) plus a `listing_attribute_values` table. This lets a Super Admin add small filterable fields (e.g. "Pet Friendly") to any category, existing or new, without a deploy, while structured/repeating data (rooms, itineraries, menus) stays in the dedicated detail tables from ADR 0003.
