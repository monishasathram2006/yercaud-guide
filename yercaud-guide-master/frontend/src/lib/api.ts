import type { components } from "./api-schema";

/**
 * The public site's API client.
 *
 * Types come from backend/openapi.yaml via `npm run api:types` — never
 * hand-written, so they can't drift from the backend. This wrapper is the only
 * hand-written part, and it's deliberately duplicated in Admin rather than
 * shared: the two apps build as separate containers to separate subdomains, and
 * a shared package would drag every image's build context up to the repo root
 * for the sake of ~50 lines.
 */

type Schemas = components["schemas"];

export type Listing = Schemas["Listing"];
export type ListingSummary = Schemas["ListingSummary"];
export type ListingBadge = Schemas["ListingBadge"];
export type FeaturedListingItem = Schemas["FeaturedListingItem"];
export type FeaturedSections = Schemas["FeaturedSections"];
export type PriceUnit = Schemas["PriceUnit"];
export type Category = Schemas["Category"];
/**
 * Locations and blog categories are plain NamedLookups in the contract — they
 * have no schema of their own. Aliased here so callers read as the domain does
 * (CONTEXT.md's Location), without pretending the API says something it doesn't.
 */
export type Location = Schemas["NamedLookup"];
export type Badge = Schemas["Badge"];
export type PriceBand = Schemas["PriceBand"];
export type CurrentUser = Schemas["CurrentUser"];
export type Review = Schemas["Review"];
export type BlogPost = Schemas["BlogPost"];
export type BlogPostSummary = Schemas["BlogPostSummary"];
export type BlogCategory = Schemas["NamedLookup"];
export type Faq = Schemas["Faq"];
export type FaqCategory = Schemas["FaqCategory"];
export type ContentBlock = Schemas["ContentBlock"];
export type Enquiry = Schemas["Enquiry"];
export type Business = Schemas["Business"];
export type HotelDetails = Schemas["HotelDetails"];
export type HotelRoom = Schemas["HotelRoom"];
export type RestaurantDetails = Schemas["RestaurantDetails"];
export type ActivityDetails = Schemas["ActivityDetails"];
export type TourDetails = Schemas["TourDetails"];
export type OpeningHour = Schemas["OpeningHour"];
export type MenuItem = Schemas["MenuItem"];
export type ItineraryStep = Schemas["ItineraryStep"];
export type Inclusion = Schemas["Inclusion"];
export type TourAttraction = Schemas["TourAttraction"];

/**
 * Two base URLs, because this app renders on a server *and* in a browser.
 *
 * Server-side (route loaders, SSR) the API is reachable on the container
 * network — http://backend:4000 — while the browser must use the public
 * hostname. Vite only inlines VITE_-prefixed vars into the client bundle, so
 * INTERNAL_API_URL stays server-only by construction.
 */
const PUBLIC_API_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

function baseUrl(): string {
  if (typeof window !== "undefined") return PUBLIC_API_URL;
  return process.env.INTERNAL_API_URL ?? PUBLIC_API_URL;
}

/**
 * A plain browser navigation, not a fetch: the whole point of the redirect
 * flow (issue #12) is the browser following Google's own redirect chain and
 * coming back with a session cookie already set by the backend.
 */
export function googleSignInUrl(): string {
  return `${PUBLIC_API_URL.replace(/\/$/, "")}/auth/google`;
}

/**
 * A locally-uploaded image (avatar, listing photo) comes back from the API as
 * a root-relative "/uploads/..." path — served by the backend, not this app.
 * Rendered as-is, the browser resolves it against this app's own origin
 * instead (issue #14). Every other image URL in the app (Google avatars,
 * mock Unsplash URLs) is already absolute and passes through unchanged.
 */
export function resolveUploadUrl(url: string | null): string | null {
  if (!url || !url.startsWith("/")) return url;
  return `${PUBLIC_API_URL.replace(/\/$/, "")}${url}`;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Query params; undefined values are dropped rather than sent as "undefined". */
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(path.replace(/^\//, ""), `${baseUrl().replace(/\/$/, "")}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "")
      url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, signal } = options;

  const response = await fetch(buildUrl(path, query), {
    method,
    signal,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    // The session is an httpOnly cookie. Same-site across our subdomains, so it
    // flows without SameSite=None (see backend config.secureCookies).
    //
    // Only meaningful in the browser: server-side fetches have no cookie jar,
    // which is fine — SSR here renders anonymous content only, by design. Any
    // page that needs the signed-in User fetches it client-side.
    credentials: "include",
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const parsed = text ? (JSON.parse(text) as unknown) : undefined;

  if (!response.ok) {
    const message =
      parsed && typeof parsed === "object" && "message" in parsed
        ? String((parsed as { message: unknown }).message)
        : `Request failed with ${response.status}`;
    throw new ApiError(response.status, message);
  }

  return parsed as T;
}

/** True when a failure was a 404 — lets a loader turn "not found" into notFound() rather than an error page. */
export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

export interface ListingSearchParams extends Record<string, string | number | undefined> {
  q?: string;
  category?: string;
  location?: string;
  minRating?: number;
  priceBand?: string;
  minPrice?: number;
  maxPrice?: number;
  /** Comma-separated amenity names — AND semantics on the backend. */
  amenities?: string;
  minStarRating?: number;
  propertyType?: string;
  page?: number;
  pageSize?: number;
}

export interface Paged<T> {
  items: T[];
  total: number;
}

export type BusinessSummary = Schemas["BusinessSummary"];
/** The grouped shape GET /search returns — Listings primary, Businesses secondary. */
export interface SearchResult {
  listings: ListingSummary[];
  businesses: BusinessSummary[];
}
export interface SearchParams extends Record<string, string | number | undefined> {
  q: string;
  category?: string;
  /** 'quick' = lexical-only, for the type-ahead dropdown; omit for the full hybrid page. */
  mode?: "full" | "quick";
  pageSize?: number;
}

export const api = {
  /** The hybrid directory search (issue #11). */
  search: (params: SearchParams, signal?: AbortSignal) =>
    apiFetch<SearchResult>("/search", { query: params, signal }),

  listings: {
    search: (params: ListingSearchParams = {}, signal?: AbortSignal) =>
      apiFetch<Paged<ListingSummary>>("/listings", { query: params, signal }),
    bySlug: (slug: string, signal?: AbortSignal) =>
      apiFetch<Listing>(`/listings/by-slug/${slug}`, { signal }),
    byId: (id: string, signal?: AbortSignal) => apiFetch<Listing>(`/listings/${id}`, { signal }),
    hotelDetails: (id: string, signal?: AbortSignal) =>
      apiFetch<Schemas["HotelDetails"]>(`/listings/${id}/hotel-details`, { signal }),
    restaurantDetails: (id: string, signal?: AbortSignal) =>
      apiFetch<Schemas["RestaurantDetails"]>(`/listings/${id}/restaurant-details`, { signal }),
    activityDetails: (id: string, signal?: AbortSignal) =>
      apiFetch<Schemas["ActivityDetails"]>(`/listings/${id}/activity-details`, { signal }),
    tourDetails: (id: string, signal?: AbortSignal) =>
      apiFetch<Schemas["TourDetails"]>(`/listings/${id}/tour-details`, { signal }),
    reviews: (id: string, signal?: AbortSignal) =>
      apiFetch<Review[]>(`/listings/${id}/reviews`, { signal }),
    /** "Similar Listings" (CONTEXT.md): same-category, nearest by content embedding. */
    similar: (id: string, signal?: AbortSignal) =>
      apiFetch<ListingSummary[]>(`/listings/${id}/similar`, { signal }),
    submitReview: (id: string, body: { rating: number; text: string }) =>
      apiFetch<Review>(`/listings/${id}/reviews`, { method: "POST", body }),
    submitEnquiry: (
      id: string,
      body: { name: string; email: string; phone?: string; message: string },
    ) => apiFetch<Enquiry>(`/listings/${id}/enquiries`, { method: "POST", body }),
    favorite: (id: string) => apiFetch<void>(`/listings/${id}/favorite`, { method: "POST" }),
    unfavorite: (id: string) => apiFetch<void>(`/listings/${id}/favorite`, { method: "DELETE" }),
    /** Fire-and-forget: called once the contact-info gate actually shows real
     * values to a signed-in visitor on a Listing's detail page (issue #15). */
    logContactReveal: (id: string) =>
      apiFetch<void>(`/listings/${id}/contact-reveal`, { method: "POST" }),
    /** Fire-and-forget: called once per mount of a Listing's detail page, for
     * anonymous-friendly View tracking (issue #16). Works whether or not the
     * visitor is signed in — the backend mints/reads its own visitor_id cookie. */
    logView: (id: string) => apiFetch<void>(`/listings/${id}/view`, { method: "POST" }),
  },

  businesses: {
    /** Public once approved; 401/403 before that (Phase 10). */
    byId: (id: string, signal?: AbortSignal) => apiFetch<Business>(`/businesses/${id}`, { signal }),
  },

  marketing: {
    /**
     * FR14's featured section. Returns join-table rows — listingId, dates, sort
     * order — not the Listings, so a caller still has to fetch each one. Worth
     * revisiting: embedding a ListingSummary here would make the home page's
     * featured strip one request instead of one-plus-N, which is exactly the
     * change ListingSummary itself got in Phase 10.
     */
    featuredListings: (signal?: AbortSignal) =>
      apiFetch<Schemas["FeaturedListing"][]>("/featured-listings", { signal }),
  },

  /**
   * The home page's per-category Featured shelves (issue #19, #15) —
   * precomputed by the daily ranking job, not aggregated live. Full
   * ListingSummary data per item (flagged sponsored), one request for all
   * four sections: the exact N+1 fix marketing.featuredListings' own comment
   * above flags as worth doing. Not yet wired into the home page — that's
   * issue #20, which also removes the old flat "Featured in Yercaud" section.
   */
  featured: {
    sections: (signal?: AbortSignal) =>
      apiFetch<Schemas["FeaturedSections"]>("/featured-sections", { signal }),
  },

  taxonomies: {
    categories: (signal?: AbortSignal) => apiFetch<Category[]>("/categories", { signal }),
    locations: (signal?: AbortSignal) => apiFetch<Location[]>("/locations", { signal }),
    priceBands: (signal?: AbortSignal) => apiFetch<PriceBand[]>("/price-bands", { signal }),
    amenities: (signal?: AbortSignal) =>
      apiFetch<Schemas["NamedLookup"][]>("/amenities", { signal }),
    /** Hotel-only (ADR 0003): the category-page filter sidebar's Property Type section. */
    propertyTypes: (signal?: AbortSignal) =>
      apiFetch<Schemas["NamedLookup"][]>("/property-types", { signal }),
    badges: (signal?: AbortSignal) => apiFetch<Badge[]>("/badges", { signal }),
    languages: (signal?: AbortSignal) =>
      apiFetch<Schemas["NamedLookup"][]>("/languages", { signal }),
  },

  auth: {
    me: (signal?: AbortSignal) => apiFetch<CurrentUser>("/auth/me", { signal }),
    login: (body: { email: string; password: string }) =>
      apiFetch<CurrentUser>("/auth/login", { method: "POST", body }),
    register: (body: { name: string; email: string; password: string }) =>
      apiFetch<CurrentUser>("/auth/register", { method: "POST", body }),
    logout: () => apiFetch<void>("/auth/logout", { method: "POST" }),
    requestPasswordReset: (body: { email: string }) =>
      apiFetch<void>("/auth/password-reset/request", { method: "POST", body }),
    confirmPasswordReset: (body: { token: string; password: string }) =>
      apiFetch<void>("/auth/password-reset/confirm", { method: "POST", body }),
  },

  me: {
    /** The one thing /me could not do before Phase 10. */
    updateProfile: (body: Schemas["OwnProfileInput"]) =>
      apiFetch<CurrentUser>("/me", { method: "PATCH", body }),
    /** Live-typing check (issue #14) — advisory ahead of PATCH /me's own validation. */
    usernameAvailable: (username: string, signal?: AbortSignal) =>
      apiFetch<{ available: boolean }>("/me/username-available", { query: { username }, signal }),
    /** Real upload (issue #14): multipart, so it bypasses apiFetch's JSON body handling. */
    uploadAvatar: async (file: File): Promise<CurrentUser> => {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(buildUrl("/me/avatar"), {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const text = await response.text();
      const parsed = text ? (JSON.parse(text) as unknown) : undefined;
      if (!response.ok) {
        const message =
          parsed && typeof parsed === "object" && "message" in parsed
            ? String((parsed as { message: unknown }).message)
            : `Request failed with ${response.status}`;
        throw new ApiError(response.status, message);
      }
      return parsed as CurrentUser;
    },
    favorites: (signal?: AbortSignal) => apiFetch<ListingSummary[]>("/me/favorites", { signal }),
    enquiries: (signal?: AbortSignal) => apiFetch<Enquiry[]>("/me/enquiries", { signal }),
    reviews: (signal?: AbortSignal) => apiFetch<Review[]>("/me/reviews", { signal }),
    stats: (signal?: AbortSignal) =>
      apiFetch<{ enquiries: number; reviews: number; favorites: number; listings: number }>(
        "/me/stats",
        { signal },
      ),
    changePassword: (body: { currentPassword?: string; newPassword: string }) =>
      apiFetch<void>("/me/password", { method: "POST", body }),
    deleteAccount: (userId: string) => apiFetch<void>(`/users/${userId}`, { method: "DELETE" }),
  },

  blog: {
    posts: (
      params: { category?: string; q?: string; page?: number; pageSize?: number } = {},
      signal?: AbortSignal,
    ) => apiFetch<Paged<BlogPostSummary>>("/blog-posts", { query: params, signal }),
    post: (id: string, signal?: AbortSignal) => apiFetch<BlogPost>(`/blog-posts/${id}`, { signal }),
    categories: (signal?: AbortSignal) => apiFetch<BlogCategory[]>("/blog-categories", { signal }),
    comments: (postId: string, signal?: AbortSignal) =>
      apiFetch<Schemas["BlogComment"][]>(`/blog-posts/${postId}/comments`, { signal }),
    comment: (postId: string, body: { body: string }) =>
      apiFetch<Schemas["BlogComment"]>(`/blog-posts/${postId}/comments`, { method: "POST", body }),
    rate: (postId: string, body: { rating: number }) =>
      apiFetch<void>(`/blog-posts/${postId}/rating`, { method: "PUT", body }),
    /** Fire-and-forget: for anonymous-friendly View tracking (issue #18), same
     * shape as listings.logView. Not yet called anywhere — like `rate` above,
     * the Blog Post detail page (`routes/blog.$slug.tsx`) still renders from
     * mock data (see its MockBadge notes), so there's no real Blog Post id to
     * fire this with yet. Wire it in once that page consumes real data. */
    logView: (id: string) => apiFetch<void>(`/blog-posts/${id}/view`, { method: "POST" }),
  },

  content: {
    blocks: (pageSlug: string, signal?: AbortSignal) =>
      apiFetch<ContentBlock[]>(`/content-blocks/${pageSlug}`, { signal }),
    faqs: (signal?: AbortSignal) => apiFetch<Faq[]>("/faqs", { signal }),
    faqCategories: (signal?: AbortSignal) => apiFetch<FaqCategory[]>("/faq-categories", { signal }),
    subscribe: (body: { email: string; source?: string }) =>
      apiFetch<void>("/newsletter/subscribe", { method: "POST", body }),
    sendMessage: (body: {
      name: string;
      email: string;
      subject: string;
      phone?: string;
      message: string;
      consented: boolean;
    }) => apiFetch<void>("/contact-messages", { method: "POST", body }),
  },

  /** Real counts for the home page's bottom stat tiles — replaces the old hardcoded mock numbers. */
  platformStats: (signal?: AbortSignal) =>
    apiFetch<Schemas["PlatformStats"]>("/platform-stats", { signal }),
};
