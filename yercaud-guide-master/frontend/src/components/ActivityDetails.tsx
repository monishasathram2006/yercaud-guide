import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ChevronRight,
  MapPin,
  Star,
  Heart,
  Check,
  X,
  Clock,
  Mountain,
  Ruler,
  Gauge,
} from "lucide-react";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { EnquiryForm } from "./EnquiryForm";
import { Card, ContactCard, LocationBlock, ReviewsBlock, SimilarListingsSection } from "./DetailBlocks";
import type { ActivityDetails as ActivityDetailsData } from "@/lib/api";
import { contactOf, type ListingDetail } from "@/lib/listing-detail";
import { badgeStyle, formatPrice } from "@/lib/listing-display";
import { useAuth } from "@/lib/auth";
import { useIsFavorite, useToggleFavorite } from "@/lib/favorites";

/**
 * An Activity's detail page, rendered from the API.
 *
 * Gone rather than faked: the mock's "What to Expect", "Highlights" and per-
 * activity FAQs. None has a column — the FAQ module is site-wide, not per
 * Listing. What's left is what activity_details actually stores.
 */
export function ActivityDetails({
  detail,
  activity,
}: {
  detail: ListingDetail;
  activity: ActivityDetailsData;
}) {
  const { listing, category, business, reviews, similarListings } = detail;
  const [active, setActive] = useState(0);
  const { isSignedIn } = useAuth();
  const isFavorite = useIsFavorite(listing.id);
  const toggleFavorite = useToggleFavorite();

  const gallery =
    listing.images.length > 0
      ? listing.images.map((i) => i.url)
      : listing.primaryImageUrl
        ? [listing.primaryImageUrl]
        : [];
  const accent = category?.color ?? "#1E7A46";
  const price = formatPrice(listing.priceFrom, listing.priceUnit);
  const included = activity.inclusions.filter((i) => i.isIncluded);
  const excluded = activity.inclusions.filter((i) => !i.isIncluded);

  const facts = [
    activity.duration && { icon: Clock, label: "Duration", value: activity.duration },
    activity.difficultyLevel && {
      icon: Gauge,
      label: "Difficulty",
      value: activity.difficultyLevel,
    },
    activity.totalDistance && { icon: Ruler, label: "Distance", value: activity.totalDistance },
    activity.maxHeight && { icon: Mountain, label: "Max height", value: activity.maxHeight },
  ].filter((f): f is { icon: typeof Clock; label: string; value: string } => Boolean(f));

  return (
    <div className="min-h-screen bg-white">
      <Header />
      <section className="bg-[#0f1a12] text-white">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="mb-3 flex items-center gap-1 text-sm text-white/70">
            <Link to="/" className="hover:text-white">
              Home
            </Link>
            <ChevronRight className="h-4 w-4" />
            <Link to="/activities" className="hover:text-white">
              Activities
            </Link>
            <ChevronRight className="h-4 w-4" />
            <span className="text-white">{listing.name}</span>
          </div>
          <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
            <div>
              {listing.badge && (
                <span
                  className="rounded px-2.5 py-1 text-xs font-semibold"
                  style={badgeStyle(listing.badge)}
                >
                  {listing.badge.label}
                </span>
              )}
              <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{listing.name}</h1>
              {listing.locationName && (
                <div className="mt-2 flex items-center gap-1 text-sm text-white/80">
                  <MapPin className="h-4 w-4" /> {listing.locationName}, Yercaud
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                {listing.averageRating !== null ? (
                  <>
                    <span className="inline-flex items-center gap-1 rounded bg-yellow-500/20 px-2 py-0.5 font-semibold text-yellow-300">
                      <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                      {listing.averageRating.toFixed(1)}
                    </span>
                    <span className="text-white/70">({listing.reviewCount})</span>
                  </>
                ) : (
                  <span className="text-white/60">No reviews yet</span>
                )}
              </div>
              {listing.description && (
                <p className="mt-4 max-w-md text-sm text-white/80">{listing.description}</p>
              )}
              <div className="mt-6 flex flex-wrap items-center gap-3">
                {/* FR58's per-person price — the field this phase added. */}
                {price && <div className="text-xl font-bold">{price}</div>}
                <a
                  href="#enquire"
                  className="rounded-lg px-5 py-2.5 text-sm font-medium"
                  style={{ backgroundColor: accent }}
                >
                  Send Enquiry
                </a>
                {isSignedIn ? (
                  <button
                    onClick={() => toggleFavorite.mutate({ listingId: listing.id, isFavorite })}
                    disabled={toggleFavorite.isPending}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-5 py-2.5 text-sm"
                  >
                    <Heart className={`h-4 w-4 ${isFavorite ? "fill-red-500 text-red-500" : ""}`} />{" "}
                    {isFavorite ? "Saved" : "Add to Favorites"}
                  </button>
                ) : (
                  <Link
                    to="/login"
                    className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-5 py-2.5 text-sm"
                  >
                    <Heart className="h-4 w-4" /> Add to Favorites
                  </Link>
                )}
              </div>
            </div>
            <div>
              {gallery.length > 0 && (
                <>
                  <div className="overflow-hidden rounded-xl">
                    <img
                      src={gallery[active]}
                      alt={listing.name}
                      className="h-72 w-full object-cover"
                    />
                  </div>
                  {gallery.length > 1 && (
                    <div className="mt-3 flex gap-2 overflow-x-auto">
                      {gallery.map((g, i) => (
                        <button
                          key={g}
                          onClick={() => setActive(i)}
                          className={`h-16 w-24 shrink-0 overflow-hidden rounded-lg ring-2 ${i === active ? "ring-[#1E7A46]" : "ring-transparent"}`}
                        >
                          <img src={g} alt="" className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-6 py-10 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {facts.length > 0 && (
            <div className="grid grid-cols-2 gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:grid-cols-4">
              {facts.map((f) => (
                <div key={f.label} className="flex items-center gap-2">
                  <f.icon className="h-5 w-5" style={{ color: accent }} />
                  <div>
                    <div className="text-xs text-gray-500">{f.label}</div>
                    <div className="text-sm font-semibold text-gray-900">{f.value}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {listing.description && (
            <Card title={`About ${listing.name} 🍃`}>
              <p className="whitespace-pre-line text-sm text-gray-600">{listing.description}</p>
            </Card>
          )}

          {activity.itinerarySteps.length > 0 && (
            <Card title="Itinerary 🍃">
              <ol className="space-y-4">
                {[...activity.itinerarySteps]
                  .sort((a, b) => a.stepOrder - b.stepOrder)
                  .map((s) => (
                    <li key={s.id} className="flex gap-3">
                      <span
                        className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
                        style={{ backgroundColor: accent }}
                      >
                        {s.stepOrder}
                      </span>
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{s.title}</div>
                        {s.duration && <div className="text-xs text-gray-500">{s.duration}</div>}
                        {s.description && (
                          <p className="mt-1 text-sm text-gray-600">{s.description}</p>
                        )}
                      </div>
                    </li>
                  ))}
              </ol>
            </Card>
          )}

          {activity.inclusions.length > 0 && (
            <Card title="What's Included 🍃">
              <div className="grid gap-4 sm:grid-cols-2">
                <ul className="space-y-2 text-sm text-gray-700">
                  {included.map((i) => (
                    <li key={i.id} className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#1E7A46]" />
                      {i.item}
                    </li>
                  ))}
                </ul>
                <ul className="space-y-2 text-sm text-gray-500">
                  {excluded.map((i) => (
                    <li key={i.id} className="flex gap-2">
                      <X className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                      {i.item}
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          )}

          <ReviewsBlock
            listingId={listing.id}
            reviews={reviews}
            rating={listing.averageRating}
            total={listing.reviewCount}
          />
          <LocationBlock address={business.address} locationName={listing.locationName} />
        </div>

        <aside className="space-y-5" id="enquire">
          <ContactCard contact={contactOf(business)} listingId={listing.id} />
          {/* FR58: availability and final pricing are confirmed directly with the
              business — the form says so. */}
          <EnquiryForm listingId={listing.id} listingName={listing.name} />
        </aside>
      </section>

      {similarListings.length > 0 && (
        <SimilarListingsSection category={category} listings={similarListings} categoryColor={accent} />
      )}
      <Footer />
    </div>
  );
}
