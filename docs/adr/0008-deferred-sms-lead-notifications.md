---
status: accepted
---

# SMS lead notification is a delivery channel on Enquiry, deferred like OTA integration

Modeled on IndiaMART's lead-notification pattern: when a visitor submits an **Enquiry** on a Listing (name/phone/message already captured — see ADR 0001/CONTEXT.md), the Business Owner should also get an SMS, not just an in-app/email notification. We deliberately scoped this to Enquiry submission, not raw search queries — a plain search has no reliable name/contact attached unless the searcher is logged in, and SMS'ing on every keystroke would be noisy and mostly anonymous.

The provider will be **Fast2SMS**, but that integration is being wired up later. Following the same pattern as ADR 0002 (defer OTA integration, reserve a light extension point), the `enquiries` table gets minimal columns now (`sms_status`, `sms_sent_at`) so the schema doesn't need a migration when Fast2SMS is actually connected — no separate SMS/notification-log tables are built out yet.
