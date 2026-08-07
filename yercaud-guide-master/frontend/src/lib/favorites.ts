import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type ListingSummary } from "./api";
import { useAuth } from "./auth";

export const FAVORITES_KEY = ["me", "favorites"] as const;

/**
 * The signed-in User's favourites.
 *
 * Client-side only, like everything user-specific: a favourite is personal, so
 * server-rendering it would mean a response that must never be cached. The heart
 * on a card fills in after hydration.
 */
export function useFavorites() {
  const { isSignedIn } = useAuth();
  return useQuery({
    queryKey: FAVORITES_KEY,
    queryFn: ({ signal }) => api.me.favorites(signal),
    // A visitor has no favourites to fetch — asking would just 401.
    enabled: isSignedIn,
    retry: (count, error) => !(error instanceof ApiError && error.status === 401) && count < 2,
    throwOnError: false,
  });
}

export function useIsFavorite(listingId: string): boolean {
  const { data } = useFavorites();
  return Boolean(data?.some((l: ListingSummary) => l.id === listingId));
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ listingId, isFavorite }: { listingId: string; isFavorite: boolean }) =>
      isFavorite ? api.listings.unfavorite(listingId) : api.listings.favorite(listingId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FAVORITES_KEY }),
  });
}
