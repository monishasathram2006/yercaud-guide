import { createFileRoute } from "@tanstack/react-router";
import { CategoryPage } from "@/components/CategoryPage";
import { api } from "@/lib/api";
import { categoryFilterHandlers, validateCategorySearch } from "@/lib/category-filters";

const CATEGORY_SLUG = "restaurant";

export const Route = createFileRoute("/restaurants/")({
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
      { title: "Restaurants in Yercaud — Yercaud Business Directory" },
      { name: "description", content: "Find the best places to eat in Yercaud." },
      { property: "og:title", content: "Restaurants in Yercaud" },
      { property: "og:description", content: "Find the best places to eat in Yercaud." },
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
      title="Restaurants in Yercaud"
      subtitle="From local South Indian delicacies to multi-cuisine dining — taste the best of Yercaud."
      ctaTitle="Taste the Flavors of Yercaud"
      ctaText="Discover cozy cafés, family diners and rooftop restaurants across the hills."
      filters={filters}
      {...categoryFilterHandlers(navigate)}
    />
  );
}
