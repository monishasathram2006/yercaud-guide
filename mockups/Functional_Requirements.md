# Yercaud Business Directory — Functional Requirements

Derived from the UI mockups in the `mockups/` folder. Requirements are grouped by page/module and listed in a numbered listicle format.

---

## 1. Global / Common (All Pages)

- **Functional Requirement 1:** The system shall display a global header with the Yercaud Business Directory logo that links back to the Home page.
- **Functional Requirement 2:** The system shall provide a primary navigation menu with links to Home, Hotels, Restaurants, Activities, Travel, Tours & Travels, Directory, and Blog.
- **Functional Requirement 3:** The system shall provide a "Favorites" link in the header for quick access to the user's saved items.
- **Functional Requirement 4:** The system shall provide a "Sign In" button for unauthenticated users and shall replace it with the user's name/avatar and account dropdown when signed in.
- **Functional Requirement 5:** The system shall highlight the currently active navigation item.
- **Functional Requirement 6:** The system shall display a global footer with a newsletter subscription (email input + Subscribe button), social media links (Facebook, Instagram, Twitter, YouTube), Quick Links, Top Categories, Explore links, and Support links.
- **Functional Requirement 7:** The system shall display a copyright notice in the footer.
- **Functional Requirement 8:** The system shall provide breadcrumb navigation on inner pages showing the user's current location within the site hierarchy.

---

## 2. Home Page

- **Functional Requirement 9:** The system shall display a hero banner with a headline and introductory description of the directory.
- **Functional Requirement 10:** The system shall provide a universal search bar in the hero allowing users to search by keyword ("What are you looking for?"), Location, and Check-in / Date, with a Search button.
- **Functional Requirement 11:** The system shall display trust indicators in the hero (Best Prices, Verified Listings, Direct Contact, Local Support).
- **Functional Requirement 12:** The system shall display category shortcut cards (Hotels, Restaurants, Activities, Travel Services, Tours & Travels) each with an "Explore" action linking to the respective category.
- **Functional Requirement 13:** The system shall display a "Featured in Yercaud" section showing featured listing cards across multiple categories.
- **Functional Requirement 14:** Each featured card shall show an image, category badge, name, location, rating with review count, a tag/attribute, price, a favorite (heart) toggle, and a "View Details" action.
- **Functional Requirement 15:** The system shall provide a "View All" link for the featured listings section.
- **Functional Requirement 16:** The system shall display a "Why Choose Yercaud Business Directory?" section describing key value propositions (Verified Listings, Best Prices, Direct Contact, Local Support, Explore Yercaud).
- **Functional Requirement 17:** The system shall display a promotional call-to-action banner ("Plan Your Perfect Yercaud Getaway") with key statistics (500+ Businesses, 50+ Activities, 1000+ Happy Travelers, 4.6 Average Rating) and a "Start Exploring" button.

---

## 3. Directory / Listing Page

- **Functional Requirement 18:** The system shall display a directory hero with a search bar supporting keyword, Location, and Category selection with a Search button.
- **Functional Requirement 19:** The system shall display category tiles (Hotels, Restaurants, Activities, Travel, Tours & Travels, Shopping, Health & Wellness, Other Services) each showing a live listing count.
- **Functional Requirement 20:** The system shall display the total number of results (e.g., "Showing 250+ businesses in Yercaud").
- **Functional Requirement 21:** The system shall provide a "Filter By" sidebar including keyword search within the directory, Category selection, Location, Rating filter, and Price Range filter.
- **Functional Requirement 22:** The system shall provide a "Clear Filters" action to reset all applied filters.
- **Functional Requirement 23:** The system shall provide a "Sort by" control (e.g., Recommended) for ordering results.
- **Functional Requirement 24:** The system shall display business results as list rows showing image, name, category badge, location, rating & reviews, price indicator, amenity tags, phone number, website, a favorite toggle, and a "View Details" action.
- **Functional Requirement 25:** The system shall display a "List Your Business in Yercaud Directory" promotional section with a "List Your Business" call-to-action and supporting benefits.

---

## 4. Hotels Listing Page

- **Functional Requirement 26:** The system shall display a hotels-specific hero with a search bar supporting Location, Check-in/Check-out dates, and Guests & Rooms selection, with a "Search Hotels" button.
- **Functional Requirement 27:** The system shall display hotel trust badges (Verified Pricing, Verified Properties, Direct Contact, Local Support).
- **Functional Requirement 28:** The system shall provide a filter sidebar with a Price Range/night slider, Property Type (Hotels, Resorts, Homestays, Villas, Budget Stays), Star Rating, Amenities (Free Wi-Fi, Parking, Restaurant, Room Service, Swimming Pool, etc.), and Guest Rating filters.
- **Functional Requirement 29:** The system shall display the number of hotels matching the criteria (e.g., "Showing 24 hotels in Yercaud").
- **Functional Requirement 30:** The system shall display hotel cards in a grid with image, promotional badge (Popular, Luxury, Best Seller, Budget), favorite toggle, name, location, rating with reviews, amenity icons, price per night, and a "View Details" action.
- **Functional Requirement 31:** The system shall provide a "Sort by" control for hotel results.
- **Functional Requirement 32:** The system shall display a promotional "Stay in the Heart of Nature" section with an "Explore Resorts" call-to-action.

---

## 5. Hotel Details Page

- **Functional Requirement 33:** The system shall display the hotel name, promotional badge, location/address, rating with review count, and a quality label (e.g., "Excellent").
- **Functional Requirement 34:** The system shall display an image gallery with a main image, thumbnail strip, image counter (e.g., "1 / 20"), and navigation controls.
- **Functional Requirement 35:** The system shall display quick amenity highlights and a short description of the hotel.
- **Functional Requirement 36:** The system shall provide primary actions: "View Availability", "Save to Favorites", and "Share".
- **Functional Requirement 37:** The system shall provide tabbed navigation for Overview, Rooms, Amenities, Reviews, Location, and Policies.
- **Functional Requirement 38:** The system shall display an "About this Hotel" section with check-in/check-out times, guests & rooms info, and cancellation policy.
- **Functional Requirement 39:** The system shall display "Top Amenities" and "Hotel Highlights".
- **Functional Requirement 40:** The system shall provide an "Availability & Rates" widget with date selection, guests & rooms selection, a "View Availability" action, starting price, and a "Send Enquiry" action. (Informational only — the widget displays owner-maintained rates and availability; it does not create a reservation. See ADR 0001.)
- **Functional Requirement 41:** The system shall display a "Reviews & Ratings" section with an overall score, star-rating distribution bars, individual reviews, and a "View All Reviews" link.
- **Functional Requirement 42:** The system shall display a "Location" section with an embedded map and a "What's Nearby" list showing nearby points of interest and distances.
- **Functional Requirement 43:** The system shall display a "Hotel Details" panel with address, phone, email, website, property type, star rating, and languages spoken.
- **Functional Requirement 44:** The system shall provide a "Report this listing" action.

---

## 6. Restaurant Details Page

- **Functional Requirement 45:** The system shall display the restaurant name, badge (e.g., Best Rated), address, rating with review count, and attribute tags (Multi Cuisine, Pure Veg & Non-Veg, Moderate, Family Friendly).
- **Functional Requirement 46:** The system shall display an image gallery with thumbnails and provide "Send Enquiry" and "Add to Favorites" actions.
- **Functional Requirement 47:** The system shall provide tabbed navigation for Overview, Menu, Highlights, Amenities, Reviews, and Location.
- **Functional Requirement 48:** The system shall display an "About" section with key info (Cuisine, Timings, Average Cost, Best For).
- **Functional Requirement 49:** The system shall display "Restaurant Highlights" (e.g., Scenic View, Hygienic Food, Live Music, Ample Parking, Indoor & Outdoor, Party Friendly).
- **Functional Requirement 50:** The system shall display a "Popular Dishes" carousel with dish images, names, and prices.
- **Functional Requirement 51:** The system shall display a "Reviews & Ratings" section with rating distribution, individual reviews with helpful votes, a "Write a Review" action, and a "View all reviews" link.
- **Functional Requirement 52:** The system shall display a "Contact Information" panel (Phone, Email, Website, Open status, Address) with social media links.
- **Functional Requirement 53:** The system shall provide a "Have a Question?" inquiry form capturing Name, Email, Phone, and Message with a "Send Inquiry" action.
- **Functional Requirement 54:** The system shall display an "Opening Hours" panel listing hours for each day of the week.
- **Functional Requirement 55:** The system shall display a "Location" section with a map and a "What's Nearby" list.

---

## 7. Activity Details Page

- **Functional Requirement 56:** The system shall display the activity name, category badge, location, rating with reviews, and attribute tags (Adventure, Outdoor Activity, All Ages, Safety Gear Provided, Certified Guide, Insurance Included).
- **Functional Requirement 57:** The system shall display an image gallery with a favorite toggle and a "Read More" expandable description.
- **Functional Requirement 58:** The system shall provide an enquiry widget showing price per person, date selection, participant selector (increment/decrement), and a "Send Enquiry" action, plus a note that availability and final pricing are confirmed directly with the business.
- **Functional Requirement 59:** The system shall provide tabbed navigation for Overview, Inclusions, Itinerary, Safety, Location, Reviews, and FAQs.
- **Functional Requirement 60:** The system shall display an "About This Activity" section with key metrics (Duration, Max Height, Total Distance, Difficulty Level).
- **Functional Requirement 61:** The system shall display "What to Expect", "Inclusions", and an "Activity Itinerary" with time durations per step.
- **Functional Requirement 62:** The system shall display an "Activity Highlights" panel.
- **Functional Requirement 63:** The system shall display a "Need Help?" support panel with phone, email, and support hours.
- **Functional Requirement 64:** The system shall provide a "Share This Activity" section with social sharing options (Facebook, Instagram, WhatsApp, Twitter, copy link).
- **Functional Requirement 65:** The system shall display a "You May Also Like" section with related activity cards.

---

## 8. Tours & Travels Service Details Page

- **Functional Requirement 66:** The system shall display the tour name, category badge, location, rating with reviews, attribute tags, and a description.
- **Functional Requirement 67:** The system shall display an image gallery with counter and provide "Send Enquiry", "Save to Favorites", and "Share" actions.
- **Functional Requirement 68:** The system shall provide tabbed navigation for Overview, Itinerary, Inclusions, Exclusions, Reviews, Location, and FAQ.
- **Functional Requirement 69:** The system shall display an "About This Tour" section with key info (Duration, Tour Type, Best For, Languages) and Highlights.
- **Functional Requirement 70:** The system shall display a "Custom Package Available" section with a "Get Custom Quote" action.
- **Functional Requirement 71:** The system shall display a detailed timed "Itinerary" with pickup, stops, and drop-off.
- **Functional Requirement 72:** The system shall provide an enquiry widget with tour date and traveler selection and a "Send Enquiry" action.
- **Functional Requirement 73:** The system shall display "What's Included" and "Not Included" lists.
- **Functional Requirement 74:** The system shall display a "Need Help?" panel and a "Send Enquiry" action.
- **Functional Requirement 75:** The system shall display "Top Attractions Covered" and a "Reviews & Ratings" summary with a "View All Reviews" action.
- **Functional Requirement 76:** The system shall provide a "Customize Tour" action to add or remove stops.

---

## 9. Favorites / Wishlist Page

- **Functional Requirement 77:** The system shall display all items the user has saved to favorites, grouped by category (Hotels, Restaurants, Activities, Travel Services, Tours & Travels).
- **Functional Requirement 78:** The system shall display the count of favorited items per category and an overall "All Favorites" count.
- **Functional Requirement 79:** The system shall provide a category filter sidebar to view favorites by type.
- **Functional Requirement 80:** The system shall provide a "Sort by" control (e.g., Recently Added) for favorites.
- **Functional Requirement 81:** Each favorite card shall display image, name, category, location, rating, price, an active favorite (heart) toggle to remove, and a "View Details" action.
- **Functional Requirement 82:** The system shall provide a "View All" link per category section.
- **Functional Requirement 83:** The system shall provide Quick Actions (Recently Viewed, Search Saved, Compare List).
- **Functional Requirement 84:** The system shall display an "Explore More in Yercaud" promotional card with an "Explore Now" action.

---

## 10. User Profile Page

- **Functional Requirement 85:** The system shall display a profile header with cover image, profile photo, user name, verified badge, and membership date.
- **Functional Requirement 86:** The system shall provide a profile photo edit control.
- **Functional Requirement 87:** The system shall provide tabbed navigation for Overview, My Enquiries, Reviews, Favorites, My Listings, and Account Settings.
- **Functional Requirement 88:** The system shall display an "About Me" section with bio, email, phone, location, and languages, plus an "Edit Profile" action.
- **Functional Requirement 89:** The system shall display a "My Enquiries" section listing enquiries the user has sent, with image, listing name, status (Sent/Responded/Closed), date sent, and a "View Enquiry" action, plus a "View All Enquiries" link.
- **Functional Requirement 90:** The system shall display a "My Reviews" section with reviewed items, ratings, dates, and a "View All Reviews" link.
- **Functional Requirement 91:** The system shall display a "My Favorites" section with saved item cards and a "View All Favorites" link.
- **Functional Requirement 92:** The system shall display a "Profile Completion" widget with a percentage indicator and a checklist (Basic Information, Contact Details, Profile Photo, About Me, Email Verification).
- **Functional Requirement 93:** The system shall display a "My Statistics" panel (Enquiries, Reviews, Favorites, Listings, Helpful Votes).
- **Functional Requirement 94:** The system shall display an "Account Settings" quick-access panel (Personal Information, Change Password, Notification Preferences, Privacy Settings, Delete Account).

---

## 11. Edit Profile Page

- **Functional Requirement 95:** The system shall allow the user to edit Personal Information (Full Name, Username, Date of Birth, Language, Gender).
- **Functional Requirement 96:** The system shall allow the user to edit Contact Details (Email Address, Phone Number with country code, Address, Postal Code).
- **Functional Requirement 97:** The system shall allow the user to edit an "About Me" short bio with a maximum character limit (500) and live character count.
- **Functional Requirement 98:** The system shall display Email Verification status and provide a "Change Email" action.
- **Functional Requirement 99:** The system shall allow the user to upload a new profile photo or remove the existing photo (JPG, PNG, WEBP; max 2MB).
- **Functional Requirement 100:** The system shall provide a section navigation sidebar (Personal Information, Contact Details, Profile Photo, About Me, Email Verification).
- **Functional Requirement 101:** The system shall provide "Save Changes", "Cancel", and "Back to Profile" actions.

---

## 12. Blog Listing Page

- **Functional Requirement 102:** The system shall display a blog hero with a title, description, and an article search bar with a Search button.
- **Functional Requirement 103:** The system shall display all blog articles with image, category label, title, excerpt, publish date, reading time, and author.
- **Functional Requirement 104:** The system shall display the total number of articles (e.g., "24 Articles").
- **Functional Requirement 105:** The system shall provide a "Sort by" control (e.g., Latest) for articles.
- **Functional Requirement 106:** The system shall display a "Categories" sidebar with category names and post counts, and a "View All Categories" link.
- **Functional Requirement 107:** The system shall display a "Popular Articles" sidebar list.
- **Functional Requirement 108:** The system shall provide a "Subscribe to Our Newsletter" widget with an email input and Subscribe action.
- **Functional Requirement 109:** The system shall provide pagination controls for browsing articles.
- **Functional Requirement 110:** The system shall provide a "Submit Your Story" call-to-action.

---

## 13. Blog Details Page

- **Functional Requirement 111:** The system shall display the article title, category label, reading time, author with role, publish date, rating with number of ratings, and a "Share Article" action.
- **Functional Requirement 112:** The system shall display the full article body with headings, images, captions, and info blocks.
- **Functional Requirement 113:** The system shall display an "Article Summary" panel (Category, Published date, Reading Time, Views, Comments).
- **Functional Requirement 114:** The system shall display a "Popular Places Mentioned" panel with linked places.
- **Functional Requirement 115:** The system shall display supplementary info panels (e.g., Travel Budget Estimate, Best Time to Visit).
- **Functional Requirement 116:** The system shall display a "Related Articles" panel.
- **Functional Requirement 117:** The system shall display a "Reader Engagement" section (Helpful, Comments, Shares, Saved counts) with average reader rating and a "Rate this article" action.
- **Functional Requirement 118:** The system shall display a "Comments" section listing user comments with author, badge, timestamp, rating, like, and reply actions.
- **Functional Requirement 119:** The system shall provide a "Leave a Comment" form with a "Post Comment" action.
- **Functional Requirement 120:** The system shall provide "Share" and "Save" actions for the article and a "More from Yercaud Blog" section with related posts.

---

## 14. About Page

- **Functional Requirement 121:** The system shall display an "About Yercaud Guide" hero with a description and key statistics (Listed Businesses, Happy Travelers, Average Rating).
- **Functional Requirement 122:** The system shall display an "Our Mission & Vision" section.
- **Functional Requirement 123:** The system shall display a "Why Choose Yercaud Guide?" section with value propositions (Verified Listings, Best Prices, Direct Contact, Local Support, Explore Yercaud, Support Local).
- **Functional Requirement 124:** The system shall display an "Our Journey" section with narrative text and milestone stats (Founded year, Businesses, Monthly Visitors).
- **Functional Requirement 125:** The system shall display a "Be a Part of Yercaud Guide" call-to-action with a "List Your Business" button.

---

## 15. Contact Us Page

- **Functional Requirement 126:** The system shall display a Contact hero with a title and supporting text.
- **Functional Requirement 127:** The system shall display contact method cards (Call Us, Email Us, Visit Us, Live Chat, Support) with relevant details and hours.
- **Functional Requirement 128:** The system shall provide a "Send Us a Message" form capturing Name, Email, Subject (dropdown), Phone (optional), and Message with a character limit, a Privacy Policy consent checkbox, and a "Send Message" action.
- **Functional Requirement 129:** The system shall display an "Our Location" map with the business address.
- **Functional Requirement 130:** The system shall display an "Explore Yercaud" promotional card with an "Explore Now" action.
- **Functional Requirement 131:** The system shall display a "Frequently Asked Questions" quick-reference section with expandable questions and a "View All FAQs" link.

---

## 16. FAQ Page

- **Functional Requirement 132:** The system shall display an FAQ hero with a title, description, and a question search bar.
- **Functional Requirement 133:** The system shall display a list of frequently asked questions in an expandable/collapsible accordion format.
- **Functional Requirement 134:** The system shall display an "FAQ Categories" sidebar with categories and question counts (Enquiries & Contacting Businesses, Listings & Business Owners, Activity Information, Safety & Guidelines, Policies & Cancellations, General Questions).
- **Functional Requirement 135:** The system shall display a "Still Need Help?" panel with phone, email, support hours, and a "Contact Support" action.
- **Functional Requirement 136:** The system shall display a "Popular Topics" list and a "Quick Tips" panel.
- **Functional Requirement 137:** The system shall provide an "Ask a Question" call-to-action.

---

## 17. Admin Dashboard

- **Functional Requirement 138:** The system shall provide an admin panel with a collapsible sidebar navigation grouped into Manage Directory, Enquiries, Users & Admins, Marketing, and Settings.
- **Functional Requirement 139:** The system shall provide a top bar with search, notifications (with unread count), and an admin profile menu.
- **Functional Requirement 140:** The system shall display dashboard KPI cards (Total Businesses, Total Users, Total Listings, Total Enquiries, Total Views, Average Rating) with period-over-period change indicators.
- **Functional Requirement 141:** The system shall provide a date-range selector for dashboard metrics.
- **Functional Requirement 142:** The system shall display a "Business Overview" chart (Businesses Added vs. Businesses Approved) over a selectable time period.
- **Functional Requirement 143:** The system shall display a "Businesses by Category" breakdown with a donut chart, counts, and percentages.
- **Functional Requirement 144:** The system shall display a "Recently Added Listings" list with item, location, status (Pending/Approved), and time.
- **Functional Requirement 145:** The system shall display a "Recent Enquiries" list with user, enquiry type, message summary, and time.
- **Functional Requirement 146:** The system shall display a "Top Performing Listings" ranked list with rating and view counts.
- **Functional Requirement 147:** The system shall display a "Business Approval" summary (Pending Approval, Rejected, Approved Today).
- **Functional Requirement 148:** The system shall display a "User Statistics" summary (New Users, Active Users) with change indicators.
- **Functional Requirement 149:** The system shall provide Quick Actions (Add Business, Add Category, Add Admin, Send Notification).
- **Functional Requirement 150:** The system shall allow admins to manage Directory entities: Businesses, Categories, Locations, Listings, and Reviews.
- **Functional Requirement 151:** The system shall allow admins to manage Enquiries.
- **Functional Requirement 152:** The system shall allow admins to manage Users, Admins, and Roles & Permissions.
- **Functional Requirement 153:** The system shall allow admins to manage Marketing features: Promotions, Featured Listings, Best Deals, and Banner Management.
- **Functional Requirement 154:** The system shall provide admin Settings for General Settings and Notifications.

---

# Part B — Multi-Role Admin & Aggregator Integration

> **Scope note:** Requirements FR 155 onward extend the admin panel to support **two distinct admin user types** and **third-party aggregator / OTA integration**. Each requirement is tagged with the role(s) it applies to:
>
> - **[SA]** — Super Admin: platform-wide owner with full control over all businesses, users, content, settings, and integrations.
> - **[BO]** — Business Owner: a merchant who manages only their own business(es) and listings. All Business Owner data is isolated to entities they own.
> - **[Both]** — capability available to both roles, scoped to their respective data boundary.

---

## 18. User Roles & Permission Model

- **Functional Requirement 155:** [Both] The system shall support at least two admin account types — **Super Admin** and **Business Owner** — and shall determine each account's accessible features, menu items, and data scope based on its assigned role.
- **Functional Requirement 156:** [SA] The system shall grant Super Admins platform-wide access to all businesses, listings, users, content, marketing, financials, integrations, and settings.
- **Functional Requirement 157:** [BO] The system shall restrict Business Owners to only the business(es) and listings they own, enforcing data isolation so that no Business Owner can view or modify another owner's data, platform settings, user management, or global content.
- **Functional Requirement 158:** [Both] The system shall render a role-specific sidebar and dashboard, hiding menu items and actions the signed-in role is not authorized to use.
- **Functional Requirement 159:** [SA] The system shall provide a granular Roles & Permissions module allowing Super Admins to define custom roles and toggle per-module permissions (view, create, edit, delete, approve, publish) for both admin types and sub-users.
- **Functional Requirement 160:** [SA] The system shall allow a Super Admin to "view as" / impersonate a Business Owner account for support and troubleshooting, with the action recorded in the audit log.
- **Functional Requirement 161:** [Both] The system shall provide a Business Owner onboarding flow (registration/application), and shall require Super Admin approval before a new Business Owner account and its listings become active/published.
- **Functional Requirement 162:** [SA] The system shall maintain an audit log of privileged admin actions (create/edit/delete/approve/login/impersonate) with actor, timestamp, entity, and change details.
- **Functional Requirement 163:** [BO] The system shall allow a Business Owner to invite and manage sub-users (staff) for their business with limited, owner-configurable permissions.

---

## 19. Business Owner Portal

- **Functional Requirement 164:** [BO] The system shall display a Business Owner dashboard scoped to the owner's listings, showing their KPIs (Views, Enquiries, Average Rating) with period-over-period change indicators and a date-range selector.
- **Functional Requirement 165:** [BO] The system shall allow a Business Owner to create and edit their own listings across supported types (Hotel, Restaurant, Activity, Tour & Travel, Travel service), including all rich fields (image gallery, description, amenities/highlights, itinerary, inclusions/exclusions, menu/popular dishes, opening hours, pricing, location/map, "What's Nearby").
- **Functional Requirement 166:** [BO] The system shall submit a new Business Owner's first listings into a Super Admin approval queue before they are published to the public site; subsequent edits to an already-published listing apply immediately and are reviewable by the Super Admin afterward (see ADR 0005).
- **Functional Requirement 167:** [BO] The system shall allow a Business Owner to maintain informational Room Inventory, Rates, and an Availability Calendar for their Hotel listings (e.g. rooms available, nightly rate, blocked/open dates) for display purposes only — this does not create or process a reservation (see ADR 0001).
- **Functional Requirement 168:** [BO] The system shall provide a Business Owner listings module showing the status (Draft/Pending/Approved) of all their listings, including which are awaiting Super Admin approval.
- **Functional Requirement 169:** [BO] The system shall provide a Business Owner enquiries/inquiries inbox (from contact, inquiry, custom-quote, and enquiry forms on their listings) with the ability to respond and track status.
- **Functional Requirement 170:** [BO] The system shall allow a Business Owner to view and publicly respond to reviews on their listings and to report abusive or fraudulent reviews to the Super Admin.
- **Functional Requirement 171:** [BO] The system shall allow a Business Owner to create promotions, offers, and discounts on their own listings, subject to Super Admin approval where required.
- **Functional Requirement 172:** [BO] The system shall provide a Business Owner analytics/reports view (views, enquiry trends, review trends) with export (CSV/PDF).
- **Functional Requirement 173:** [BO] The system shall allow a Business Owner to manage their business profile (name, contact details, address, social links, logo/cover).
- **Functional Requirement 174:** [BO] The system shall notify Business Owners of new enquiries, reviews, and approval decisions via in-app and configurable email notifications.

---

## 20. Super Admin Capabilities

- **Functional Requirement 175:** [SA] The system shall allow Super Admins full CRUD control over all businesses and listings across every Business Owner.
- **Functional Requirement 176:** [SA] The system shall provide a moderation queue for Super Admins to approve, reject, suspend, or unpublish Business Owner accounts, listings, and edits, with reason capture and owner notification.
- **Functional Requirement 177:** [SA] The system shall allow Super Admins to manage all Users, Admins, and Business Owners, including creating, suspending, and deleting accounts and assigning roles and permissions.
- **Functional Requirement 178:** [SA] The system shall allow Super Admins to manage master taxonomies used across the platform: Categories, Locations, Amenities/Facilities, Property Types, Attribute Tags, and Price Bands.
- **Functional Requirement 179:** [SA] The system shall allow Super Admins to manage platform-wide marketing across all owners: Featured Listings, Best Deals, Promotions, and Banner Management.
- **Functional Requirement 180:** [SA] The system shall allow Super Admins to moderate user-generated content platform-wide: reviews, blog comments, article ratings, and reported/flagged content.
- **Functional Requirement 181:** ~~Removed~~ — not applicable: the platform does not process bookings, payments, or commissions (see ADR 0001).
- **Functional Requirement 182:** [SA] The system shall provide Super Admins global analytics and reporting across all businesses, categories, and time periods, with export.
- **Functional Requirement 183:** [SA] The system shall provide Super Admins platform Settings including global notification templates, in addition to the settings in FR 154.

---

## 21. Content Management (gap closure)

- **Functional Requirement 184:** [SA] The system shall provide a Blog/Article CMS allowing Super Admins to create, edit, schedule, publish, and unpublish blog posts, including title, body, images/captions, category, author, reading time, and related-article links.
- **Functional Requirement 185:** [SA] The system shall allow Super Admins to manage blog categories and authors, and to moderate blog comments, replies, likes, and article ratings.
- **Functional Requirement 186:** [SA] The system shall provide an FAQ management module allowing Super Admins to create, edit, order, and categorize FAQ questions and answers shown on the FAQ, Contact, and details pages.
- **Functional Requirement 187:** [SA] The system shall allow Super Admins to manage static/CMS page content — About (mission/vision, journey, stats), Contact (methods, address, hours, map), and configurable Home page sections (hero copy, trust indicators, value propositions, and headline statistics).
- **Functional Requirement 188:** [SA] The system shall allow Super Admins to manage newsletter subscribers (view, search, export) captured from footer and blog subscription forms, and to create and send newsletter campaigns.
- **Functional Requirement 189:** [SA] The system shall provide SEO/meta management (page title, meta description, URL slug, and Open Graph/Twitter Card fields) for listings, blog posts, and static pages.

---

## 22. Aggregator / OTA & Metasearch Integration

> **Deferred — out of current scope.** This entire section is postponed (see ADR 0002) and, per ADR 0001 (no in-platform bookings/payments), most of it no longer applies as written — it describes syncing booking/inventory/commission data with external booking engines, and there is no such data on this platform. FR 190-202 are kept below for future reference only; none are implemented in this pass.

- **Functional Requirement 190:** [SA] The system shall provide an extensible connector framework for integrating third-party aggregators, OTAs, and metasearch platforms — including **Booking.com** and **Trivago**, and designed to support additional channels (e.g., Expedia, Agoda, MakeMyTrip, TripAdvisor, Google Hotel Ads) without core redesign.
- **Functional Requirement 191:** [SA] The system shall allow Super Admins to configure each integration at the platform level, including API credentials/keys, OAuth authorization, endpoints, and global mapping and sync rules, stored securely.
- **Functional Requirement 192:** [Both] The system shall allow a listing/property to be connected to one or more external channels and shall map internal listings and room/rate types to the corresponding external property, room, and rate identifiers (channel mapping). Super Admins may map any listing; Business Owners may map only their own.
- **Functional Requirement 193:** [Both] The system shall synchronize Availability, Rates, and Inventory (ARI) with connected channels, supporting two-way updates so that changes made in the admin panel or on the channel are reflected on both sides.
- **Functional Requirement 194:** [Both] The system shall import reservations/bookings received from connected OTAs into a unified bookings inbox, attributing each booking to its source channel and preventing double-booking/overbooking across channels.
- **Functional Requirement 195:** [Both] The system shall import external reviews and ratings from connected aggregators and display them alongside native reviews, labeled with their source.
- **Functional Requirement 196:** [Both] The system shall support metasearch-style price comparison (e.g., Trivago), retrieving and displaying comparative prices and deep links to booking channels on the relevant details pages.
- **Functional Requirement 197:** [Both] The system shall support rate parity management and channel-specific pricing, including per-channel markups/discounts and commission/fee configuration.
- **Functional Requirement 198:** [Both] The system shall support both real-time synchronization (via webhooks/push where the channel provides them) and scheduled periodic sync, plus an on-demand "Sync Now" action.
- **Functional Requirement 199:** [Both] The system shall provide a per-channel sync status dashboard showing connection health, last sync time, success/failure counts, error logs, and a retry action.
- **Functional Requirement 200:** [SA] The system shall define conflict-resolution and source-of-truth rules for ARI and booking data, and shall handle channel API rate limits, retries, and failure alerting.
- **Functional Requirement 201:** [Both] The system shall allow channels to be enabled or disabled per listing; Super Admins may manage channels for any listing, while Business Owners may manage only channels for their own listings.
- **Functional Requirement 202:** [Both] The system shall track commission and channel fees per booking and per channel, and shall provide reconciliation reports (Super Admin: all channels; Business Owner: own listings).
