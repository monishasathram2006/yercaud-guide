import { createFileRoute } from "@tanstack/react-router";
import { ActivityDetails } from "@/components/ActivityDetails";
import { api } from "@/lib/api";
import { listingMeta, loadListingDetail } from "@/lib/listing-detail";

/** Server-rendered at its slug — an individual Listing is the page that most needs to be found. */
export const Route = createFileRoute("/activities/$slug")({
  loader: async ({ params }) => {
    const detail = await loadListingDetail(params.slug, "activity");
    const activity = await api.listings.activityDetails(detail.listing.id);
    return { detail, activity };
  },
  head: ({ loaderData }) => ({ meta: listingMeta(loaderData?.detail.listing) }),
  component: DetailRoute,
});

function DetailRoute() {
  const { detail, activity } = Route.useLoaderData();
  return <ActivityDetails detail={detail} activity={activity} />;
}
