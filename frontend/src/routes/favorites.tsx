import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell, Breadcrumbs, SignInPrompt } from "@/components/PageShell";
import { useAuth } from "@/lib/auth";
import { useFavorites, useToggleFavorite } from "@/lib/favorites";
import { ListingThumb } from "@/components/ListingThumb";
import { detailPath, formatPrice, formatRating } from "@/lib/listing-display";
import { Mock } from "@/components/MockBadge";
import { Heart, Star, Clock, Search, GitCompare, Compass } from "lucide-react";

export const Route = createFileRoute("/favorites")({
  head: () => ({
    meta: [
      { title: "My Favorites — Yercaud Business Directory" },
      { name: "description", content: "All the places you love in Yercaud, saved in one place." },
    ],
  }),
  component: FavoritesPage,
});

function FavoritesPage() {
  const { isSignedIn } = useAuth();
  const { data: favorites, isLoading } = useFavorites();
  const toggle = useToggleFavorite();

  if (!isSignedIn) return <PageShell><SignInPrompt title="Sign in to see your favorites" sub="Save the places you love and revisit them anytime." /></PageShell>;

  return (
    <PageShell>
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Favorites" }]} />
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold text-gray-900">My Favorites <Heart className="h-6 w-6 text-red-500" fill="currentColor" /></h1>
            <p className="mt-1 text-sm text-gray-600">All the places you love, saved in one place.</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <aside className="space-y-5">
            <Mock note="Dead buttons — no recently-viewed, saved-search or compare features exist">
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="mb-2 text-sm font-semibold text-gray-900">Quick Actions</div>
              <div className="space-y-2 text-sm text-gray-700">
                <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50"><Clock className="h-4 w-4" /> Recently Viewed</button>
                <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50"><Search className="h-4 w-4" /> Search Saved</button>
                <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50"><GitCompare className="h-4 w-4" /> Compare List</button>
              </div>
            </div>
            </Mock>
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              <img src="https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600&q=80" alt="" className="h-32 w-full object-cover" />
              <div className="p-4">
                <div className="text-sm font-semibold text-gray-900">Explore More in Yercaud</div>
                <div className="mt-1 text-xs text-gray-600">Find new places to love and make unforgettable memories.</div>
                <Link to="/directory" className="mt-3 inline-block rounded-lg bg-[#1E7A46] px-4 py-2 text-xs font-medium text-white">Explore Now</Link>
              </div>
            </div>
          </aside>

          <div className="space-y-4 p-1">
            {isLoading && <p className="text-sm text-gray-500">Loading…</p>}

            {!isLoading && favorites?.length === 0 && (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-[#F7F9F8] p-12 text-center">
                <Compass className="mx-auto h-10 w-10 text-[#1E7A46]" />
                <div className="mt-3 font-semibold text-gray-900">No favorites yet</div>
                <p className="mt-1 text-sm text-gray-600">Start exploring and tap the heart icon to save places you love.</p>
                <Link to="/directory" className="mt-4 inline-block rounded-lg bg-[#1E7A46] px-4 py-2 text-sm text-white">Browse the directory</Link>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {favorites?.map((l) => {
                const price = formatPrice(l.priceFrom, l.priceUnit);
                const rating = formatRating(l.averageRating);
                return (
                  <div key={l.id} className="group overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
                    <div className="relative">
                      <ListingThumb src={l.primaryImageUrl} alt={l.name} className="h-40 w-full" />
                      <button
                        onClick={() => toggle.mutate({ listingId: l.id, isFavorite: true })}
                        title="Remove from favorites"
                        className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white shadow"
                      >
                        <Heart className="h-4 w-4 fill-red-500 text-red-500" />
                      </button>
                    </div>
                    <div className="p-3">
                      <div className="text-sm font-semibold text-gray-900">{l.name}</div>
                      <div className="mt-0.5 text-xs text-gray-500">{l.categoryName}{l.locationName ? ` · ${l.locationName}` : ""}</div>
                      {rating && <div className="mt-1 flex items-center gap-1 text-xs"><Star className="h-3 w-3 fill-yellow-500 text-yellow-500" /> {rating} ({l.reviewCount})</div>}
                      {price && <div className="mt-1 text-sm font-semibold text-[#1E7A46]">{price}</div>}
                      <Link to={detailPath(l)} className="mt-2 block rounded-md bg-[#1E7A46]/10 py-1.5 text-center text-xs font-medium text-[#1E7A46] hover:bg-[#1E7A46]/20">View Details</Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
