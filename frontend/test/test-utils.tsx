import { vi } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  ActivityDetails as ActivityDetailsData,
  Business,
  Category,
  CurrentUser,
  HotelDetails as HotelDetailsData,
  Listing,
  ListingSummary,
  RestaurantDetails as RestaurantDetailsData,
  Review,
  TourDetails as TourDetailsData,
} from "@/lib/api";
import type { ListingDetail } from "@/lib/listing-detail";

/**
 * Shared test scaffolding for `test/components/*.test.tsx` (issue: component
 * test coverage). `vi.mock` calls are hoisted per-file by Vitest's transform,
 * so they can't be issued from here on another file's behalf — every test
 * file still writes its own `vi.mock(...)`. What's shared instead is
 * everything that mock needs: stub implementations, mutable mock state, and
 * fixture builders, so no two files reinvent the same `Link` stub or
 * `ListingDetail` shape.
 */

// ---------------------------------------------------------------------------
// react-query
// ---------------------------------------------------------------------------

/**
 * Wraps `ui` in a fresh QueryClient — mutations don't retry, so a rejected
 * mutation's `onError` fires on the first attempt instead of after backoff.
 *
 * `rerender` is overridden to re-wrap whatever's passed to it in the same
 * QueryClientProvider — Testing Library's own `rerender` replaces the whole
 * rendered tree with exactly what you give it, so calling it with a bare,
 * unwrapped element would tear out the QueryClientProvider and break any
 * react-query hook still mounted underneath.
 */
export function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const result = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  return {
    queryClient,
    ...result,
    rerender: (nextUi: React.ReactElement) =>
      result.rerender(<QueryClientProvider client={queryClient}>{nextUi}</QueryClientProvider>),
  };
}

// ---------------------------------------------------------------------------
// @tanstack/react-router — stub pieces for each file's own vi.mock(...) call.
//
// vi.mock's factory can run before this file's own other imports have
// settled (Vitest hoists the vi.mock call itself, but not the timing of when
// the factory is actually invoked against the rest of the module graph) — so
// every stub below must be referenced through a fresh wrapper function
// inside the factory, never assigned directly, or it'll throw "Cannot access
// '<binding>' before initialization". `useNavigate: () => navigateSpy` is
// already safe as written (nested one level); `Link`/`useRouterState` need
// the same one-level wrap:
//
//   import { LinkStub, navigateSpy, routerStateStub } from "../test-utils";
//   vi.mock("@tanstack/react-router", () => ({
//     Link: (props: Parameters<typeof LinkStub>[0]) => LinkStub(props),
//     useNavigate: () => navigateSpy,
//     useRouterState: (opts: Parameters<typeof routerStateStub>[0]) => routerStateStub(opts),
//     createFileRoute: () => (options: unknown) => options,
//   }));
// ---------------------------------------------------------------------------

/** A plain anchor standing in for TanStack Router's `<Link>` — enough to
 * assert `href`/children, not enough to actually navigate. */
export function LinkStub({
  children,
  to,
}: {
  children?: React.ReactNode;
  to?: string;
  search?: unknown;
}) {
  return <a href={to}>{children}</a>;
}

/** Reset in each file's `beforeEach` — a fresh module registry per test file
 * means this is never shared across files, only across tests within one. */
export const navigateSpy = vi.fn();

/** Stands in for `useRouterState({ select })` — components that read the
 * current location (e.g. ContactGate's redirect-back link) call `select`
 * against this fixed fake location. */
export function routerStateStub<T>(opts?: {
  select?: (state: { location: { href: string; pathname: string } }) => T;
}) {
  const state = {
    location: { href: "http://localhost:3000/current-page", pathname: "/current-page" },
  };
  return (opts?.select ? opts.select(state) : state) as T;
}

// ---------------------------------------------------------------------------
// @/lib/auth — mutable state each file's own vi.mock(...) call points at.
// e.g.:
//   import { authState, resetAuthState } from "../test-utils";
//   vi.mock("@/lib/auth", () => ({
//     CURRENT_USER_KEY: ["auth", "me"],
//     useAuth: () => authState,
//   }));
//   beforeEach(() => resetAuthState());
// ---------------------------------------------------------------------------

export const authState: { user: CurrentUser | null; isSignedIn: boolean } = {
  user: null,
  isSignedIn: false,
};

export function resetAuthState() {
  authState.user = null;
  authState.isSignedIn = false;
}

/** Signs `authState` in as `user` (or `baseCurrentUser` if none given). */
export function signIn(user: CurrentUser = baseCurrentUser) {
  authState.user = user;
  authState.isSignedIn = true;
}

// ---------------------------------------------------------------------------
// Fixtures — each a minimal base object; override only what a given test
// cares about via `{ ...base, field: value }`, the same style
// `test/profile-edit.test.tsx` uses for `baseUser`.
// ---------------------------------------------------------------------------

export const baseCurrentUser: CurrentUser = {
  id: "user-1",
  email: "asha@example.com",
  name: "Asha R",
  username: "asha_r",
  phone: null,
  avatarUrl: null,
  bio: null,
  dateOfBirth: null,
  gender: null,
  status: "active",
  roles: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  emailVerifiedAt: "2026-01-01T00:00:00.000Z",
  hasPassword: true,
  permissions: [],
  impersonatedBy: null,
};

export const baseCategory: Category = {
  id: "cat-hotel",
  name: "Hotel",
  slug: "hotel",
  icon: null,
  color: "#1E7A46",
  hasDetailTable: true,
  sortOrder: 1,
};

export const baseBusiness: Business = {
  id: "business-1",
  ownerId: "user-1",
  name: "Grand Palace Hotel",
  description: "A hillside stay near the lake.",
  contactPhone: "+91 98765 43210",
  contactEmail: "contact@grandpalace.example",
  website: "https://grandpalace.example",
  address: "Near Lake, Yercaud",
  socialLinks: {},
  logoUrl: null,
  coverUrl: null,
  status: "approved",
  createdAt: "2026-01-01T00:00:00.000Z",
};

export const baseListingSummary: ListingSummary = {
  id: "listing-1",
  businessId: "business-1",
  categoryId: "cat-hotel",
  locationId: "location-1",
  name: "Grand Palace Hotel",
  slug: "grand-palace-hotel",
  status: "approved",
  primaryImageUrl: "https://images.example/grand-palace.jpg",
  averageRating: 4.5,
  priceFrom: 3500,
  priceUnit: "per_night",
  badge: null,
  categoryName: "Hotel",
  categorySlug: "hotel",
  locationName: "Near Lake",
  reviewCount: 12,
  tags: ["Popular"],
  phone: "+91 98765 43210",
  website: "https://grandpalace.example",
};

export const baseListing: Listing = {
  ...baseListingSummary,
  description: "A hillside stay near the lake, with a pool and mountain views.",
  seoTitle: null,
  seoDescription: null,
  ogImage: null,
  twitterCard: null,
  rejectionReason: null,
  firstPublishedAt: "2026-01-01T00:00:00.000Z",
  images: [],
  amenityIds: [],
  tagIds: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

export const baseReview: Review = {
  id: "review-1",
  listingId: "listing-1",
  userId: "user-2",
  rating: 5,
  text: "Wonderful stay, would come back.",
  status: "approved",
  createdAt: "2026-01-02T00:00:00.000Z",
  authorName: "Priya K",
  authorUsername: "priya_k",
};

export function makeListingDetail(overrides: Partial<ListingDetail> = {}): ListingDetail {
  return {
    listing: baseListing,
    category: baseCategory,
    business: baseBusiness,
    reviews: [baseReview],
    amenities: ["Wifi", "Parking", "Air Conditioning"],
    similarListings: [],
    ...overrides,
  };
}

export function makeHotelDetails(overrides: Partial<HotelDetailsData> = {}): HotelDetailsData {
  return {
    propertyTypeId: "property-type-1",
    starRating: 4,
    checkInTime: "12:00",
    checkOutTime: "10:00",
    guestsCapacityNote: "Up to 4 guests per room",
    cancellationPolicy: "Free cancellation up to 48 hours before check-in.",
    languageIds: [],
    rooms: [
      {
        id: "room-1",
        name: "Deluxe Room",
        description: "Lake-facing, king bed",
        ratePerNight: 3500,
        quantityAvailable: 2,
        sortOrder: 1,
      },
      {
        id: "room-2",
        name: "Standard Room",
        description: "Garden view, twin beds",
        ratePerNight: 2500,
        quantityAvailable: 3,
        sortOrder: 2,
      },
    ],
    availabilityBlocks: [],
    ...overrides,
  };
}

export function makeRestaurantDetails(
  overrides: Partial<RestaurantDetailsData> = {},
): RestaurantDetailsData {
  return {
    cuisineType: "Multi Cuisine",
    avgCostForTwo: 800,
    bestFor: "Family dining",
    openingHours: [
      { dayOfWeek: 1, openTime: "09:00", closeTime: "22:00", isClosed: false },
      { dayOfWeek: 2, openTime: "09:00", closeTime: "22:00", isClosed: false },
      { dayOfWeek: 3, openTime: null, closeTime: null, isClosed: true },
    ],
    menuItems: [
      { id: "menu-1", name: "Chettinad Chicken", price: 320, imageUrl: null, sortOrder: 1 },
      { id: "menu-2", name: "Filter Coffee", price: 60, imageUrl: null, sortOrder: 2 },
    ],
    ...overrides,
  };
}

export function makeActivityDetails(
  overrides: Partial<ActivityDetailsData> = {},
): ActivityDetailsData {
  return {
    duration: "4 hours",
    maxHeight: null,
    totalDistance: "6 km",
    difficultyLevel: "Moderate",
    pricePerPerson: 1200,
    itinerarySteps: [],
    inclusions: [
      { id: "inclusion-1", item: "Safety gear", isIncluded: true },
      { id: "inclusion-2", item: "Meals", isIncluded: false },
    ],
    ...overrides,
  };
}

export function makeTourDetails(overrides: Partial<TourDetailsData> = {}): TourDetailsData {
  return {
    tourType: "Sightseeing",
    bestFor: "Families and first-time visitors",
    duration: "Full day",
    pricePerPerson: 2499,
    languageIds: [],
    itinerarySteps: [
      {
        id: "step-1",
        stepOrder: 1,
        title: "Pickup",
        description: "Hotel pickup",
        duration: "30 mins",
        stepType: "pickup",
      },
      {
        id: "step-2",
        stepOrder: 2,
        title: "Botanical Garden",
        description: "Guided walk",
        duration: "1 hour",
        stepType: "stop",
      },
    ],
    inclusions: [{ id: "inclusion-1", item: "Guide", isIncluded: true }],
    attractions: [{ id: "attraction-1", name: "Lady's Seat" }],
    ...overrides,
  };
}
