import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BusinessCardHorizontal } from "@/components/BusinessCard";
import { SearchBox } from "@/components/SearchBox";
import { HERO_IMG } from "@/lib/data";
import { api } from "@/lib/api";
import {
  Search,
  MapPin,
  Grid3x3,
  Leaf,
  Star,
  RotateCcw,
  Hotel,
  UtensilsCrossed,
  Activity,
  Car,
  Briefcase,
  ShoppingBag,
  Eye,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

export const Route = createFileRoute("/directory")({
  /**
   * Server-rendered: the directory is the site's main index page, and a crawler
   * that sees an empty grid indexes an empty grid.
   *
   * The per-category counts are one request each. GET /listings has no
   * group-by-category, so a count means asking for a page of one and reading
   * `total`. Eight parallel requests server-side is honest and fast enough; a
   * listingCount on the Category response would be the real fix, and is a
   * candidate if this page ever feels slow.
   */
  loader: async () => {
    const [all, categories, priceBands] = await Promise.all([
      api.listings.search({ pageSize: 100 }),
      api.taxonomies.categories(),
      api.taxonomies.priceBands(),
    ]);
    const counts = await Promise.all(
      categories.map((c) => api.listings.search({ category: c.slug, pageSize: 1 }).then((r) => [c.slug, r.total] as const)),
    );
    const countBySlug = new Map(counts);
    return {
      listings: all.items,
      total: all.total,
      priceBands,
      categories: categories.map((c) => ({ ...c, listingCount: countBySlug.get(c.slug) ?? 0 })),
    };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: "Directory — Yercaud Business Directory" },
      {
        name: "description",
        // The mock advertised "250+ businesses" regardless of how many existed.
        content: `Browse ${loaderData?.total ?? 0} businesses across categories in Yercaud.`,
      },
      { property: "og:title", content: "Yercaud Business Directory" },
      { property: "og:description", content: "Find trusted local businesses in Yercaud." },
    ],
  }),
  component: DirectoryPage,
});

const iconMap: Record<string, typeof Hotel> = {
  Hotel,
  UtensilsCrossed,
  Activity,
  Car,
  Briefcase,
  ShoppingBag,
  Leaf,
  Grid3x3,
};

function DirectoryPage() {
  const { listings, categories, priceBands } = Route.useLoaderData();
  const [selectedCat, setSelectedCat] = useState("All Categories");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("Recommended");
  const [showFilters, setShowFilters] = useState(false);

  const colorOf = new Map(categories.map((c) => [c.slug ?? "", c.color ?? undefined]));

  // Filtered in the browser over the server-rendered page. GET /listings does
  // support q and category, so a large directory should push these to the API and
  // re-fetch — but that turns the first paint into a client fetch, which is what
  // SSR is here to avoid. This is the right trade while the whole directory fits
  // in one page; it stops being right when it doesn't.
  const filtered = listings.filter((l) => {
    if (selectedCat !== "All Categories" && l.categorySlug !== selectedCat) return false;
    if (search && !l.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "Rating") return (b.averageRating ?? 0) - (a.averageRating ?? 0);
    if (sort === "Price Low-High") return (a.priceFrom ?? Infinity) - (b.priceFrom ?? Infinity);
    if (sort === "Price High-Low") return (b.priceFrom ?? -Infinity) - (a.priceFrom ?? -Infinity);
    return 0;
  });

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <section className="relative overflow-hidden">
        <img src={HERO_IMG} alt="" className="absolute inset-0 h-full w-full object-cover" />
        {/* Same immersive treatment as the home hero: dark scrim + white copy,
            so the heading and subtext stay legible over the photo. */}
        <div className="absolute inset-0 bg-black/35" />
        <div className="relative mx-auto max-w-7xl px-6 py-16 text-center">
          <h1 className="text-4xl font-bold text-white drop-shadow-md">
            Yercaud Business <span className="text-emerald-300">Directory</span>
            <Leaf className="ml-1 inline h-6 w-6 text-emerald-300" />
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-white/90 drop-shadow">
            Find trusted local businesses across hotels, restaurants, activities, travel, tours and more.
          </p>
          <div className="mx-auto mt-8 max-w-3xl">
            <SearchBox placeholder="Search the whole directory…" />
          </div>
        </div>
      </section>

      {/* Category grid */}
      <section className="mx-auto max-w-7xl px-6 py-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {categories.map((c) => {
            const Icon = iconMap[c.icon ?? ""] ?? Grid3x3;
            const slug = c.slug ?? "";
            const isSelected = selectedCat === slug;
            return (
              <button
                key={slug}
                onClick={() => setSelectedCat(isSelected ? "All Categories" : slug)}
                className={`rounded-xl border p-4 text-center transition ${
                  isSelected
                    ? "border-[#1E7A46] shadow-md"
                    : "border-gray-100 bg-white shadow-sm hover:shadow-md"
                }`}
              >
                <div
                  className="mx-auto grid h-12 w-12 place-items-center rounded-xl"
                  style={{ backgroundColor: `${c.color ?? "#6B7280"}15` }}
                >
                  <Icon className="h-6 w-6" style={{ color: c.color ?? undefined }} />
                </div>
                <div className="mt-2 text-sm font-semibold text-gray-900">{c.name}</div>
                {/* A real count, not the 48/73/26 the mock typed in. */}
                <div className="text-xs text-gray-500">{c.listingCount} Listings</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Main content */}
      <section className="mx-auto max-w-7xl px-6 pb-14">
        <button
          onClick={() => setShowFilters((v) => !v)}
          className="mb-4 rounded-md border border-gray-200 px-4 py-2 text-sm lg:hidden"
        >
          {showFilters ? "Hide" : "Show"} Filters
        </button>
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className={`${showFilters ? "block" : "hidden"} lg:block`}>
            <div className="space-y-5 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <span>≡</span> Filter By
                </div>
                <button
                  onClick={() => {
                    setSelectedCat("All Categories");
                    setSearch("");
                  }}
                  className="flex items-center gap-1 rounded-md border border-[#1E7A46] px-2 py-1 text-xs font-medium text-[#1E7A46] hover:bg-[#1E7A46] hover:text-white"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Clear
                </button>
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold text-gray-700">
                  Search in directory
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Business name, keyword..."
                    className="w-full rounded-md border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-[#1E7A46] focus:outline-none"
                  />
                </div>
              </div>
              <FilterGroup title="Category">
                {["All Categories", ...categories.map((c) => c.name)].map((c) => (
                  <label key={c} className="flex items-center gap-2 py-1 text-sm text-gray-700">
                    <input
                      type="radio"
                      name="cat"
                      checked={selectedCat === c}
                      onChange={() => setSelectedCat(c)}
                      className="accent-[#1E7A46]"
                    />
                    {c}
                  </label>
                ))}
              </FilterGroup>
              <FilterGroup title="Location">
                <select className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm">
                  <option>Yercaud</option>
                </select>
              </FilterGroup>
              <FilterGroup title="Rating">
                {["4.5 & above", "4.0 & above", "3.5 & above", "3.0 & above"].map((r) => (
                  <label key={r} className="flex items-center gap-2 py-1 text-sm text-gray-700">
                    <input type="checkbox" className="accent-[#1E7A46]" />
                    <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
                    {r}
                  </label>
                ))}
              </FilterGroup>
              <FilterGroup title="Price Range">
                {[
                  { s: "₹", label: "Budget Friendly" },
                  { s: "₹₹", label: "Moderate" },
                  { s: "₹₹₹", label: "Premium" },
                  { s: "₹₹₹₹", label: "Luxury" },
                ].map((p) => (
                  <label key={p.label} className="flex items-center gap-2 py-1 text-sm text-gray-700">
                    <input type="checkbox" className="accent-[#1E7A46]" />
                    <span className="font-semibold text-[#1E7A46]">{p.s}</span> {p.label}
                  </label>
                ))}
              </FilterGroup>
            </div>
          </aside>

          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-gray-700">
                Showing <span className="font-semibold">250+</span> businesses in Yercaud
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">Sort by:</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-[#1E7A46] focus:outline-none"
                >
                  <option>Recommended</option>
                  <option>Rating</option>
                  <option>Price Low-High</option>
                  <option>Price High-Low</option>
                </select>
              </div>
            </div>
            {sorted.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-[#F7F9F8] p-12 text-center text-sm text-gray-500">
                No businesses match your filters.
              </div>
            ) : (
              <div className="space-y-4">
                {sorted.map((l) => (
                  <BusinessCardHorizontal
                    key={l.id}
                    listing={l}
                    priceBands={priceBands}
                    categoryColor={colorOf.get(l.categorySlug)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* List your business CTA */}
      <section className="mx-auto max-w-7xl px-6 pb-14">
        <div className="grid gap-6 rounded-2xl bg-[#F7F9F8] p-8 md:grid-cols-[auto_1fr_auto] md:items-center md:gap-10">
          <img
            src="https://images.unsplash.com/photo-1523482580672-f109ba8cb9be?w=300&q=80"
            alt=""
            className="hidden h-24 w-40 rounded-xl object-cover md:block"
          />
          <div>
            <h3 className="text-xl font-bold text-gray-900">
              List Your Business in Yercaud Directory <Leaf className="ml-1 inline h-5 w-5 text-[#1E7A46]" />
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Reach thousands of travelers and locals. Grow your business with us.
            </p>
            <div className="mt-4 flex flex-wrap gap-6">
              {[
                { icon: Eye, label: "Increase Visibility", sub: "Get discovered by more customers" },
                { icon: ShieldCheck, label: "Trusted Platform", sub: "Verified and reliable directory" },
                { icon: TrendingUp, label: "Grow Your Business", sub: "Attract more leads and sales" },
              ].map((t) => (
                <div key={t.label} className="flex items-center gap-2">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-[#1E7A46]/10">
                    <t.icon className="h-4 w-4 text-[#1E7A46]" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-900">{t.label}</div>
                    <div className="text-[11px] text-gray-500">{t.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button className="justify-self-start rounded-md bg-[#1E7A46] px-6 py-3 text-sm font-medium text-white hover:bg-[#186238] md:justify-self-end">
            List Your Business
          </button>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-gray-100 pb-4 last:border-0">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-700">{title}</h4>
      {children}
    </div>
  );
}
