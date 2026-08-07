import { createFileRoute } from "@tanstack/react-router";
import { CategoryPage } from "@/components/CategoryPage";
import { api } from "@/lib/api";
import { categoryFilterHandlers, validateCategorySearch } from "@/lib/category-filters";

const CATEGORY_SLUG = "hotel";

export const Route = createFileRoute("/hotels/")({
  validateSearch: validateCategorySearch,
  loaderDeps: ({ search }) => search,
  /**
   * Fetched server-side so the rendered HTML contains the Listings — this page
   * is a search result, and a crawler that sees an empty grid indexes an empty
   * grid. No credentials: everything here is public, which is exactly why SSR
   * costs nothing and needs no cookie forwarding.
   */
  loader: async ({ deps }) => {
    const [listings, categories, priceBands] = await Promise.all([
      api.listings.search({ category: CATEGORY_SLUG, pageSize: 60, ...deps }),
      api.taxonomies.categories(),
      api.taxonomies.priceBands(),
    ]);
    return {
      listings: listings.items,
      total: listings.total,
      category: categories.find((c) => c.slug === CATEGORY_SLUG),
      priceBands,
    };
  },
  head: () => ({
    meta: [
      { title: "Hotels in Yercaud — Yercaud Business Directory" },
      { name: "description", content: "Discover verified hotels, resorts and homestays in Yercaud." },
      { property: "og:title", content: "Hotels in Yercaud" },
      { property: "og:description", content: "Discover verified hotels, resorts and homestays in Yercaud." },
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
      title="Hotels in Yercaud"
      subtitle="Find the perfect stay for your trip. From luxury resorts to cozy budget stays — explore verified hotels in Yercaud."
      ctaTitle="Stay in the Heart of Nature"
      ctaText="Wake up to misty mornings, fresh air and breathtaking views. Find your perfect stay in Yercaud today!"
      filters={filters}
      {...categoryFilterHandlers(navigate)}
    />
  );
}
