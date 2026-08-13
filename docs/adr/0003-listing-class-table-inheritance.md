---
status: accepted
---

# Listings use class-table inheritance, not a single JSON-typed table

Only four Listing categories have bespoke, stable fields defined in the FR doc: Hotel (rooms, amenities, star rating, check-in/out), Restaurant (menu, opening hours, cuisine), Activity (itinerary, difficulty, duration), and Tour & Travel (itinerary, inclusions/exclusions, languages). We decided to model this as a shared `listings` base table (name, business_id, category, location, images, contact, tags, status, ...) plus one 1:1 detail table per rich type (`hotel_details`, `restaurant_details`, `activity_details`, `tour_details`), rather than a single `listings` table with a JSON `type_specific` column.

The four remaining directory categories (Travel, Shopping, Health & Wellness, Other Services) have no bespoke fields defined anywhere in the FR doc and use the base `listings` table alone, with no detail table.

We chose table-per-type over JSON because the rich types have real, differently-shaped, individually-queried fields (e.g. filtering hotels by star rating) that a JSON blob would make awkward to index, validate, and query against.
