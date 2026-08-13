import { Link } from "@tanstack/react-router";
import {
  Heart,
  MapPin,
  Star,
  Phone,
  Globe,
  Wifi,
  Car,
  Utensils,
  Bell,
  Waves,
  Shield,
  Users,
  Clock,
  ShieldCheck,
  TreePine,
  Compass,
  Package,
} from "lucide-react";
import type { ListingSummary, PriceBand } from "@/lib/api";
import {
  badgeStyle,
  categorySolid,
  categoryTint,
  detailPath,
  formatPrice,
  formatRating,
  priceTier,
} from "@/lib/listing-display";
import { useAuth } from "@/lib/auth";
import { useIsFavorite, useToggleFavorite } from "@/lib/favorites";
import { CardGateOverlay } from "./ContactGate";

/**
 * A directory card, rendered entirely from one ListingSummary.
 *
 * It used to read a hand-written `Business` with a formatted priceLabel, a typed
 * priceTier, a category-to-colour map and a badge-to-colour switch. All of that
 * is now data: the API sends the amount and the unit, the category and badge
 * carry their own colours, and the tier is derived from the price bands the
 * directory already fetches for its filter.
 */

/**
 * Icons stay client-side. A tag's *name* is data (a Super Admin can add one),
 * but there is no icon component to send over the wire — an unknown tag falls
 * back rather than disappearing.
 */
const tagIcons: Record<string, typeof Wifi> = {
  "Free Wi-Fi": Wifi,
  Parking: Car,
  Restaurant: Utensils,
  "Room Service": Bell,
  Pool: Waves,
  "Swimming Pool": Waves,
  Spa: Waves,
  "Outdoor Seating": TreePine,
  "Safety Gear": Shield,
  Guide: Compass,
  "All Ages": Users,
  "AC Vehicles": Car,
  "24/7 Service": Clock,
  "Verified Drivers": ShieldCheck,
  Sightseeing: Compass,
  "Custom Packages": Package,
};

function TagIcon({ tag }: { tag: string }) {
  const Icon = tagIcons[tag] ?? Shield;
  return <Icon className="h-3.5 w-3.5" />;
}

/**
 * The heart is the one part of a card that isn't server-rendered: it's personal
 * to the viewer, so it fills in after hydration. A signed-out visitor is sent to
 * sign in rather than shown a heart that silently does nothing.
 */
function FavoriteButton({ listingId, className }: { listingId: string; className: string }) {
  const { isSignedIn } = useAuth();
  const isFavorite = useIsFavorite(listingId);
  const toggle = useToggleFavorite();

  if (!isSignedIn) {
    return (
      <Link
        to="/login"
        search={{ redirect: undefined }}
        className={className}
        aria-label="Sign in to save this"
      >
        <Heart className="h-4 w-4" />
      </Link>
    );
  }

  return (
    <button
      onClick={() => toggle.mutate({ listingId, isFavorite })}
      disabled={toggle.isPending}
      className={className}
      aria-label={isFavorite ? "Remove from favourites" : "Save to favourites"}
      aria-pressed={isFavorite}
    >
      <Heart className={`h-4 w-4 ${isFavorite ? "fill-red-500 text-red-500" : ""}`} />
    </button>
  );
}

interface CardProps {
  /** `sponsored` is optional and only ever set by a Featured Sections item (issue #23) — every
   * other caller of this widely-reused card (category pages, favorites, search, ...) omits it. */
  listing: ListingSummary & { sponsored?: boolean };
  /** Fetched once by the page for its price filter; the tier mapping rides along free. */
  priceBands?: PriceBand[];
  categoryColor?: string | null;
}

export function BusinessCardGrid({ listing, categoryColor }: CardProps) {
  const price = formatPrice(listing.priceFrom, listing.priceUnit);
  const rating = formatRating(listing.averageRating);

  return (
    <div className="group overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition hover:shadow-md">
      <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
        {listing.primaryImageUrl ? (
          <img
            src={listing.primaryImageUrl}
            alt={listing.name}
            loading="lazy"
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-xs text-gray-400">
            No photo yet
          </div>
        )}
        {/* Stacked so a Sponsored placement and a manually-assigned Badge never
            visually collide when a Listing carries both (issue #23) — two
            independent signals (ADR-0012), Sponsored shown first. */}
        <div className="absolute left-3 top-3 flex flex-col items-start gap-1">
          {listing.sponsored && (
            <span className="rounded-md bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
              Sponsored
            </span>
          )}
          {listing.badge && (
            <span
              className="rounded-md px-2.5 py-1 text-xs font-semibold"
              style={badgeStyle(listing.badge)}
            >
              {listing.badge.label}
            </span>
          )}
        </div>
        <FavoriteButton
          listingId={listing.id}
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-white/95 text-gray-600 shadow hover:text-red-500"
        />
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-gray-900">{listing.name}</h3>
        {listing.locationName && (
          <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
            <MapPin className="h-3.5 w-3.5" style={{ color: categoryColor ?? "#1E7A46" }} />
            {listing.locationName}, Yercaud
          </div>
        )}
        <div className="mt-2 flex items-center gap-2 text-xs">
          {rating ? (
            <>
              <span className="inline-flex items-center gap-1 rounded bg-yellow-50 px-1.5 py-0.5 font-semibold text-yellow-700">
                <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                {rating}
              </span>
              <span className="text-gray-500">({listing.reviewCount})</span>
            </>
          ) : (
            <span className="text-gray-400">No reviews yet</span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-gray-400">
          {listing.tags.slice(0, 4).map((t) => (
            <TagIcon key={t} tag={t} />
          ))}
        </div>
        {/* A Listing need not have a price; the row collapses rather than showing ₹0. */}
        {price && <div className="mt-3 font-bold text-gray-900">{price}</div>}
        <Link
          to={detailPath(listing)}
          className="mt-3 block w-full rounded-md py-2 text-center text-sm font-medium"
          style={categorySolid(categoryColor)}
        >
          View Details
        </Link>
      </div>
    </div>
  );
}

export function BusinessCardHorizontal({ listing, priceBands, categoryColor }: CardProps) {
  const price = formatPrice(listing.priceFrom, listing.priceUnit);
  const rating = formatRating(listing.averageRating);
  const tier = priceTier(listing.priceFrom, priceBands ?? []);
  const { isSignedIn } = useAuth();

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition hover:shadow-md sm:flex-row">
      <div className="relative h-48 shrink-0 overflow-hidden bg-gray-100 sm:h-auto sm:w-56">
        {listing.primaryImageUrl ? (
          <img
            src={listing.primaryImageUrl}
            alt={listing.name}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-xs text-gray-400">
            No photo yet
          </div>
        )}
        {listing.badge && (
          <span
            className="absolute left-3 top-3 rounded-md px-2 py-0.5 text-xs font-semibold"
            style={badgeStyle(listing.badge)}
          >
            {listing.badge.label}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5 sm:flex-row sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-gray-900">{listing.name}</h3>
                <span
                  className="rounded px-2 py-0.5 text-xs font-medium"
                  style={categoryTint(categoryColor)}
                >
                  {listing.categoryName}
                </span>
              </div>
              {listing.locationName && (
                <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                  <MapPin className="h-3.5 w-3.5" style={{ color: categoryColor ?? "#1E7A46" }} />
                  {listing.locationName}, Yercaud
                </div>
              )}
            </div>
            <FavoriteButton
              listingId={listing.id}
              className="shrink-0 text-gray-400 hover:text-red-500 sm:hidden"
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
            {rating && (
              <span className="inline-flex items-center gap-1 font-semibold text-yellow-700">
                <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
                {rating} ({listing.reviewCount})
              </span>
            )}
            {tier && (
              <>
                <span className="text-gray-300">•</span>
                <span style={{ color: categoryColor ?? "#1E7A46" }}>{"₹".repeat(tier)}</span>
              </>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-600">
            {listing.tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1">
                <TagIcon tag={t} />
                {t}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col justify-between gap-3 sm:items-end sm:text-right">
          <FavoriteButton
            listingId={listing.id}
            className="hidden self-end text-gray-400 hover:text-red-500 sm:block"
          />
          <div className="relative">
            {/* The owning Business's, not the Listing's — contacting a Business
                directly is the whole point of the directory (FR24). Gated for
                a signed-out visitor (issue #15) — blurred behind a compact
                sign-in link rather than the detail page's full panel, since a
                whole grid of cards repeating that would be noisy. */}
            <div
              className={
                isSignedIn
                  ? "space-y-1 text-xs text-gray-600"
                  : "space-y-1 text-xs text-gray-600 blur-sm select-none"
              }
            >
              {listing.phone && (
                <div className="flex items-center gap-1.5 sm:justify-end">
                  <Phone className="h-3.5 w-3.5" /> {listing.phone}
                </div>
              )}
              {listing.website && (
                <div className="flex items-center gap-1.5 sm:justify-end">
                  <Globe className="h-3.5 w-3.5" /> {listing.website}
                </div>
              )}
            </div>
            {!isSignedIn && (listing.phone || listing.website) && <CardGateOverlay />}
          </div>
          <div className="flex flex-col gap-1 sm:items-end">
            {price && <div className="font-bold text-gray-900">{price}</div>}
            <Link
              to={detailPath(listing)}
              className="rounded-md px-6 py-2 text-center text-sm font-medium"
              style={categorySolid(categoryColor)}
            >
              View Details
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
