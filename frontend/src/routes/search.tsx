import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BusinessCardGrid } from "@/components/BusinessCard";
import { SearchBox } from "@/components/SearchBox";
import { HERO_IMG } from "@/lib/data";
import { api, type BusinessSummary } from "@/lib/api";
import { Link } from "@tanstack/react-router";
import { Building2, SearchX } from "lucide-react";

interface SearchQuery {
  q: string;
  category?: string;
  pageSize?: number;
}

export const Route = createFileRoute("/search")({
  /**
   * The submitted-search results page (issue #11). Server-rendered like the rest
   * of the public site: a shared or crawled /search?q=… URL should arrive with
   * its results already in the HTML, not blank until a client fetch. It runs the
   * full hybrid ranking (mode defaults to 'full'), unlike the type-ahead dropdown.
   */
  validateSearch: (search: Record<string, unknown>): SearchQuery => ({
    q: typeof search.q === "string" ? search.q : "",
    category: typeof search.category === "string" && search.category ? search.category : undefined,
    pageSize: typeof search.pageSize === "number" ? search.pageSize : undefined,
  }),
  loaderDeps: ({ search }) => ({ q: search.q, category: search.category, pageSize: search.pageSize }),
  loader: async ({ deps }) => {
    const q = deps.q.trim();
    if (!q) return { q, category: deps.category, listings: [], businesses: [] as BusinessSummary[], priceBands: [], colorBySlug: new Map<string, string | null>() };
    const [result, categories, priceBands] = await Promise.all([
      api.search({ q, category: deps.category, mode: "full", pageSize: deps.pageSize ?? 24 }),
      api.taxonomies.categories(),
      api.taxonomies.priceBands(),
    ]);
    return {
      q,
      category: deps.category,
      listings: result.listings,
      businesses: result.businesses,
      priceBands,
      colorBySlug: new Map(categories.map((c) => [c.slug ?? "", c.color])),
    };
  },
  head: ({ loaderData }) => {
    const q = loaderData?.q ?? "";
    const title = q ? `Search: ${q} — Yercaud Business Directory` : "Search — Yercaud Business Directory";
    return {
      meta: [
        { title },
        { name: "description", content: q ? `Results for “${q}” across Yercaud's hotels, restaurants, activities and more.` : "Search the Yercaud directory." },
        // A results page is not something we want indexed as canonical content.
        { name: "robots", content: "noindex,follow" },
      ],
    };
  },
  component: SearchPage,
});

function SearchPage() {
  const { q, category, listings, businesses, priceBands, colorBySlug } = Route.useLoaderData();
  const nothing = q && listings.length === 0 && businesses.length === 0;

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <section className="relative overflow-hidden bg-[#0e2a3b]">
        <img src={HERO_IMG} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
        <div className="relative mx-auto max-w-3xl px-6 py-14">
          <h1 className="text-center text-2xl font-bold text-white drop-shadow sm:text-3xl">
            {q ? <>Results for “{q}”</> : "Search the directory"}
          </h1>
          <div className="mx-auto mt-6 max-w-2xl">
            <SearchBox category={category} />
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-6 py-12">
        {!q ? (
          <p className="text-center text-gray-500">Type something above to search.</p>
        ) : nothing ? (
          <div className="flex flex-col items-center py-16 text-center">
            <SearchX className="h-10 w-10 text-gray-300" />
            <h2 className="mt-4 text-lg font-semibold text-gray-900">No results for “{q}”</h2>
            <p className="mt-1 text-sm text-gray-500">Try fewer or different words, or browse the directory.</p>
            <Link to="/directory" className="mt-5 rounded-lg bg-[#1E7A46] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#186238]">
              Browse the directory
            </Link>
          </div>
        ) : (
          <>
            {listings.length > 0 && (
              <section>
                <h2 className="mb-5 text-lg font-bold text-gray-900">
                  Listings <span className="text-sm font-normal text-gray-400">({listings.length})</span>
                </h2>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {listings.map((l) => (
                    <BusinessCardGrid key={l.id} listing={l} priceBands={priceBands} categoryColor={colorBySlug.get(l.categorySlug)} />
                  ))}
                </div>
              </section>
            )}

            {businesses.length > 0 && (
              <section className="mt-12">
                <h2 className="mb-5 text-lg font-bold text-gray-900">
                  Businesses <span className="text-sm font-normal text-gray-400">({businesses.length})</span>
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {businesses.map((b) => (
                    <BusinessResultCard key={b.id} business={b} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}

function BusinessResultCard({ business }: { business: BusinessSummary }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#1E7A46]/10">
        {business.logoUrl ? (
          <img src={business.logoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Building2 className="h-5 w-5 text-[#1E7A46]" />
        )}
      </span>
      <div className="min-w-0">
        <div className="truncate font-semibold text-gray-900">{business.name}</div>
        {business.address && <div className="truncate text-xs text-gray-500">{business.address}</div>}
        <div className="mt-1 text-xs text-gray-400">{business.listingCount} listing{business.listingCount === 1 ? "" : "s"}</div>
      </div>
    </div>
  );
}
