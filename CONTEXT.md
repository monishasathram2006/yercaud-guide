# Yercaud Business Directory

A business directory for Yercaud: a public site where visitors browse and contact local businesses (hotels, restaurants, activities, tours, travel services, etc.), and a dual-role admin panel where Business Owners manage their own listings and a Super Admin manages the platform.

## Language

**Enquiry**:
A message (name, email, phone, message) a visitor submits to a Business, landing in that Business Owner's enquiry inbox with a trackable status. This is the sole conversion mechanism on the platform — there is no in-app reservation or payment.
_Avoid_: Booking, reservation (the platform does not process bookings or payments; a visitor enquires, then arranges things directly with the business off-platform)

**Room Inventory / Rate / Availability Calendar**:
Informational fields a Business Owner maintains on a Hotel listing (e.g. "3 rooms left", nightly rate, a calendar of open/blocked dates) so the public listing shows live-looking price and vacancy info. Purely descriptive — no visitor action reserves a room or decrements this data; it's edited only by the Business Owner.
_Avoid_: Booking record, reservation

**Business**:
The owner/merchant entity — one Business Owner signup, one owner dashboard, one profile (contact details, address, social links, logo). A Business can own multiple Listings, and those Listings can span different categories (e.g. a resort's Business can hold both a Hotel listing and a Restaurant listing).

**Listing**:
A single publicly-visible, bookable-in-the-browsing-sense item belonging to a Business — one directory card, one details page, one category (Hotel, Restaurant, Activity, Tour & Travel, Travel service, ...). A Business groups one or more Listings.

**User**:
Every account on the platform — public visitors, Business Owners, staff, and Super Admins — is one row in a single identity table. What a User can do is determined entirely by the Roles assigned to them, not by which table they're in.

**Role / Permission**:
Admin-defined units of access (e.g. Business Owner, Super Admin, or a custom role a Super Admin creates) made of per-module permissions (view, create, edit, delete, approve, publish). A User can hold zero roles (plain public visitor) or more than one.

**Review**:
A rating + text a User submits for exactly one Listing (one per User per Listing), held as `pending` and invisible on the public site until a Super Admin approves it. A Business Owner may reply to an approved review or report it, but cannot approve/reject it themselves.

**Location**:
A flat, Super Admin-managed lookup of areas/landmarks within Yercaud (e.g. "Near Lake", "Anna Salai", "Kottachedu"). Not hierarchical — the directory is scoped to a single town.

**Similar Listings**:
The "Similar {Category}" section on a Listing's detail page: up to 4 other approved Listings in the same Category, ranked by embedding similarity (cosine distance on the listing's content embedding) against the Listing being viewed. Purely content-based — not driven by visitor behavior (see ADR-0014).
_Avoid_: Recommended, Related, People Also Viewed (a behavior-based mechanism, which this deliberately isn't)

**Blog Comment**:
A flat (non-threaded) comment a User posts on a Blog Post, held `pending` until Super Admin approval — same moderation shape as Review.

**Article Rating**:
A 1-5 rating a User gives a Blog Post, one per User per Post — separate from Blog Comments.

### Featured Placement

**View**:
A visitor loading a Listing's or Blog Post's own detail page — not a card or list appearance — counted at most once per item per visitor per day. Anonymous visitors are counted via a session cookie; a Business Owner's views of their own Listing are not counted.
_Avoid_: Page view, Impression, Click

**Featured Score**:
The computed number that ranks a Listing or Blog Post within its category for Featured placement: primarily its Bayesian-weighted rating, with interaction volume (Enquiries weighted highest, then Favorites/Contact Reveals, then Views) breaking ties among similarly-rated items.
_Avoid_: Rating (Featured Score also factors in interactions, not rating alone)

**Featured**:
A Listing's or Blog Post's placement in its category's home-page shelf (Hotels, Restaurants, Activities, Tours & Travels, or Blog), earned by Featured Score and recomputed daily. Requires at least one approved Review (or Article Rating, for a Blog Post) to qualify.
_Avoid_: Popular, Trending (see Badge — a separate, manually-assigned label)

**Sponsored**:
A paid Featured slot: a Business Owner pays off-platform, and a Super Admin marks their Listing Sponsored for an agreed period, guaranteeing it a slot in its category's shelf regardless of Featured Score or review history. Capped at one of the shown slots per category and visibly badged, so visitors can tell it apart from Featured. Not available for Blog Posts, which have no owning Business.
_Avoid_: Featured (the earned, ranked counterpart), Promotion (the existing discount-campaign feature — a different concept)

**Badge**:
A Super Admin-assigned label (e.g. "Popular", "Best Seller", "Luxury", "Budget") shown as a pill on a Listing's card. Independent of Featured and Sponsored — a Listing can carry a Badge, appear in a Featured shelf, both, or neither.

## Known Gaps

**Admin dashboard "Views" KPI is stale-hardcoded to 0**:
`getDashboardKpis` in `backend/src/modules/admin/service.ts` returns `totalViews: 0` unconditionally, with a comment claiming no page-view tracking exists in the schema. That's no longer true — ADR-0013 shipped `listing_views` / `blog_post_views` tables and `recordListingView` (`backend/src/modules/listings/listing-views.ts`). ADR-0013's own Consequences section calls out that the dashboard should be revisited once View tracking landed; it hasn't been. `DashboardSuper.tsx`'s "Views" KPI card and its "Top Rated Listings" section (labeled "top performing" in a comment, but actually sorted by rating since Views weren't wired up) both need updating once `totalViews` is wired to real counts.

**Admin Reviews page has no reviewer identity column**:
`Admin/src/admin/pages/Reviews.tsx`'s table shows Listing, Rating, Review text, Date, Status — no column identifying who left the review. The `Review` schema only carries `userId` with no name join exposed to the admin API, so there's nothing to render even if a column existed. The file's own top comment (`Reviews.tsx:15-16`) is stale here too: it says "Reviewers show as 'Visitor'", but no such placeholder exists in the code — the column was dropped entirely rather than rendering a placeholder. Fix candidates: add a reviewer name/email to the reviews list contract, and correct the stale comment either way.

**Admin Reviews page has no "Reported" filter**:
Reviews can be reported (`POST /reviews/{id}/report`, per `Reviews.tsx:18` comment), but no endpoint reads reports back, so reported reviews can't be surfaced or filtered in the moderation queue. The mock version had a "Reported" filter; it was correctly removed rather than faked, but the underlying capability (surfacing reports to a moderator) doesn't exist yet.
