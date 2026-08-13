import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, type Business, type ListingSummary } from "@/lib/api";

/** The one mutation error handler: surface the API's message, which is written for humans. */
export function onApiError(error: unknown) {
  toast.error(error instanceof Error ? error.message : "Request failed");
}

/**
 * Shared owner-scoped data. GET /businesses already answers "which Businesses
 * are mine" — the backend scopes the list to the caller unless they hold the
 * admin override, so these hooks are only rendered on owner-facing surfaces
 * (the owner dashboard, My Listings, Business Profile).
 */

export function useOwnBusinesses() {
  return useQuery({
    queryKey: ["businesses", "own"],
    queryFn: ({ signal }) => api.businesses.list({}, signal),
  });
}

/** Every Listing under the caller's Businesses, across statuses. */
export function useOwnListings(businesses: Business[] | undefined) {
  return useQuery({
    queryKey: ["listings", "own", businesses?.map((b) => b.id)],
    enabled: businesses !== undefined,
    queryFn: async ({ signal }): Promise<ListingSummary[]> => {
      const pages = await Promise.all(
        (businesses ?? []).map((b) => api.listings.search({ businessId: b.id, pageSize: 100 }, signal)),
      );
      return pages.flatMap((p) => p.items);
    },
  });
}

/**
 * id → name for the caller-visible Listings. Several admin tables (Reviews,
 * Enquiries, Promotions, Featured) carry only listingId; the join belongs in
 * the API eventually (known gap, ticketed), so resolve names client-side
 * rather than papering over it with a schema change mid-task.
 */
export function useListingNames() {
  return useQuery({
    queryKey: ["listings", "name-map"],
    queryFn: ({ signal }) => api.listings.search({ pageSize: 100 }, signal),
    select: (d) => new Map(d.items.map((l) => [l.id, l.name])),
    staleTime: 60 * 1000,
  });
}
