import { createFileRoute } from "@tanstack/react-router";
import { HotelDetails } from "@/components/HotelDetails";
import { api } from "@/lib/api";
import { listingMeta, loadListingDetail } from "@/lib/listing-detail";

/**
 * A Hotel's page, at its slug rather than a UUID — readable, keyword-bearing,
 * and frozen at first publish so the link never rots.
 *
 * Server-rendered: an individual Listing is the page that most needs to be found,
 * and it's anonymous, so SSR costs nothing and forwards no cookies.
 */
export const Route = createFileRoute("/hotels/$slug")({
  loader: async ({ params }) => {
    const detail = await loadListingDetail(params.slug, "hotel");
    const hotel = await api.listings.hotelDetails(detail.listing.id);
    return { detail, hotel };
  },
  head: ({ loaderData }) => ({ meta: listingMeta(loaderData?.detail.listing) }),
  component: HotelRoute,
});

function HotelRoute() {
  const { detail, hotel } = Route.useLoaderData();
  return <HotelDetails detail={detail} hotel={hotel} />;
}
