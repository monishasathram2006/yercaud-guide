import { createFileRoute } from "@tanstack/react-router";
import { TourDetails } from "@/components/TourDetails";
import { api } from "@/lib/api";
import { listingMeta, loadListingDetail } from "@/lib/listing-detail";

/** Server-rendered at its slug — an individual Listing is the page that most needs to be found. */
export const Route = createFileRoute("/tours/$slug")({
  loader: async ({ params }) => {
    const detail = await loadListingDetail(params.slug, "tour");
    const [tour, allLanguages] = await Promise.all([
      api.listings.tourDetails(detail.listing.id),
      api.taxonomies.languages(),
    ]);
    // Resolved here, not embedded: languages appear on this one page, and the
    // lookup is a handful of rows.
    const names = new Map(allLanguages.map((l) => [l.id, l.name]));
    const languages = tour.languageIds.map((id) => names.get(id)).filter((n): n is string => Boolean(n));
    return { detail, tour, languages };
  },
  head: ({ loaderData }) => ({ meta: listingMeta(loaderData?.detail.listing) }),
  component: TourRoute,
});

function TourRoute() {
  const { detail, tour, languages } = Route.useLoaderData();
  return <TourDetails detail={detail} tour={tour} languages={languages} />;
}
