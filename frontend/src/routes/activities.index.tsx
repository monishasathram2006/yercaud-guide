import { createFileRoute } from "@tanstack/react-router";
import { CategoryPage } from "@/components/CategoryPage";
import { api } from "@/lib/api";
import { categoryFilterHandlers, validateCategorySearch } from "@/lib/category-filters";

const CATEGORY_SLUG = "activity";

export const Route = createFileRoute("/activities/")({
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
      { title: "Activities in Yercaud — Yercaud Business Directory" },
      { name: "description", content: "Treks, boating and things to do in Yercaud." },
      { property: "og:title", content: "Activities in Yercaud" },
      { property: "og:description", content: "Treks, boating and things to do in Yercaud." },
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
      title="Activities in Yercaud"
      subtitle="Ziplining, trekking, boating and more — pack your day with adventure across the Shevaroy Hills."
      ctaTitle="Adventure Awaits in Yercaud"
      ctaText="Try adrenaline-packed activities with verified guides and full safety gear."
      filters={filters}
      {...categoryFilterHandlers(navigate)}
    />
  );
}
