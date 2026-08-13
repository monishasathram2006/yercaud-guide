---
status: accepted
---

# No in-platform booking, payment, or financial transactions

The FR doc (FR36/40/46/58/72, FR89, FR167-168, FR181, FR202) describes real booking widgets, "My Bookings", availability/inventory management, refunds, commission, and payouts — the shape of an OTA-style booking engine. We decided the platform will **not** process reservations or payments at all: visitors convert via an **Enquiry** (name/email/phone/message to the business) or by using the business's published contact info, and arrange everything else directly with the business off-platform.

Business Owners can still maintain Room Inventory, Rates, and an Availability Calendar per Hotel listing, but these are purely informational display fields the owner edits manually — no visitor action creates a reservation or decrements them. Consequently there is no Booking, Payment, Commission, Payout, Refund, or Transaction entity in the schema; "Bookings" as a concept is replaced everywhere by Enquiry (My Bookings → My Enquiries, admin Bookings module → Enquiries, Business Owner KPIs drop Bookings/Revenue in favor of Enquiries).
