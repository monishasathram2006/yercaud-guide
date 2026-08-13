# Track anonymous page views to feed Featured ranking

The platform previously had no page-view tracking at all — the admin dashboard's `totalViews` was a documented hardcoded 0, not a query. To support interaction-weighted Featured Score (ADR-0011), we're adding View tracking for Listing and Blog Post detail pages: at most one counted View per (item, anonymous session cookie, calendar day), so repeat browsing in one sitting doesn't inflate the count but a genuine return visit the next day does. No login is required to be counted, since most directory traffic is anonymous — but a signed-in Business Owner's views of their own Listing are excluded, mirroring how `contact_reveals` already excludes self-reveals. A View is strictly a detail-page load; card or list impressions are not tracked.

## Consequences

The admin dashboard's `totalViews: 0` no-op (`backend/src/modules/admin/service.ts`) should be revisited once this ships, since real view data now exists.
