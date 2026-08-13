import { createFileRoute } from "@tanstack/react-router";
import { CategoryPage } from "@/components/CategoryPage";
import { api } from "@/lib/api";
import { categoryFilterHandlers, validateCategorySearch } from "@/lib/category-filters";

// Merges two category slugs onto one page/nav entry — "tour" (guided
// sightseeing) and "travel" (cabs/transport, ADR 0003's detail-less
// category). They used to have separate pages (/tours, /travel), which read
// as duplicate nav entries since both are travel-related; this is the same
// "tour" + "travel" grouping the featured-shelf config already uses for its
// "toursAndTravels" section (backend/src/modules/featured/config.ts).

export const Route = createFileRoute("/tours/")({
  validateSearch: validateCategorySearch,
  loaderDeps: ({ search }) => search,
  /**
   * Fetched server-side so the rendered HTML contains the Listings — this page
   * is a search result, and a crawler that sees an empty grid indexes an empty
   * grid. No credentials: everything here is public, which is exactly why SSR
   * costs nothing and needs no cookie forwarding.
   */
  loader: async ({ deps }) => {
    const [tourListings, travelListings, categories, priceBands] = await Promise.all([
      api.listings.search({ category: "tour", pageSize: 60, ...deps }),
      api.listings.search({ category: "travel", pageSize: 60, ...deps }),
      api.taxonomies.categories(),
      api.taxonomies.priceBands(),
    ]);
    return {
      listings: [...tourListings.items, ...travelListings.items],
      total: tourListings.total + travelListings.total,
      category: categories.find((c) => c.slug === "tour"),
      priceBands,
    };
  },
  head: () => ({
    meta: [
      { title: "Tours & Travels in Yercaud — Yercaud Business Directory" },
      {
        name: "description",
        content: "Guided tours, travel packages, cabs and local transport around Yercaud.",
      },
      { property: "og:title", content: "Tours & Travels in Yercaud" },
      {
        property: "og:description",
        content: "Guided tours, travel packages, cabs and local transport around Yercaud.",
      },
    ],
  }),
  component: CategoryRoute,
});

function CategoryRoute() {
  const { listings, category, priceBands } = Route.useLoaderData();
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <CategoryPage
      listings={listings}
      category={category}
      priceBands={priceBands}
      title="Tours & Travels in Yercaud"
      subtitle="Guided tours, sightseeing packages, AC cabs and verified drivers to explore Yercaud with ease."
      ctaTitle="Explore Yercaud with Ease"
      ctaText="Discover guided tours, sightseeing packages, custom itineraries and reliable local transport."
      filters={filters}
      {...categoryFilterHandlers(navigate)}
    />
  );
}
