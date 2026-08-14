import type { components } from "./api-schema";

/**
 * The Admin panel's API client.
 *
 * Types are generated from backend/openapi.yaml via `npm run api:types` — never
 * hand-written, so they can't drift. The wrapper below is duplicated from the
 * public site rather than shared: the two apps build as separate containers to
 * separate subdomains, and a shared package would drag both Docker build
 * contexts up to the repo root for the sake of ~50 lines.
 *
 * Unlike the public site, this app fetches only in the browser. Every page here
 * is behind a login and must never be indexed, so server-rendering the data
 * would buy nothing and cost cookie-forwarding on every call.
 */

export type Schemas = components["schemas"];

export type CurrentUser = Schemas["CurrentUser"];
export type Permission = Schemas["Permission"];
export type User = Schemas["User"];
export type Role = Schemas["Role"];
export type Business = Schemas["Business"];
export type Listing = Schemas["Listing"];
export type ListingSummary = Schemas["ListingSummary"];
export type Category = Schemas["Category"];
export type NamedLookup = Schemas["NamedLookup"];
export type PriceBand = Schemas["PriceBand"];
export type PriceUnit = Schemas["PriceUnit"];
export type Badge = Schemas["Badge"];
export type Review = Schemas["Review"];
export type Enquiry = Schemas["Enquiry"];
export type ContactMessage = Schemas["ContactMessage"];
export type ApprovalQueueItem = Schemas["ApprovalQueueItem"];
export type DashboardKpis = Schemas["DashboardKpis"];
export type AuditLogEntry = Schemas["AuditLogEntry"];
export type BlogPostSummary = Schemas["BlogPostSummary"];
export type NewsletterSubscriber = Schemas["NewsletterSubscriber"];

const API_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
/** The public site's origin — used only by the Blog "Preview" action to open a post's live URL. */
export const PUBLIC_SITE_URL = import.meta.env.VITE_PUBLIC_SITE_URL ?? "http://localhost:5173";

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
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(path.replace(/^\//, ""), `${API_URL.replace(/\/$/, "")}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
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
    // The session is an httpOnly cookie. Admin and the API share a registrable
    // domain, so SameSite=Lax carries it across the subdomain boundary.
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

export interface Paged<T> {
  items: T[];
  total: number;
}

/**
 * Multipart upload — separate from apiFetch because a FormData body must
 * NOT be JSON.stringify'd or given a content-type header (the browser sets
 * the multipart boundary itself). Response handling mirrors apiFetch.
 */
async function apiUpload<T>(path: string, file: File): Promise<T> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(buildUrl(path), { method: "POST", body: formData, credentials: "include" });
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

export const api = {
  auth: {
    me: (signal?: AbortSignal) => apiFetch<CurrentUser>("/auth/me", { signal }),
    login: (body: { email: string; password: string }) => apiFetch<CurrentUser>("/auth/login", { method: "POST", body }),
    logout: () => apiFetch<void>("/auth/logout", { method: "POST" }),
    /** FR160 — ends the "view as" session and restores the admin's own. */
    exitImpersonation: () => apiFetch<CurrentUser>("/auth/exit-impersonation", { method: "POST" }),
  },

  admin: {
    dashboard: (signal?: AbortSignal) => apiFetch<DashboardKpis>("/admin/dashboard", { signal }),
    approvalQueue: (signal?: AbortSignal) => apiFetch<ApprovalQueueItem[]>("/admin/approval-queue", { signal }),
    // A bare array, not Paged — the contract returns items without a total.
    auditLogs: (query: { tableName?: string; recordId?: string; page?: number; pageSize?: number } = {}, signal?: AbortSignal) =>
      apiFetch<AuditLogEntry[]>("/audit-logs", { query, signal }),
  },

  users: {
    list: (query: { q?: string; status?: string } = {}, signal?: AbortSignal) => apiFetch<User[]>("/users", { query, signal }),
    setRoles: (userId: string, roleIds: string[]) => apiFetch<void>(`/users/${userId}/roles`, { method: "PUT", body: { roleIds } }),
    setStatus: (userId: string, status: "active" | "suspended") =>
      apiFetch<User>(`/users/${userId}`, { method: "PATCH", body: { status } }),
    /** FR160's "view as" — starts an impersonation session. */
    impersonate: (userId: string) => apiFetch<CurrentUser>(`/users/${userId}/impersonate`, { method: "POST" }),
  },

  roles: {
    list: (signal?: AbortSignal) => apiFetch<Role[]>("/roles", { signal }),
    create: (name: string) => apiFetch<Role>("/roles", { method: "POST", body: { name } }),
    setPermissions: (roleId: string, permissions: Permission[]) =>
      // A bare array, not { permissions } — the contract's shape.
      apiFetch<void>(`/roles/${roleId}/permissions`, { method: "PUT", body: permissions }),
  },

  businesses: {
    list: (query: { status?: string } = {}, signal?: AbortSignal) => apiFetch<Business[]>("/businesses", { query, signal }),
    byId: (id: string, signal?: AbortSignal) => apiFetch<Business>(`/businesses/${id}`, { signal }),
    update: (id: string, body: Schemas["BusinessInput"]) => apiFetch<Business>(`/businesses/${id}`, { method: "PATCH", body }),
    staff: (businessId: string, signal?: AbortSignal) =>
      apiFetch<Schemas["BusinessStaff"][]>(`/businesses/${businessId}/staff`, { signal }),
    inviteStaff: (businessId: string, email: string, permissions: Record<string, boolean>) =>
      apiFetch<Schemas["BusinessStaff"]>(`/businesses/${businessId}/staff`, { method: "POST", body: { email, permissions } }),
    updateStaff: (businessId: string, staffId: string, body: { status?: string; permissions?: Record<string, boolean> }) =>
      apiFetch<Schemas["BusinessStaff"]>(`/businesses/${businessId}/staff/${staffId}`, { method: "PATCH", body }),
    revokeStaff: (businessId: string, staffId: string) =>
      apiFetch<void>(`/businesses/${businessId}/staff/${staffId}`, { method: "DELETE" }),
    approve: (id: string) => apiFetch<Business>(`/businesses/${id}/approve`, { method: "POST" }),
    reject: (id: string, reason: string) => apiFetch<Business>(`/businesses/${id}/reject`, { method: "POST", body: { reason } }),
    suspend: (id: string) => apiFetch<Business>(`/businesses/${id}/suspend`, { method: "POST" }),
    archive: (id: string) => apiFetch<Business>(`/businesses/${id}/archive`, { method: "POST" }),
  },

  listings: {
    search: (query: Record<string, string | number | undefined> = {}, signal?: AbortSignal) =>
      apiFetch<Paged<ListingSummary>>("/listings", { query, signal }),
    byId: (id: string, signal?: AbortSignal) => apiFetch<Listing>(`/listings/${id}`, { signal }),
    approve: (id: string) => apiFetch<Listing>(`/listings/${id}/approve`, { method: "POST" }),
    reject: (id: string, reason: string) => apiFetch<Listing>(`/listings/${id}/reject`, { method: "POST", body: { reason } }),
    /** FR30 — Marketing:edit, which Business Owners don't hold. */
    setBadge: (id: string, badgeId: string | null) => apiFetch<Listing>(`/listings/${id}/badge`, { method: "PUT", body: { badgeId } }),
    /** Owner-or-Listings:edit gated (issue #24) — what's driving this Listing's Featured eligibility. */
    stats: (id: string, signal?: AbortSignal) => apiFetch<Schemas["ListingStats"]>(`/listings/${id}/stats`, { signal }),
    hotelDetails: (id: string, signal?: AbortSignal) =>
      apiFetch<Schemas["HotelDetails"]>(`/listings/${id}/hotel-details`, { signal }),
    /** Full-replace on write (same convention as updateListing) — callers must send every field back, not just the changed one. */
    setHotelDetails: (id: string, body: Schemas["HotelDetailsInput"]) =>
      apiFetch<Schemas["HotelDetails"]>(`/listings/${id}/hotel-details`, { method: "PUT", body }),
  },

  reviews: {
    list: (query: { status?: string } = {}, signal?: AbortSignal) => apiFetch<Review[]>("/reviews", { query, signal }),
    approve: (id: string) => apiFetch<Review>(`/reviews/${id}/approve`, { method: "POST" }),
    reject: (id: string) => apiFetch<Review>(`/reviews/${id}/reject`, { method: "POST" }),
  },

  enquiries: {
    list: (query: { status?: string } = {}, signal?: AbortSignal) => apiFetch<Enquiry[]>("/enquiries", { query, signal }),
    respond: (id: string, response: string) => apiFetch<Enquiry>(`/enquiries/${id}/respond`, { method: "POST", body: { response } }),
    setStatus: (id: string, status: string) => apiFetch<Enquiry>(`/enquiries/${id}/status`, { method: "PATCH", body: { status } }),
  },

  content: {
    contactMessages: (query: { status?: string } = {}, signal?: AbortSignal) =>
      apiFetch<ContactMessage[]>("/contact-messages", { query, signal }),
    setContactMessageStatus: (id: string, status: string) =>
      apiFetch<ContactMessage>(`/contact-messages/${id}/status`, { method: "PATCH", body: { status } }),
    subscribers: (query: { search?: string; status?: string } = {}, signal?: AbortSignal) =>
      apiFetch<NewsletterSubscriber[]>("/newsletter/subscribers", { query, signal }),
    blocks: (pageSlug: string, signal?: AbortSignal) => apiFetch<Schemas["ContentBlock"][]>(`/content-blocks/${pageSlug}`, { signal }),
    upsertBlock: (pageSlug: string, blockKey: string, content: Record<string, unknown>) =>
      apiFetch<Schemas["ContentBlock"]>(`/content-blocks/${pageSlug}/${blockKey}`, { method: "PUT", body: { content } }),
  },

  taxonomies: {
    categories: (signal?: AbortSignal) => apiFetch<Category[]>("/categories", { signal }),
    createCategory: (body: Schemas["CategoryInput"]) => apiFetch<Category>("/categories", { method: "POST", body }),
    updateCategory: (id: string, body: Schemas["CategoryInput"]) => apiFetch<Category>(`/categories/${id}`, { method: "PATCH", body }),
    deleteCategory: (id: string) => apiFetch<void>(`/categories/${id}`, { method: "DELETE" }),
    locations: (signal?: AbortSignal) => apiFetch<NamedLookup[]>("/locations", { signal }),
    createLocation: (name: string) => apiFetch<NamedLookup>("/locations", { method: "POST", body: { name } }),
    updateLocation: (id: string, name: string) => apiFetch<NamedLookup>(`/locations/${id}`, { method: "PATCH", body: { name } }),
    deleteLocation: (id: string) => apiFetch<void>(`/locations/${id}`, { method: "DELETE" }),
    priceBands: (signal?: AbortSignal) => apiFetch<PriceBand[]>("/price-bands", { signal }),
    propertyTypes: (signal?: AbortSignal) => apiFetch<NamedLookup[]>("/property-types", { signal }),
    badges: (signal?: AbortSignal) => apiFetch<Badge[]>("/badges", { signal }),
    createBadge: (body: Schemas["BadgeInput"]) => apiFetch<Badge>("/badges", { method: "POST", body }),
    updateBadge: (id: string, body: Schemas["BadgeInput"]) => apiFetch<Badge>(`/badges/${id}`, { method: "PATCH", body }),
    deleteBadge: (id: string) => apiFetch<void>(`/badges/${id}`, { method: "DELETE" }),
  },

  blog: {
    categories: (signal?: AbortSignal) => apiFetch<NamedLookup[]>("/blog-categories", { signal }),
    createCategory: (name: string) => apiFetch<NamedLookup>("/blog-categories", { method: "POST", body: { name } }),
    updateCategory: (id: string, name: string) => apiFetch<NamedLookup>(`/blog-categories/${id}`, { method: "PATCH", body: { name } }),
    deleteCategory: (id: string) => apiFetch<void>(`/blog-categories/${id}`, { method: "DELETE" }),
    /** Returns a bare array, not a Paged<T> — GET /blog-posts has no total count (openapi.yaml). */
    posts: (query: { status?: string; page?: number; pageSize?: number } = {}, signal?: AbortSignal) =>
      apiFetch<BlogPostSummary[]>("/blog-posts", { query, signal }),
    post: (id: string, signal?: AbortSignal) => apiFetch<Schemas["BlogPost"]>(`/blog-posts/${id}`, { signal }),
    createPost: (body: Schemas["BlogPostInput"]) => apiFetch<Schemas["BlogPost"]>("/blog-posts", { method: "POST", body }),
    updatePost: (id: string, body: Schemas["BlogPostUpdate"]) => apiFetch<Schemas["BlogPost"]>(`/blog-posts/${id}`, { method: "PATCH", body }),
    deletePost: (id: string) => apiFetch<void>(`/blog-posts/${id}`, { method: "DELETE" }),
    publishPost: (id: string) => apiFetch<Schemas["BlogPost"]>(`/blog-posts/${id}/publish`, { method: "POST" }),
    duplicatePost: (id: string) => apiFetch<Schemas["BlogPost"]>(`/blog-posts/${id}/duplicate`, { method: "POST" }),
    uploadCoverImage: (id: string, file: File) => apiUpload<Schemas["BlogPost"]>(`/blog-posts/${id}/cover-image`, file),
    uploadSocialImage: (id: string, file: File) => apiUpload<Schemas["BlogPost"]>(`/blog-posts/${id}/social-image`, file),
    comments: (query: { status?: string } = {}, signal?: AbortSignal) => apiFetch<Schemas["BlogComment"][]>("/blog-comments", { query, signal }),
    approveComment: (id: string) => apiFetch<void>(`/blog-comments/${id}/approve`, { method: "POST" }),
    rejectComment: (id: string) => apiFetch<void>(`/blog-comments/${id}/reject`, { method: "POST" }),
  },

  faq: {
    categories: (signal?: AbortSignal) => apiFetch<Schemas["FaqCategory"][]>("/faq-categories", { signal }),
    createCategory: (body: Schemas["FaqCategoryInput"]) => apiFetch<Schemas["FaqCategory"]>("/faq-categories", { method: "POST", body }),
    updateCategory: (id: string, body: Schemas["FaqCategoryUpdate"]) =>
      apiFetch<Schemas["FaqCategory"]>(`/faq-categories/${id}`, { method: "PATCH", body }),
    deleteCategory: (id: string) => apiFetch<void>(`/faq-categories/${id}`, { method: "DELETE" }),
    list: (signal?: AbortSignal) => apiFetch<Schemas["Faq"][]>("/faqs", { signal }),
    create: (body: Schemas["FaqInput"]) => apiFetch<Schemas["Faq"]>("/faqs", { method: "POST", body }),
    update: (id: string, body: Schemas["FaqUpdate"]) => apiFetch<Schemas["Faq"]>(`/faqs/${id}`, { method: "PATCH", body }),
    remove: (id: string) => apiFetch<void>(`/faqs/${id}`, { method: "DELETE" }),
  },

  marketing: {
    promotions: (signal?: AbortSignal) => apiFetch<Schemas["Promotion"][]>("/promotions", { signal }),
    createPromotion: (body: Schemas["PromotionInput"]) => apiFetch<Schemas["Promotion"]>("/promotions", { method: "POST", body }),
    updatePromotion: (id: string, body: Schemas["PromotionUpdate"]) =>
      apiFetch<Schemas["Promotion"]>(`/promotions/${id}`, { method: "PATCH", body }),
    deletePromotion: (id: string) => apiFetch<void>(`/promotions/${id}`, { method: "DELETE" }),
    featuredListings: (signal?: AbortSignal) => apiFetch<Schemas["FeaturedListing"][]>("/featured-listings", { signal }),
    createFeatured: (body: Schemas["FeaturedListingInput"]) =>
      apiFetch<Schemas["FeaturedListing"]>("/featured-listings", { method: "POST", body }),
    updateFeatured: (id: string, body: Schemas["FeaturedListingUpdate"]) =>
      apiFetch<Schemas["FeaturedListing"]>(`/featured-listings/${id}`, { method: "PATCH", body }),
    deleteFeatured: (id: string) => apiFetch<void>(`/featured-listings/${id}`, { method: "DELETE" }),
    banners: (signal?: AbortSignal) => apiFetch<Schemas["Banner"][]>("/banners", { signal }),
    createBanner: (body: Schemas["BannerInput"]) => apiFetch<Schemas["Banner"]>("/banners", { method: "POST", body }),
    updateBanner: (id: string, body: Schemas["BannerUpdate"]) => apiFetch<Schemas["Banner"]>(`/banners/${id}`, { method: "PATCH", body }),
    deleteBanner: (id: string) => apiFetch<void>(`/banners/${id}`, { method: "DELETE" }),
  },
};
