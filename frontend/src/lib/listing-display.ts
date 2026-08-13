import type { CSSProperties } from "react";
import type { ListingSummary, PriceBand, PriceUnit } from "./api";

/**
 * Turning a ListingSummary into what a card shows.
 *
 * Everything here used to be hardcoded in data.ts: a categoryColors map, a
 * category-to-route map, a formatted "₹3,500/night" string, and a priceTier
 * someone typed in by hand. The API now supplies the parts; this composes them.
 */

/**
 * The four categories with a bespoke detail page — ADR 0003's rich types, which
 * are exactly the ones with has_detail_table = true.
 *
 * Everything else routes to the generic Listing page, which is what makes a
 * Super-Admin-created category actually appear on the public site (FR178)
 * rather than being a feature that does nothing.
 */
const BESPOKE_ROUTES: Record<string, string> = {
  hotel: "/hotels",
  restaurant: "/restaurants",
  activity: "/activities",
  tour: "/tours",
};

/** Listings are addressed by slug — readable, keyword-bearing, and frozen at first publish. */
export function detailPath(listing: Pick<ListingSummary, "categorySlug" | "slug">): string {
  const bespoke = BESPOKE_ROUTES[listing.categorySlug];
  if (bespoke) return `${bespoke}/${listing.slug}`;
  return `/directory/${listing.categorySlug}/${listing.slug}`;
}

const UNIT_SUFFIX: Record<PriceUnit, string> = {
  per_night: "/night",
  for_two: " for two",
  per_person: "/person",
  from: "",
};

/**
 * The API returns an amount and a unit, not a formatted label, because a label
 * can't be filtered on. This is where they become "₹3,500/night".
 *
 * Null is a real answer — a Listing need not have a price — and renders as
 * nothing rather than "₹0".
 */
export function formatPrice(priceFrom: number | null, priceUnit: PriceUnit | null): string | null {
  if (priceFrom === null) return null;
  const amount = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(priceFrom);
  const suffix = priceUnit ? UNIT_SUFFIX[priceUnit] : "";
  const prefix = priceUnit === "from" ? "From " : "";
  return `${prefix}₹${amount}${suffix}`;
}

/**
 * The 1-4 "₹₹₹" indicator, derived from which price band the amount falls in.
 *
 * Not an API field: a tier is just the ordinal position of the matching band, and
 * storing it would be a second encoding of what the price already implies. The
 * directory fetches /price-bands anyway to render the price filter, so this
 * mapping is free.
 */
export function priceTier(priceFrom: number | null, bands: PriceBand[]): number | null {
  if (priceFrom === null || bands.length === 0) return null;
  const ordered = [...bands].sort((a, b) => a.minAmount - b.minAmount);
  const index = ordered.findIndex(
    (b) => priceFrom >= b.minAmount && (b.maxAmount === null || b.maxAmount === undefined || priceFrom <= b.maxAmount),
  );
  return index === -1 ? null : index + 1;
}

export function formatRating(rating: number | null): string | null {
  return rating === null ? null : rating.toFixed(1);
}

/**
 * Category colours come from categories.color — the column exists for exactly
 * this, so the frontend no longer keeps its own category-to-colour map that a
 * Super-Admin-created category would fall straight through.
 *
 * Inline styles rather than Tailwind classes because the value is data: Tailwind
 * can't compile a class from a hex it has never seen.
 */
export function categoryTint(color: string | null | undefined, alpha = "1A"): CSSProperties {
  if (!color) return {};
  return { backgroundColor: `${color}${alpha}`, color };
}

export function categorySolid(color: string | null | undefined): CSSProperties {
  if (!color) return {};
  return { backgroundColor: color, color: "#fff" };
}

/** A badge carries its own colour, so there is no badge-to-colour switch to fall through. */
export function badgeStyle(badge: ListingSummary["badge"]): CSSProperties {
  return badge?.color ? { backgroundColor: badge.color, color: "#fff" } : {};
}
