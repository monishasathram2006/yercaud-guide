import { notFound } from "@tanstack/react-router";
import { api, isNotFound, type Business, type Category, type Listing, type ListingSummary, type Review } from "./api";

/**
 * Everything a Listing's detail page renders, fetched server-side in one place.
 *
 * The four categories with a bespoke page — Hotel, Restaurant, Activity, Tour &
 * Travel (ADR 0003) — all need the same base: the Listing, its category, the
 * owning Business's full contact details, its Reviews, and its amenity names.
 * Each page then fetches its own detail table on top.
 *
 * Amenity names are resolved client-side against /amenities rather than embedded
 * in the Listing: unlike a card's tags, amenities appear on exactly one page, and
 * the lookup is a handful of rows that React Query caches for the session.
 */
export interface ListingDetail {
  listing: Listing;
  category: Category | undefined;
  business: Business;
  reviews: Review[];
  amenities: string[];
  similarListings: ListingSummary[];
}

/**
 * Loads a Listing by slug and asserts it belongs to the category the URL claims.
 *
 * A Listing reached under the wrong category 404s rather than redirecting: two
 * URLs for one Listing is exactly the link rot that freezing slugs avoids.
 */
export async function loadListingDetail(slug: string, expectedCategorySlug: string): Promise<ListingDetail> {
  try {
    const listing = await api.listings.bySlug(slug);
    if (listing.categorySlug !== expectedCategorySlug) throw notFound();

    const [categories, business, reviews, allAmenities, similarListings] = await Promise.all([
      api.taxonomies.categories(),
      api.businesses.byId(listing.businessId),
      api.listings.reviews(listing.id),
      api.taxonomies.amenities(),
      api.listings.similar(listing.id),
    ]);

    const amenityNames = new Map(allAmenities.map((a) => [a.id, a.name]));
    return {
      listing,
      category: categories.find((c) => c.slug === expectedCategorySlug),
      business,
      reviews,
      amenities: listing.amenityIds.map((id) => amenityNames.get(id)).filter((n): n is string => Boolean(n)),
      similarListings,
    };
  } catch (error) {
    if (isNotFound(error)) throw notFound();
    throw error;
  }
}

/** Shared `head` for a Listing page — real SEO fields, falling back to the Listing's own copy. */
export function listingMeta(listing: Listing | undefined) {
  const description = listing?.seoDescription ?? listing?.description?.slice(0, 160) ?? "";
  const image = listing?.ogImage ?? listing?.primaryImageUrl;
  return [
    { title: listing?.seoTitle ?? `${listing?.name ?? "Listing"} — Yercaud Business Directory` },
    { name: "description", content: description },
    { property: "og:title", content: listing?.name ?? "" },
    { property: "og:description", content: description },
    ...(image ? [{ property: "og:image", content: image }] : []),
    // FR189: set per Listing so a share preview isn't left to a platform default.
    ...(listing?.twitterCard ? [{ name: "twitter:card", content: listing.twitterCard }] : []),
  ];
}

/**
 * The contact block every detail page shows, composed from the owning Business.
 *
 * socialLinks is a free-form map on the Business, so the page renders whatever
 * the owner actually filled in — not a fixed row of four icons pointing at "#",
 * which is what the mock did.
 */
export interface ContactDetails {
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  socialLinks: Record<string, string>;
}

export function contactOf(business: Business): ContactDetails {
  return {
    phone: business.contactPhone,
    email: business.contactEmail,
    website: business.website,
    address: business.address,
    socialLinks: business.socialLinks ?? {},
  };
}
