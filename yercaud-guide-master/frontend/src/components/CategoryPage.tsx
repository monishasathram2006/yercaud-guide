import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BusinessCardGrid } from "@/components/BusinessCard";
import { SearchBox } from "@/components/SearchBox";
import { HERO_IMG } from "@/lib/data";
import { api, type Category, type ListingSummary, type PriceBand } from "@/lib/api";
import { type CategoryFilters, hasActiveCategoryFilters } from "@/lib/category-filters";
import { Link } from "@tanstack/react-router";
import { ChevronRight, MapPin, Calendar, Users, Search, Star, ShieldCheck, Lock, Headphones, BadgePercent, RotateCcw } from "lucide-react";

interface Props {
  /**
   * Fetched server-side by the route's loader, not filtered out of a mock array
   * in the browser. This is what a crawler sees in the HTML.
   */
  listings: ListingSummary[];
  category: Category | undefined;
  priceBands: PriceBand[];
  title: string;
  subtitle: string;
  ctaTitle: string;
  ctaText: string;
  /**
   * Filter state lives in the calling route's URL search params (see
   * hotels.index.tsx etc.), not here — a route module has real, strictly-typed
   * `Route.useSearch()`/`Route.useNavigate()`, which a shared component reused
   * across four different routes can't get without `strict: false` defeating
   * TanStack Router's type inference. So the route owns the state; this just
   * renders it and calls back.
   */
  filters: CategoryFilters;
  onFilterChange: (patch: Partial<CategoryFilters>) => void;
  onClearFilters: () => void;
}

export function CategoryPage({
  listings,
  category,
  priceBands,
  title,
  subtitle,
  ctaTitle,
  ctaText,
  filters,
  onFilterChange,
  onClearFilters,
}: Props) {
  const [sort, setSort] = useState("Recommended");
  const [showFilters, setShowFilters] = useState(false);
  const isHotelCategory = category?.slug === "hotel";
  const filtersActive = hasActiveCategoryFilters(filters);

  // Sorting the page in hand, not the whole directory: GET /listings has no sort
  // parameter, so a true global sort would need one. Fine while a category fits
  // in a page; a real sort belongs in the API, not here.
  const sorted = [...listings].sort((a, b) => {
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
            so the breadcrumb, heading and subtext stay legible over the photo. */}
        <div className="absolute inset-0 bg-black/35" />
        <div className="relative mx-auto max-w-7xl px-6 py-14">
          <div className="mb-3 flex items-center gap-1 text-sm text-white/80 drop-shadow">
            <Link to="/" className="hover:text-emerald-300">Home</Link>
            <ChevronRight className="h-4 w-4" />
            <span className="text-emerald-300">{title}</span>
          </div>
          <h1 className="text-3xl font-bold text-white drop-shadow-md sm:text-4xl">
            {title} <span className="text-emerald-300">🍃</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/90 drop-shadow">{subtitle}</p>

          {/* Scoped to this category — "Lake" here searches within it (issue #11). */}
          <div className="mt-8 max-w-2xl">
            <SearchBox category={category?.slug} placeholder={`Search ${title.toLowerCase()}…`} />
          </div>
        </div>
      </section>

      <section className="border-b border-gray-100 bg-[#F7F9F8] py-5">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-6 sm:grid-cols-4">
          {[
            { icon: BadgePercent, title: "Best Local Prices", sub: "Get the best deals" },
            { icon: ShieldCheck, title: "Verified Properties", sub: "Handpicked & verified" },
            { icon: Lock, title: "Verified Listings", sub: "Checked & trusted" },
            { icon: Headphones, title: "Local Support", sub: "We're here for you 24/7" },
          ].map((t) => (
            <div key={t.title} className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-[#1E7A46]/10">
                <t.icon className="h-5 w-5 text-[#1E7A46]" />
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900">{t.title}</div>
                <div className="text-xs text-gray-500">{t.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-10">
        <button
          onClick={() => setShowFilters((v) => !v)}
          className="mb-4 rounded-md border border-gray-200 px-4 py-2 text-sm lg:hidden"
        >
          {showFilters ? "Hide" : "Show"} Filters
        </button>
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className={`${showFilters ? "block" : "hidden"} lg:block`}>
            <FilterSidebar
              isHotelCategory={isHotelCategory}
              filters={filters}
              onFilterChange={onFilterChange}
              onClearFilters={onClearFilters}
            />
          </aside>
          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-gray-700">
                Showing <span className="font-semibold">{sorted.length}</span> {title.toLowerCase()} in Yercaud
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
                {filtersActive
                  ? "No listings match these filters. Try clearing some."
                  : "No listings yet in this category. Check back soon!"}
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {sorted.map((l) => (
                  <BusinessCardGrid key={l.id} listing={l} priceBands={priceBands} categoryColor={category?.color} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-14">
        <div className="grid gap-6 overflow-hidden rounded-2xl bg-[#F7F9F8] p-6 md:grid-cols-[240px_1fr] md:items-center md:gap-8 md:p-8">
          <img
            src="https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=600&q=80"
            alt=""
            className="h-40 w-full rounded-xl object-cover md:h-full"
          />
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <h3 className="text-xl font-bold text-gray-900">{ctaTitle} 🍃</h3>
              <p className="mt-1 text-sm text-gray-600">{ctaText}</p>
              <div className="mt-4 flex flex-wrap gap-6">
                {[
                  { icon: BadgePercent, label: "Direct Contact", sub: "Reach owners instantly" },
                  { icon: ShieldCheck, label: "Best Deals", sub: "Get exclusive offers" },
                  { icon: Headphones, label: "24/7 Support", sub: "We're here to help" },
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
              Explore More
            </button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-gray-100 pb-4 last:border-0">
      <h4 className="mb-3 text-sm font-semibold text-gray-900">{title}</h4>
      {children}
    </div>
  );
}

/** The one control shape every filter section is built from: a checkbox that toggles one value. */
function ToggleFilter({ checked, onChange, children }: { checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label className="flex items-center gap-2 py-1 text-sm text-gray-700">
      <input type="checkbox" checked={checked} onChange={onChange} className="accent-[#1E7A46]" />
      {children}
    </label>
  );
}

const MAX_PRICE = 15000;
const GUEST_RATING_STEPS = [4.5, 4, 3.5, 3];
const STAR_RATING_STEPS = [5, 4, 3, 2, 1];

/**
 * Every control here writes straight into the route's URL search params (via
 * `onFilterChange`, owned by the calling route), which the route loader reads
 * and re-fetches GET /listings against — so a filter change is a real
 * server-side query, not a client-side slice of the page already in hand
 * (unlike Sort, above). Shareable/bookmarkable for free, same as /search.
 */
function FilterSidebar({
  isHotelCategory,
  filters: search,
  onFilterChange: setFilter,
  onClearFilters,
}: {
  isHotelCategory: boolean;
  filters: CategoryFilters;
  onFilterChange: (patch: Partial<CategoryFilters>) => void;
  onClearFilters: () => void;
}) {
  const { data: amenities } = useQuery({
    queryKey: ["amenities"],
    queryFn: ({ signal }) => api.taxonomies.amenities(signal),
  });
  const { data: propertyTypes } = useQuery({
    queryKey: ["property-types"],
    queryFn: ({ signal }) => api.taxonomies.propertyTypes(signal),
    enabled: isHotelCategory,
  });

  const selectedAmenities = new Set((search.amenities ?? "").split(",").filter(Boolean));
  function toggleAmenity(name: string) {
    const next = new Set(selectedAmenities);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setFilter({ amenities: next.size > 0 ? [...next].join(",") : undefined });
  }

  // Local while dragging; only written to the URL (and re-fetched) on release,
  // so a drag doesn't fire a request per pixel.
  const [maxPrice, setMaxPrice] = useState(search.maxPrice ?? MAX_PRICE);
  useEffect(() => setMaxPrice(search.maxPrice ?? MAX_PRICE), [search.maxPrice]);
  function commitMaxPrice() {
    setFilter({ maxPrice: maxPrice < MAX_PRICE ? maxPrice : undefined });
  }

  const [showAllAmenities, setShowAllAmenities] = useState(false);
  const visibleAmenities = showAllAmenities ? (amenities ?? []) : (amenities ?? []).slice(0, 5);

  return (
    <div className="space-y-5 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <span>≡</span> Filter By
        </div>
        <button
          type="button"
          disabled={!hasActiveCategoryFilters(search)}
          onClick={onClearFilters}
          className="flex items-center gap-1 rounded-md border border-[#1E7A46] px-2 py-1 text-xs font-medium text-[#1E7A46] hover:bg-[#1E7A46] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#1E7A46]"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Clear
        </button>
      </div>
      <FilterSection title="Price up to / night">
        <input
          type="range"
          className="w-full accent-[#1E7A46]"
          min={0}
          max={MAX_PRICE}
          step={500}
          value={maxPrice}
          onChange={(e) => setMaxPrice(Number(e.target.value))}
          onMouseUp={commitMaxPrice}
          onTouchEnd={commitMaxPrice}
        />
        <div className="mt-1 flex justify-between text-xs text-gray-500">
          <span>₹0</span>
          <span>{maxPrice >= MAX_PRICE ? `₹${MAX_PRICE.toLocaleString("en-IN")}+` : `₹${maxPrice.toLocaleString("en-IN")}`}</span>
        </div>
      </FilterSection>

      {/* Hotel-only (ADR 0003): hotel_details has no row for any other Category. */}
      {isHotelCategory && (
        <FilterSection title="Property Type">
          <ToggleFilter checked={!search.propertyType} onChange={() => setFilter({ propertyType: undefined })}>
            All Types
          </ToggleFilter>
          {(propertyTypes ?? []).map((pt) => (
            <ToggleFilter
              key={pt.id}
              checked={search.propertyType === pt.name}
              onChange={() => setFilter({ propertyType: search.propertyType === pt.name ? undefined : pt.name })}
            >
              {pt.name}
            </ToggleFilter>
          ))}
        </FilterSection>
      )}

      {isHotelCategory && (
        <FilterSection title="Star Rating">
          {STAR_RATING_STEPS.map((n) => (
            <ToggleFilter
              key={n}
              checked={search.minStarRating === n}
              onChange={() => setFilter({ minStarRating: search.minStarRating === n ? undefined : n })}
            >
              <span className="flex text-yellow-500">
                {Array.from({ length: n }).map((_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-yellow-500" />
                ))}
              </span>
              {n < 5 && <span className="text-xs text-gray-500">& above</span>}
            </ToggleFilter>
          ))}
        </FilterSection>
      )}

      <FilterSection title="Amenities">
        {visibleAmenities.map((a) => (
          <ToggleFilter key={a.id} checked={selectedAmenities.has(a.name)} onChange={() => toggleAmenity(a.name)}>
            {a.name}
          </ToggleFilter>
        ))}
        {(amenities?.length ?? 0) > 5 && (
          <button
            type="button"
            onClick={() => setShowAllAmenities((v) => !v)}
            className="mt-1 text-xs font-medium text-[#1E7A46]"
          >
            {showAllAmenities ? "Show less" : "Show more"}
          </button>
        )}
      </FilterSection>

      <FilterSection title="Guest Rating">
        {GUEST_RATING_STEPS.map((r) => (
          <ToggleFilter
            key={r}
            checked={search.minRating === r}
            onChange={() => setFilter({ minRating: search.minRating === r ? undefined : r })}
          >
            {r.toFixed(1)} &amp; above
          </ToggleFilter>
        ))}
      </FilterSection>
    </div>
  );
}
