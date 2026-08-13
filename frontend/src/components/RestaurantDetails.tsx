import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, MapPin, Star, Heart, Utensils } from "lucide-react";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { EnquiryForm } from "./EnquiryForm";
import {
  Card,
  ContactCard,
  LocationBlock,
  OpeningHoursCard,
  ReviewsBlock,
  SimilarListingsSection,
} from "./DetailBlocks";
import type { RestaurantDetails as RestaurantDetailsData } from "@/lib/api";
import { contactOf, type ListingDetail } from "@/lib/listing-detail";
import { badgeStyle, formatPrice } from "@/lib/listing-display";
import { useAuth } from "@/lib/auth";
import { useIsFavorite, useToggleFavorite } from "@/lib/favorites";

const tabs = ["Overview", "Menu", "Amenities", "Reviews", "Location"] as const;

const sectionIds: Record<(typeof tabs)[number], string> = {
  Overview: "overview",
  Menu: "menu",
  Amenities: "amenities",
  Reviews: "reviews",
  Location: "location",
};

/**
 * A Restaurant's detail page, rendered from the API.
 *
 * Gone rather than faked: the mock's "Highlights" list and "What's Nearby" — no
 * column stores either, so the tabs lost "Highlights" with them. FR50's Popular
 * Dishes carousel is the real menu_items, which do carry a name, a price and an
 * image.
 */
export function RestaurantDetails({
  detail,
  restaurant,
}: {
  detail: ListingDetail;
  restaurant: RestaurantDetailsData;
}) {
  const { listing, category, business, reviews, amenities, similarListings } = detail;
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
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
            <Link to="/restaurants" className="hover:text-white">
              Restaurants
            </Link>
            <ChevronRight className="h-4 w-4" />
            <span className="text-white">{listing.name}</span>
          </div>
          <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
            <div>
              {/* The mock hardcoded "Best Rated" on every restaurant alike. */}
              {listing.badge && (
                <span
                  className="rounded px-2.5 py-1 text-xs font-semibold"
                  style={badgeStyle(listing.badge)}
                >
                  {listing.badge.label}
                </span>
              )}
              <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{listing.name}</h1>
              {/* The real street address is gated (issue #15) — a signed-out
                  visitor sees the coarse locality instead, same as this falls
                  back to when there's no address at all. */}
              {((isSignedIn && business.address) || listing.locationName) && (
                <div className="mt-2 flex items-center gap-1 text-sm text-white/80">
                  <MapPin className="h-4 w-4" />{" "}
                  {isSignedIn && business.address
                    ? business.address
                    : `${listing.locationName}, Yercaud`}
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
                {restaurant.cuisineType && (
                  <span className="rounded bg-white/10 px-2 py-0.5 text-xs">
                    {restaurant.cuisineType}
                  </span>
                )}
                {restaurant.bestFor && (
                  <span className="rounded bg-white/10 px-2 py-0.5 text-xs">
                    {restaurant.bestFor}
                  </span>
                )}
              </div>
              {listing.description && (
                <p className="mt-4 max-w-md text-sm text-white/80">{listing.description}</p>
              )}
              <div className="mt-6 flex flex-wrap items-center gap-3">
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

      <section className="border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-7xl gap-6 overflow-x-auto px-6">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                document
                  .getElementById(sectionIds[t])
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className={`whitespace-nowrap border-b-2 py-4 text-sm font-medium ${
                tab === t
                  ? "border-[#1E7A46] text-[#1E7A46]"
                  : "border-transparent text-gray-600 hover:text-[#1E7A46]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-6 py-10 lg:grid-cols-[1fr_360px]">
        <div className="scroll-mt-24 space-y-6" id="overview">
          {listing.description && (
            <Card title={`About ${listing.name} 🍃`}>
              <p className="whitespace-pre-line text-sm text-gray-600">{listing.description}</p>
            </Card>
          )}

          {/* FR50's Popular Dishes — real menu items, which carry a name, a price
              and an image. */}
          {restaurant.menuItems.length > 0 && (
            <div className="scroll-mt-24" id="menu">
              <Card title="Popular Dishes 🍃">
                <div className="grid gap-4 sm:grid-cols-3">
                  {[...restaurant.menuItems]
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((m) => (
                      <div
                        key={m.id}
                        className="overflow-hidden rounded-xl border border-gray-100"
                      >
                        {m.imageUrl ? (
                          <img
                            src={m.imageUrl}
                            alt={m.name}
                            className="h-32 w-full object-cover"
                          />
                        ) : (
                          <div className="grid h-32 w-full place-items-center bg-gray-50">
                            <Utensils className="h-6 w-6 text-gray-300" />
                          </div>
                        )}
                        <div className="p-3">
                          <div className="text-sm font-semibold text-gray-900">{m.name}</div>
                          {m.price !== null && (
                            <div className="mt-1 text-sm" style={{ color: accent }}>
                              {formatPrice(m.price, "from")}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </Card>
            </div>
          )}

          {amenities.length > 0 && (
            <div className="scroll-mt-24" id="amenities">
              <Card title="Amenities 🍃">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {amenities.map((a) => (
                    <div key={a} className="flex items-center gap-2 text-sm text-gray-700">
                      <Utensils className="h-4 w-4" style={{ color: accent }} /> {a}
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          <div className="scroll-mt-24" id="reviews">
            <ReviewsBlock
              listingId={listing.id}
              reviews={reviews}
              rating={listing.averageRating}
              total={listing.reviewCount}
            />
          </div>
          <div className="scroll-mt-24" id="location">
            <LocationBlock address={business.address} locationName={listing.locationName} />
          </div>
        </div>

        <aside className="space-y-5" id="enquire">
          <ContactCard contact={contactOf(business)} listingId={listing.id} />
          <EnquiryForm listingId={listing.id} listingName={listing.name} />
          <OpeningHoursCard hours={restaurant.openingHours} />
        </aside>
      </section>

      {similarListings.length > 0 && (
        <SimilarListingsSection category={category} listings={similarListings} categoryColor={accent} />
      )}
      <Footer />
    </div>
  );
}
