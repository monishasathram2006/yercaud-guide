import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { ActivityDetails } from "@/components/ActivityDetails";
import {
  authState,
  resetAuthState,
  signIn,
  renderWithClient,
  LinkStub,
  makeListingDetail,
  makeActivityDetails,
} from "../test-utils";

/**
 * The Activity category's detail page — the duration/difficulty/distance/
 * height facts row, the included/excluded inclusions split, and the
 * favorite toggle. Header, Footer, EnquiryForm, and DetailBlocks' heavier
 * pieces are stubbed the same way as HotelDetails/RestaurantDetails'
 * test files; `Card` is left real.
 */
vi.mock("@tanstack/react-router", () => ({
  Link: (props: Parameters<typeof LinkStub>[0]) => LinkStub(props),
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => authState }));
vi.mock("@/components/Header", () => ({ Header: () => <div data-testid="header-stub" /> }));
vi.mock("@/components/Footer", () => ({ Footer: () => <div data-testid="footer-stub" /> }));
vi.mock("@/components/EnquiryForm", () => ({
  EnquiryForm: () => <div data-testid="enquiry-form-stub" />,
}));
vi.mock("@/components/DetailBlocks", async () => {
  const actual = await vi.importActual<typeof import("@/components/DetailBlocks")>(
    "@/components/DetailBlocks",
  );
  return {
    ...actual,
    ContactCard: () => <div data-testid="contact-card-stub" />,
    LocationBlock: () => <div data-testid="location-block-stub" />,
    ReviewsBlock: () => <div data-testid="reviews-block-stub" />,
    SimilarListingsSection: () => <div data-testid="similar-listings-stub" />,
  };
});

const toggleFavoriteMutate = vi.fn();
let isFavoriteState = false;
vi.mock("@/lib/favorites", () => ({
  useIsFavorite: () => isFavoriteState,
  useToggleFavorite: () => ({ mutate: toggleFavoriteMutate, isPending: false }),
}));

const activityListingDetail = makeListingDetail({
  listing: { ...makeListingDetail().listing, priceFrom: 1200, priceUnit: "per_person" },
});

beforeEach(() => {
  resetAuthState();
  toggleFavoriteMutate.mockReset();
  isFavoriteState = false;
});

describe("ActivityDetails — facts row", () => {
  it("shows duration, difficulty and distance when set", () => {
    renderWithClient(
      <ActivityDetails
        detail={activityListingDetail}
        activity={makeActivityDetails({
          duration: "4 hours",
          difficultyLevel: "Moderate",
          totalDistance: "6 km",
        })}
      />,
    );

    expect(screen.getByText("4 hours")).toBeInTheDocument();
    expect(screen.getByText("Moderate")).toBeInTheDocument();
    expect(screen.getByText("6 km")).toBeInTheDocument();
    expect(screen.getByText("Duration")).toBeInTheDocument();
    expect(screen.getByText("Difficulty")).toBeInTheDocument();
  });

  it("omits a fact that's null rather than showing a blank tile", () => {
    renderWithClient(
      <ActivityDetails
        detail={activityListingDetail}
        activity={makeActivityDetails({ maxHeight: null })}
      />,
    );
    expect(screen.queryByText("Max height")).not.toBeInTheDocument();
  });

  it("shows the per-person price", () => {
    renderWithClient(
      <ActivityDetails detail={activityListingDetail} activity={makeActivityDetails()} />,
    );
    expect(screen.getByText("₹1,200/person")).toBeInTheDocument();
  });
});

describe("ActivityDetails — inclusions", () => {
  it("splits inclusions into an included list and an excluded list", () => {
    renderWithClient(
      <ActivityDetails
        detail={activityListingDetail}
        activity={makeActivityDetails({
          inclusions: [
            { id: "i1", item: "Safety gear", isIncluded: true },
            { id: "i2", item: "Meals", isIncluded: false },
          ],
        })}
      />,
    );

    expect(screen.getByText("Safety gear")).toBeInTheDocument();
    expect(screen.getByText("Meals")).toBeInTheDocument();
  });

  it("renders no What's Included card when there are no inclusions", () => {
    renderWithClient(
      <ActivityDetails
        detail={activityListingDetail}
        activity={makeActivityDetails({ inclusions: [] })}
      />,
    );
    expect(screen.queryByText("What's Included 🍃")).not.toBeInTheDocument();
  });
});

describe("ActivityDetails — favorite toggle", () => {
  it("shows a sign-in link instead of a toggle button for a signed-out visitor", () => {
    renderWithClient(
      <ActivityDetails detail={activityListingDetail} activity={makeActivityDetails()} />,
    );
    expect(screen.getByRole("link", { name: /add to favorites/i })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("lets a signed-in visitor toggle the favorite", () => {
    signIn();
    renderWithClient(
      <ActivityDetails detail={activityListingDetail} activity={makeActivityDetails()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /add to favorites/i }));
    expect(toggleFavoriteMutate).toHaveBeenCalledWith({
      listingId: activityListingDetail.listing.id,
      isFavorite: false,
    });
  });

  it("reflects an already-favorited listing as Saved", () => {
    signIn();
    isFavoriteState = true;
    renderWithClient(
      <ActivityDetails detail={activityListingDetail} activity={makeActivityDetails()} />,
    );
    expect(screen.getByRole("button", { name: "Saved" })).toBeInTheDocument();
  });
});
