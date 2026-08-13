---
status: accepted
---

# Defer OTA / aggregator channel integration schema

Part B of the FR doc (FR190-202) specifies a full channel integration framework: connector config, channel mapping, two-way ARI sync, imported OTA reservations, sync status dashboards, and per-channel commission reconciliation. We decided to design the database for the core directory and dual-role admin (Super Admin / Business Owner) now, and **not** build out the OTA/channel schema in this pass — those requirements depend on unknowns (which OTAs, what their APIs actually return) that are better locked down closer to when that integration is actually built.

Given ADR 0001 (no in-platform bookings), most of Part B — which is fundamentally about syncing booking/inventory data with external booking engines — no longer applies to the current scope at all.
