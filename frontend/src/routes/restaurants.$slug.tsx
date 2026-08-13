import { createFileRoute } from "@tanstack/react-router";
import { RestaurantDetails } from "@/components/RestaurantDetails";
import { api } from "@/lib/api";
import { listingMeta, loadListingDetail } from "@/lib/listing-detail";

/** Server-rendered at its slug — an individual Listing is the page that most needs to be found. */
export const Route = createFileRoute("/restaurants/$slug")({
  loader: async ({ params }) => {
    const detail = await loadListingDetail(params.slug, "restaurant");
    const restaurant = await api.listings.restaurantDetails(detail.listing.id);
    return { detail, restaurant };
  },
  head: ({ loaderData }) => ({ meta: listingMeta(loaderData?.detail.listing) }),
  component: DetailRoute,
});

function DetailRoute() {
  const { detail, restaurant } = Route.useLoaderData();
  return <RestaurantDetails detail={detail} restaurant={restaurant} />;
}
