/**
 * The category-page filter sidebar's state lives in the URL (shareable,
 * bookmarkable, and consistent with how /search already does it) rather than
 * component state — see search.tsx's validateSearch/loaderDeps/loader shape,
 * which this mirrors for /hotels, /restaurants, /activities and /tours.
 */
export interface CategoryFilters {
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  /** Comma-separated amenity names — AND semantics on the backend. */
  amenities?: string;
  /** Hotel-only (hotel_details.star_rating). */
  minStarRating?: number;
  /** Hotel-only (property_types.name). */
  propertyType?: string;
}

export function hasActiveCategoryFilters(filters: CategoryFilters): boolean {
  return Object.values(filters).some((v) => v !== undefined);
}

/**
 * The same two handlers every category route wires up identically — merge a
 * patch into the URL's filters, or clear them — parameterized over that
 * route's own strictly-typed `Route.useNavigate()` so this stays one place
 * instead of five near-identical copies.
 */
export function categoryFilterHandlers(
  navigate: (opts: { search: CategoryFilters | ((prev: CategoryFilters) => CategoryFilters); replace?: boolean }) => unknown,
) {
  return {
    onFilterChange: (patch: Partial<CategoryFilters>) =>
      void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true }),
    onClearFilters: () => void navigate({ search: {}, replace: true }),
  };
}

export function validateCategorySearch(search: Record<string, unknown>): CategoryFilters {
  return {
    minPrice: typeof search.minPrice === "number" ? search.minPrice : undefined,
    maxPrice: typeof search.maxPrice === "number" ? search.maxPrice : undefined,
    minRating: typeof search.minRating === "number" ? search.minRating : undefined,
    amenities: typeof search.amenities === "string" && search.amenities ? search.amenities : undefined,
    minStarRating: typeof search.minStarRating === "number" ? search.minStarRating : undefined,
    propertyType: typeof search.propertyType === "string" && search.propertyType ? search.propertyType : undefined,
  };
}
