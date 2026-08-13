import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { MapPin, Phone, Globe, Star, ChevronRight } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { EnquiryForm } from "@/components/EnquiryForm";
import { ContactGateOverlay, useContactReveal, useListingView } from "@/components/ContactGate";
import { useAuth } from "@/lib/auth";
import { api, isNotFound } from "@/lib/api";
import {
  badgeStyle,
  categorySolid,
  categoryTint,
  formatPrice,
  formatRating,
} from "@/lib/listing-display";

/**
 * The generic Listing page.
 *
 * ADR 0003 gives four categories a bespoke detail table — Hotel, Restaurant,
 * Activity, Tour & Travel — and explicitly leaves four without: Travel,
 * Shopping, Health & Wellness and Other Services "use the base listings table
 * alone". Those four route here.
 *
 * This is what makes FR178's category management real: a Super Admin can create
 * a category and its Listings get a working page, rather than the category
 * appearing on the directory with a count and no destination. Three categories
 * were already in exactly that state.
 *
 * It renders the base Listing only — name, images, description, contact,
 * reviews — because that is all a detail-less category has. The mock hid this by
 * pointing /travel/$id at TourDetails and inventing the itinerary it displayed.
 */
export const Route = createFileRoute("/directory/$categorySlug/$slug")({
  loader: async ({ params }) => {
    try {
      // Sequenced, not Promise.all'd with the reviews: the review fetch needs the
      // Listing's id, which only the first call knows.
      const listing = await api.listings.bySlug(params.slug);
      const [categories, reviews] = await Promise.all([
        api.taxonomies.categories(),
        api.listings.reviews(listing.id),
      ]);
      const category = categories.find((c) => c.slug === params.categorySlug);
      // The URL asserts a category; a Listing reached under the wrong one 404s
      // rather than redirecting — two URLs for one Listing is the link rot that
      // freezing slugs exists to avoid.
      if (!category || listing.categorySlug !== params.categorySlug) throw notFound();
      return { listing, category, reviews };
    } catch (error) {
      if (isNotFound(error)) throw notFound();
      throw error;
    }
  },
  head: ({ loaderData }) => {
    const l = loaderData?.listing;
    return {
      meta: [
        { title: l?.seoTitle ?? `${l?.name ?? "Listing"} — Yercaud Business Directory` },
        { name: "description", content: l?.seoDescription ?? l?.description?.slice(0, 160) ?? "" },
        { property: "og:title", content: l?.name ?? "" },
        {
          property: "og:description",
          content: l?.seoDescription ?? l?.description?.slice(0, 160) ?? "",
        },
        ...((l?.ogImage ?? l?.primaryImageUrl)
          ? [{ property: "og:image", content: (l?.ogImage ?? l?.primaryImageUrl)! }]
          : []),
        ...(l?.twitterCard ? [{ name: "twitter:card", content: l.twitterCard }] : []),
      ],
    };
  },
  component: GenericListingPage,
});

function GenericListingPage() {
  const { listing, category, reviews } = Route.useLoaderData();
  const price = formatPrice(listing.priceFrom, listing.priceUnit);
  const rating = formatRating(listing.averageRating);
  const { isSignedIn } = useAuth();
  useContactReveal(listing.id);
  // Anonymous-friendly page View tracking (issue #16) — this page doesn't
  // render ContactCard (it has no bespoke detail table), so it fires directly.
  useListingView(listing.id);

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <section className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-4 flex items-center gap-1 text-sm text-gray-500">
          <Link to="/" className="hover:text-[#1E7A46]">
            Home
          </Link>
          <ChevronRight className="h-4 w-4" />
          <Link to="/directory" className="hover:text-[#1E7A46]">
            Directory
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span style={{ color: category.color ?? undefined }}>{listing.name}</span>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          <div>
            {listing.primaryImageUrl && (
              <img
                src={listing.primaryImageUrl}
                alt={listing.name}
                className="aspect-[16/9] w-full rounded-xl object-cover"
              />
            )}

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{listing.name}</h1>
              <span
                className="rounded px-2 py-0.5 text-xs font-medium"
                style={categoryTint(category.color)}
              >
                {listing.categoryName}
              </span>
              {listing.badge && (
                <span
                  className="rounded px-2 py-0.5 text-xs font-semibold"
                  style={badgeStyle(listing.badge)}
                >
                  {listing.badge.label}
                </span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-600">
              {listing.locationName && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-4 w-4" style={{ color: category.color ?? "#1E7A46" }} />
                  {listing.locationName}, Yercaud
                </span>
              )}
              {rating ? (
                <span className="inline-flex items-center gap-1 font-semibold text-yellow-700">
                  <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                  {rating} ({listing.reviewCount})
                </span>
              ) : (
                <span className="text-gray-400">No reviews yet</span>
              )}
            </div>

            {listing.description && (
              <p className="mt-5 whitespace-pre-line text-sm text-gray-700">
                {listing.description}
              </p>
            )}

            {listing.tags.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {listing.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}

            {listing.images.length > 1 && (
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {listing.images.slice(1).map((img) => (
                  <img
                    key={img.id}
                    src={img.url}
                    alt={img.caption ?? listing.name}
                    className="aspect-[4/3] w-full rounded-lg object-cover"
                  />
                ))}
              </div>
            )}

            <Reviews reviews={reviews} />
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border border-gray-100 p-5 shadow-sm">
              {price && <div className="text-2xl font-bold text-gray-900">{price}</div>}
              {/* Contact info is gated (issue #15) — blurred behind a
                  sign-in prompt for a signed-out visitor. */}
              <div className="relative">
                <div
                  className={
                    isSignedIn
                      ? "mt-4 space-y-2 text-sm text-gray-700"
                      : "mt-4 space-y-2 text-sm text-gray-700 blur-sm select-none"
                  }
                >
                  {listing.phone && (
                    <a
                      href={isSignedIn ? `tel:${listing.phone}` : undefined}
                      className="flex items-center gap-2 hover:text-[#1E7A46]"
                    >
                      <Phone className="h-4 w-4" /> {listing.phone}
                    </a>
                  )}
                  {listing.website && (
                    <a
                      href={
                        isSignedIn
                          ? `https://${listing.website.replace(/^https?:\/\//, "")}`
                          : undefined
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 hover:text-[#1E7A46]"
                    >
                      <Globe className="h-4 w-4" /> {listing.website}
                    </a>
                  )}
                </div>
                {!isSignedIn && (listing.phone || listing.website) && <ContactGateOverlay />}
              </div>
              <div
                className="mt-4 rounded-md px-4 py-2 text-center text-sm font-medium"
                style={categorySolid(category.color)}
              >
                Enquire below
              </div>
            </div>

            {/* The platform's only conversion — a visitor enquires, then arranges
                directly with the Business off-platform (ADR 0001). */}
            <EnquiryForm listingId={listing.id} listingName={listing.name} />
          </aside>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function Reviews({ reviews }: { reviews: Awaited<ReturnType<typeof api.listings.reviews>> }) {
  if (reviews.length === 0) return null;
  return (
    <div className="mt-10">
      <h2 className="text-lg font-semibold text-gray-900">Reviews</h2>
      <div className="mt-4 space-y-4">
        {reviews.map((r) => (
          <div key={r.id} className="rounded-lg border border-gray-100 p-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1 font-semibold text-yellow-700">
                <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
                {r.rating}
              </span>
              {r.authorName && (
                <span className="text-gray-600">
                  {r.authorName} <span className="text-gray-400">· @{r.authorUsername}</span>
                </span>
              )}
            </div>
            {r.text && <p className="mt-2 text-sm text-gray-700">{r.text}</p>}
            {r.ownerReply && (
              <div className="mt-3 rounded-md bg-[#F7F9F8] p-3 text-sm text-gray-700">
                <div className="text-xs font-semibold text-gray-500">Response from the owner</div>
                {r.ownerReply}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
